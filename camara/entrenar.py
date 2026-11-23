"""Entrena y evalúa el clasificador de hojas (rancha, alternariosis, sana) y lo exporta a ONNX.

Aprendizaje por transferencia: MobileNet v1 preentrenada con ImageNet (congelada) convierte cada foto
en un vector de 1024 números; encima se entrena una regresión logística con fotos de papa.

Datos:
- PlantVillage (Mohanty et al., 2016; CC BY-SA 3.0): fotos de laboratorio, fondo uniforme.
  Hay varias fotos de la misma hoja, así que los grupos de prueba se separan POR HOJA (leaf-map.json),
  no por foto, para no evaluar con hojas que el modelo ya vio.
- PlantDoc (Singh et al., 2020; CC BY 4.0): fotos de campo descargadas de internet (solo rancha y
  alternariosis; no trae papa sana).

Uso: python camara/entrenar.py
"""

from __future__ import annotations

import glob
import json
import os
import time
from collections import Counter
from datetime import date

import numpy as np
import onnx
import onnxruntime as ort
from onnx import helper, numpy_helper
from PIL import Image, ImageOps
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

# Carpeta que contiene a sistema-experto-papa; ahí van datos/ (fotos) y modelos/ (MobileNet).
# Se puede cambiar con la variable de entorno RAIZ_CAMARA.
RAIZ = os.environ.get("RAIZ_CAMARA", os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PV = f"{RAIZ}/datos/pv"
PD = f"{RAIZ}/datos/plantdoc/repo"
EXTRACTOR = f"{RAIZ}/modelos/mobilenet_embedding.onnx"
CACHE = f"{RAIZ}/modelos/embeddings.npz"
SALIDA_ONNX = f"{RAIZ}/sistema-experto-papa/modelos/hoja_papa.onnx"
SALIDA_JSON = f"{RAIZ}/sistema-experto-papa/modelos/hoja_papa.json"
CLASES = ["rancha", "alternaria", "sana"]
NOMBRES = {"rancha": "Tizón tardío (rancha)", "alternaria": "Alternariosis", "sana": "Hoja sana"}
CARPETAS_PV = {"rancha": "Potato___Late_blight", "alternaria": "Potato___Early_blight", "sana": "Potato___healthy"}
CARPETAS_PD = {"rancha": "Potato leaf late blight", "alternaria": "Potato leaf early blight"}
OTRAS_HOJAS = ["Apple leaf", "Bell_pepper leaf", "Corn leaf blight", "grape leaf", "Soyabean leaf"]
SEMILLA = 7


def cargar(ruta: str, vista: str = "original") -> np.ndarray:
    img = ImageOps.exif_transpose(Image.open(ruta)).convert("RGB")
    if vista == "espejo":
        img = ImageOps.mirror(img)
    elif vista == "recorte":
        w, h = img.size
        img = img.crop((int(w * 0.1), int(h * 0.1), int(w * 0.9), int(h * 0.9)))
    return np.asarray(img.resize((224, 224), Image.BILINEAR), np.float32) / 127.5 - 1.0


def embeddings(sesion, rutas: list, vista: str) -> np.ndarray:
    salida = []
    for i in range(0, len(rutas), 32):
        lote = np.stack([cargar(r, vista) for r in rutas[i:i + 32]])
        salida.append(sesion.run(["embedding"], {"imagen": lote})[0])
    return np.concatenate(salida)


def inventario():
    mapa = json.load(open(f"{PV}/leaf-map.json"))
    filas = []
    for clase, carpeta in CARPETAS_PV.items():
        for r in sorted(glob.glob(f"{PV}/raw/color/{carpeta}/*")):
            codigo = os.path.splitext(os.path.basename(r).split("___")[-1])[0].lower()
            filas.append({"ruta": r, "clase": clase, "origen": "plantvillage", "grupo": mapa[codigo][0]})
    for clase, carpeta in CARPETAS_PD.items():
        for parte in ("train", "test"):
            for r in sorted(glob.glob(f"{PD}/{parte}/{carpeta}/*")):
                filas.append({"ruta": r, "clase": clase, "origen": "plantdoc", "grupo": r})
    otras = [{"ruta": r, "clase": "otra", "origen": c, "grupo": r}
             for c in OTRAS_HOJAS for r in sorted(glob.glob(f"{PD}/train/{c}/*"))]
    tomate = [{"ruta": r, "clase": "otra", "origen": "Tomato leaf late blight", "grupo": r}
              for r in sorted(glob.glob(f"{PD}/train/Tomato leaf late blight/*"))]
    return filas, otras, tomate


def calcular_embeddings(filas, otras, tomate):
    if os.path.exists(CACHE):
        z = np.load(CACHE, allow_pickle=True)
        if list(z["rutas"]) == [f["ruta"] for f in filas + otras + tomate]:
            return z["original"], z["espejo"], z["recorte"]
    sesion = ort.InferenceSession(EXTRACTOR, providers=["CPUExecutionProvider"])
    rutas = [f["ruta"] for f in filas + otras + tomate]
    t = time.time()
    vistas = {}
    for vista in ("original", "espejo", "recorte"):
        lista = rutas if vista == "original" else rutas[:len(filas)]
        vistas[vista] = embeddings(sesion, lista, vista)
        print(f"  vista {vista}: {len(lista)} fotos en {time.time() - t:.0f} s", flush=True)
    np.savez_compressed(CACHE, rutas=np.array(rutas, dtype=object), **vistas)
    return vistas["original"], vistas["espejo"], vistas["recorte"]


class Clasificador:
    """Estandarización + regresión logística multinomial."""

    def __init__(self, C=0.5):
        self.C = C

    def entrenar(self, X, y):
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-6
        self.lr = LogisticRegression(C=self.C, class_weight="balanced", max_iter=5000)
        self.lr.fit((X - self.mu) / self.sd, y)
        return self

    def probabilidades(self, X):
        return self.lr.predict_proba((X - self.mu) / self.sd)


def con_aumentos(idx, original, espejo, recorte, y):
    X = np.concatenate([original[idx], espejo[idx], recorte[idx]])
    return X, np.concatenate([y[idx]] * 3)


def resumen(y_real, prob, umbral):
    pred = prob.argmax(1)
    conf = prob.max(1)
    aceptadas = conf >= umbral
    etiquetas = sorted(set(y_real) | set(pred))
    return {
        "n": int(len(y_real)),
        "exactitud": round(float((pred == y_real).mean()), 4),
        "recall_por_clase": {CLASES[c]: round(float((pred[y_real == c] == c).mean()), 4)
                             for c in sorted(set(y_real))},
        "matriz_confusion": {"filas_reales": [CLASES[c] for c in range(3)], "columnas_predichas": CLASES,
                             "valores": confusion_matrix(y_real, pred, labels=[0, 1, 2]).tolist()},
        "con_abstencion": {"umbral": umbral, "cobertura": round(float(aceptadas.mean()), 4),
                           "exactitud_aceptadas": round(float((pred[aceptadas] == y_real[aceptadas]).mean()), 4)
                           if aceptadas.any() else None},
        "_etiquetas": etiquetas,
    }


def similitud_centroides(X, centroides):
    Xn = X / np.linalg.norm(X, axis=1, keepdims=True)
    return (Xn @ centroides.T).max(1)


def exportar(modelo: Clasificador, centroides, umbral_ood, umbral, metricas):
    base = onnx.load(EXTRACTOR)
    g = base.graph
    W = modelo.lr.coef_ / modelo.sd                      # la estandarización se mete en los pesos
    b = modelo.lr.intercept_ - (modelo.lr.coef_ * modelo.mu / modelo.sd).sum(1)
    g.initializer.extend([numpy_helper.from_array(W.T.astype(np.float32), "clf_w"),
                          numpy_helper.from_array(b.astype(np.float32), "clf_b")])
    g.node.extend([helper.make_node("Gemm", ["embedding", "clf_w", "clf_b"], ["logits"]),
                   helper.make_node("Softmax", ["logits"], ["probabilidades"], axis=1)])
    g.output.append(helper.make_tensor_value_info("probabilidades", onnx.TensorProto.FLOAT, ["N", 3]))
    onnx.checker.check_model(base)
    os.makedirs(os.path.dirname(SALIDA_ONNX), exist_ok=True)
    onnx.save(base, SALIDA_ONNX)
    meta = {
        "version": "2.0", "fecha": date.today().isoformat(),
        "clases": CLASES, "nombres": NOMBRES,
        "hechos": {"rancha": "foto_rancha", "alternaria": "foto_alternaria", "sana": "foto_sana"},
        "entrada": {"tamano": 224, "formato": "NHWC RGB", "escala": "x / 127.5 - 1", "redimension": "bilineal, foto completa"},
        "umbral_confianza": umbral, "umbral_hoja": round(float(umbral_ood), 4),
        "centroides": np.round(centroides, 5).tolist(),
        "arquitectura": "MobileNet v1 (ImageNet, congelada) + regresión logística multinomial (C=%s)" % modelo.C,
        "datos": [
            "PlantVillage: Mohanty, S. P., Hughes, D. P. y Salathé, M. (2016). Using deep learning for image-based plant "
            "disease detection. Frontiers in Plant Science, 7, 1419. https://doi.org/10.3389/fpls.2016.01419 (CC BY-SA 3.0)",
            "PlantDoc: Singh, D., Jain, N., Jain, P., Kayal, P., Kumawat, S. y Batra, N. (2020). PlantDoc: A dataset for visual "
            "plant disease detection. CoDS-COMAD 2020, 249-253. https://doi.org/10.1145/3371158.3371196 (CC BY 4.0)",
            "Pesos de MobileNet: Howard, A. G. et al. (2017). MobileNets. arXiv:1704.04861 (pesos de Keras Applications)",
        ],
        "metricas": metricas,
    }
    json.dump(meta, open(SALIDA_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("exportado", SALIDA_ONNX, os.path.getsize(SALIDA_ONNX) // 1024, "KB")


def main():
    filas, otras, tomate = inventario()
    print("fotos:", Counter((f["origen"], f["clase"]) for f in filas), "| otras hojas:", len(otras), "| tomate:", len(tomate))
    original, espejo, recorte = calcular_embeddings(filas, otras, tomate)
    n = len(filas)
    y = np.array([CLASES.index(f["clase"]) for f in filas])
    grupos = np.array([f["grupo"] for f in filas])
    es_pv = np.array([f["origen"] == "plantvillage" for f in filas])
    es_pd = ~es_pv
    UMBRAL = 0.6
    rng = np.random.RandomState(SEMILLA)

    # 1. Elegir C con validación cruzada agrupada (sobre todo el conjunto de papa)
    mejores = {}
    for C in (0.05, 0.1, 0.3, 1.0):
        aciertos = []
        for tr, te in StratifiedGroupKFold(5, shuffle=True, random_state=SEMILLA).split(original[:n], y, grupos):
            Xtr, ytr = con_aumentos(tr, original, espejo, recorte, y)
            p = Clasificador(C).entrenar(Xtr, ytr).probabilidades(original[te])
            aciertos.append(((p.argmax(1) == y[te]) & es_pd[te]).sum() / max(1, es_pd[te].sum()))
        mejores[C] = float(np.mean(aciertos))
        print(f"  C={C}: exactitud en fotos de campo (CV) {mejores[C]:.3f}", flush=True)
    C = max(mejores, key=mejores.get)

    # 2. Laboratorio: PlantVillage separado por hoja (5 grupos), entrenando solo con PlantVillage
    idx_pv = np.where(es_pv)[0]
    prob_lab = np.zeros((n, 3))
    for tr, te in StratifiedGroupKFold(5, shuffle=True, random_state=SEMILLA).split(idx_pv, y[idx_pv], grupos[idx_pv]):
        Xtr, ytr = con_aumentos(idx_pv[tr], original, espejo, recorte, y)
        prob_lab[idx_pv[te]] = Clasificador(C).entrenar(Xtr, ytr).probabilidades(original[idx_pv[te]])
    lab = resumen(y[idx_pv], prob_lab[idx_pv], UMBRAL)

    # 3. Campo sin fotos de campo en el entrenamiento: entrenar con todo PlantVillage, probar en PlantDoc
    idx_pd = np.where(es_pd)[0]
    Xtr, ytr = con_aumentos(idx_pv, original, espejo, recorte, y)
    solo_lab = Clasificador(C).entrenar(Xtr, ytr)
    campo_sin = resumen(y[idx_pd], solo_lab.probabilidades(original[idx_pd]), UMBRAL)

    # 4. Campo con fotos de campo: PlantVillage completo + 4/5 de PlantDoc, probar en el 1/5 restante
    prob_campo = np.zeros((n, 3))
    for tr, te in StratifiedKFold(5, shuffle=True, random_state=SEMILLA).split(idx_pd, y[idx_pd]):
        entren = np.concatenate([idx_pv, idx_pd[tr]])
        Xtr, ytr = con_aumentos(entren, original, espejo, recorte, y)
        prob_campo[idx_pd[te]] = Clasificador(C).entrenar(Xtr, ytr).probabilidades(original[idx_pd[te]])
    campo = resumen(y[idx_pd], prob_campo[idx_pd], UMBRAL)
    curva = []
    for u in (0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        conf = prob_campo[idx_pd].max(1)
        ok = prob_campo[idx_pd].argmax(1) == y[idx_pd]
        acept = conf >= u
        curva.append({"umbral": u, "cobertura": round(float(acept.mean()), 3),
                      "exactitud": round(float(ok[acept].mean()), 3) if acept.any() else None})

    # 5. Modelo final con todas las fotos de papa
    Xtr, ytr = con_aumentos(np.arange(n), original, espejo, recorte, y)
    final = Clasificador(C).entrenar(Xtr, ytr)
    normal = original[:n] / np.linalg.norm(original[:n], axis=1, keepdims=True)
    centroides = np.stack([normal[y == c].mean(0) for c in range(3)])
    centroides /= np.linalg.norm(centroides, axis=1, keepdims=True)
    sim_entren = similitud_centroides(original[:n], centroides)
    umbral_ood = float(np.percentile(sim_entren, 2))
    sim_otras = similitud_centroides(original[n:n + len(otras)], centroides)
    sim_tomate = similitud_centroides(original[n + len(otras):], centroides)
    prob_tomate = final.probabilidades(original[n + len(otras):])
    hojas = {
        "umbral_similitud": round(umbral_ood, 4),
        "fotos_de_papa_aceptadas": round(float((sim_entren >= umbral_ood).mean()), 3),
        "otras_plantas_rechazadas": round(float((sim_otras < umbral_ood).mean()), 3),
        "otras_plantas_n": len(otras),
        "tomate_con_rancha_rechazadas": round(float((sim_tomate < umbral_ood).mean()), 3),
        "tomate_con_rancha_clasificadas_como_rancha": round(float((prob_tomate.argmax(1) == 0).mean()), 3),
        "tomate_n": len(tomate),
    }
    for r in (lab, campo_sin, campo):
        r.pop("_etiquetas")
    metricas = {
        "C_elegido": C, "busqueda_C": mejores, "umbral_confianza": UMBRAL,
        "laboratorio_plantvillage": lab,
        "campo_plantdoc_sin_fotos_de_campo_en_entrenamiento": campo_sin,
        "campo_plantdoc_con_fotos_de_campo": campo,
        "campo_curva_abstencion": curva,
        "detector_de_hoja": hojas,
        "fotos": {"plantvillage": int(es_pv.sum()), "plantdoc": int(es_pd.sum()),
                  "por_clase": {CLASES[c]: int((y == c).sum()) for c in range(3)},
                  "hojas_distintas_plantvillage": int(len(set(grupos[es_pv])))},
    }
    print(json.dumps({k: v for k, v in metricas.items()}, ensure_ascii=False, indent=1))
    exportar(final, centroides, umbral_ood, UMBRAL, metricas)


if __name__ == "__main__":
    main()
