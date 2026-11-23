"""Compara extractores de características con las fotos de campo (PlantDoc).

Pregunta: ¿la cámara falla en el campo por culpa de la red (MobileNet v1, de 2017) o por los datos?
Se prueba el mismo protocolo con tres redes congeladas:

- MobileNet v1 (Howard et al., 2017), la que usa el sistema.
- EfficientNet-B0 y EfficientNet-B3 (Tan y Le, 2019) con pesos Noisy Student (Xie et al., 2020),
  más modernas y entrenadas para ser robustas a fotos difíciles.

Protocolo: solo las 222 fotos de campo de PlantDoc (rancha y alternariosis; no hay papa sana),
estandarización + clasificador (SVM o regresión logística), validación cruzada estratificada de
5 pliegues repetida con 3 semillas. Se reporta la exactitud media.

Requisitos extra (solo para este experimento): tensorflow, tf-keras, efficientnet, keras_applications,
scikit-learn y los pesos sin la capa final:
  https://github.com/qubvel/efficientnet/releases/download/v0.0.1/efficientnet-b0_noisy-student_notop.h5
  https://github.com/qubvel/efficientnet/releases/download/v0.0.1/efficientnet-b3_noisy-student_notop.h5

Uso: TF_USE_LEGACY_KERAS=1 python camara/comparar_redes.py
"""

from __future__ import annotations

import json
import os
import time
from collections import Counter

os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

import entrenar as E

PESOS = f"{E.RAIZ}/modelos/eff"
SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "comparacion_redes.json")
CLASIFICADORES = {
    "svm_c3": lambda: SVC(C=3),
    "logistica_c0.1": lambda: LogisticRegression(C=0.1, max_iter=5000),
    "logistica_c1": lambda: LogisticRegression(C=1, max_iter=5000),
}


def emb_mobilenet(rutas):
    sesion = ort.InferenceSession(E.EXTRACTOR, providers=["CPUExecutionProvider"])
    return E.embeddings(sesion, rutas, "original")


def emb_efficientnet(rutas, variante: str, lado: int):
    import efficientnet.tfkeras as efn

    red = getattr(efn, f"EfficientNet{variante}")(weights=None, include_top=False, pooling="avg",
                                                   input_shape=(lado, lado, 3))
    red.load_weights(f"{PESOS}/efficientnet-{variante.lower()}_noisy-student_notop.h5")

    def cargar(r):
        img = ImageOps.exif_transpose(Image.open(r)).convert("RGB").resize((lado, lado), Image.BICUBIC)
        return np.asarray(img, np.float32)

    return np.concatenate([red.predict(efn.preprocess_input(np.stack([cargar(r) for r in rutas[i:i + 16]])),
                                       verbose=0) for i in range(0, len(rutas), 16)])


def evaluar(X, y):
    resultado = {}
    for nombre, crear in CLASIFICADORES.items():
        accs = [float((cross_val_predict(make_pipeline(StandardScaler(), crear()), X, y,
                                         cv=StratifiedKFold(5, shuffle=True, random_state=s)) == y).mean())
                for s in range(3)]
        resultado[nombre] = round(float(np.mean(accs)), 3)
    return resultado


def main():
    filas, _, _ = E.inventario()
    campo = [f for f in filas if f["origen"] == "plantdoc"]
    rutas = [f["ruta"] for f in campo]
    y = np.array([E.CLASES.index(f["clase"]) for f in campo])
    conteo = Counter(f["clase"] for f in campo)
    base = max(conteo.values()) / len(campo)
    print(f"{len(campo)} fotos de campo: {dict(conteo)}; acertar siempre la clase mayoritaria = {base:.3f}")

    redes = {
        "MobileNet v1 (ImageNet)": lambda: emb_mobilenet(rutas),
        "EfficientNet-B0 (Noisy Student)": lambda: emb_efficientnet(rutas, "B0", 224),
        "EfficientNet-B3 (Noisy Student)": lambda: emb_efficientnet(rutas, "B3", 300),
    }
    informe = {"fotos": len(campo), "clases": dict(conteo), "linea_base_mayoritaria": round(base, 3),
               "protocolo": "StandardScaler + clasificador; StratifiedKFold(5) x 3 semillas; exactitud media",
               "redes": {}}
    for nombre, calcular in redes.items():
        t = time.time()
        X = calcular()
        res = evaluar(X, y)
        informe["redes"][nombre] = {"dimension": int(X.shape[1]), "exactitud": res, "mejor": max(res.values()),
                                    "segundos_extraccion": round(time.time() - t, 1)}
        print(f"{nombre:34s} dim={X.shape[1]:5d}  {res}  mejor={max(res.values()):.3f}")

    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(informe, f, ensure_ascii=False, indent=2)
    print("Guardado en", SALIDA)


if __name__ == "__main__":
    main()
