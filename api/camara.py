"""Cámara: clasifica la foto de una hoja de papa y la convierte en hechos para el motor.

Modelo: MobileNet v1 preentrenada (ImageNet) + regresión logística entrenada con fotos de papa
(ver camara/entrenar.py y modelos/hoja_papa.json, donde están las métricas).

La cámara no diagnostica sola. Devuelve tres hechos de percepción (foto_rancha, foto_alternaria,
foto_sana) con la probabilidad de cada clase, y el motor los combina con lo que el agricultor responde.
Se abstiene (no entrega hechos) cuando:
- la foto no se parece a ninguna hoja de papa del entrenamiento (detector por similitud), o
- la clase más probable no llega al umbral de confianza.

También calcula un mapa de calor por oclusión: tapa cada zona de la foto con gris y mide cuánto baja
la probabilidad de la clase elegida. Las zonas que más la bajan son las que el modelo "miró".
"""

from __future__ import annotations

import io
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUTA_MODELO = RAIZ / "modelos" / "hoja_papa.onnx"
RUTA_META = RAIZ / "modelos" / "hoja_papa.json"
GRILLA = 7          # mapa de calor de 7 x 7 zonas
VENTANA = 64        # tamaño del parche gris (píxeles sobre 224)

_sesion = None
_meta = None


class FotoInvalida(ValueError):
    pass


def disponible() -> str | None:
    """None si la cámara puede usarse; si no, el motivo."""
    try:
        import numpy  # noqa: F401
        import onnxruntime  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as error:
        return f"falta instalar {error.name} (pip install -r requirements-camara.txt)"
    if not RUTA_MODELO.exists() or not RUTA_META.exists():
        return "no se encontró el modelo en la carpeta modelos/"
    return None


def _cargar():
    global _sesion, _meta
    if _sesion is None:
        import onnxruntime as ort
        opciones = ort.SessionOptions()
        opciones.enable_cpu_mem_arena = False      # evita que onnxruntime se quede con memoria de más
        opciones.enable_mem_pattern = False
        _sesion = ort.InferenceSession(str(RUTA_MODELO), opciones, providers=["CPUExecutionProvider"])
        _meta = json.loads(RUTA_META.read_text(encoding="utf-8"))
    return _sesion, _meta


def preparar(contenido: bytes):
    import numpy as np
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        img = Image.open(io.BytesIO(contenido))
        img.load()
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise FotoInvalida("El archivo no es una imagen que se pueda abrir (usa JPG o PNG).") from error
    img = ImageOps.exif_transpose(img).convert("RGB")
    if min(img.size) < 64:
        raise FotoInvalida("La foto es demasiado pequeña.")
    x = np.asarray(img.resize((224, 224), Image.BILINEAR), np.float32) / 127.5 - 1.0
    return x, img.size


def analizar(contenido: bytes, con_mapa: bool = True) -> dict:
    import numpy as np
    sesion, meta = _cargar()
    x, tamano = preparar(contenido)
    embedding, prob = sesion.run(["embedding", "probabilidades"], {"imagen": x[None]})
    prob = prob[0]
    emb = embedding[0] / (np.linalg.norm(embedding[0]) + 1e-9)
    similitud = float((np.asarray(meta["centroides"], np.float32) @ emb).max())
    clases = meta["clases"]
    k = int(prob.argmax())
    confianza = float(prob[k])

    if similitud < meta["umbral_hoja"]:
        estado = "no_parece_hoja"
        mensaje = ("Esta foto no se parece a las hojas de papa con las que se entrenó el modelo. "
                   "Toma una sola hoja, de cerca, sobre un papel claro y con buena luz.")
    elif confianza < meta["umbral_confianza"]:
        estado = "no_seguro"
        mensaje = ("El modelo no está seguro entre las opciones. No se agregan hechos; responde las "
                   "preguntas para que el sistema decida.")
    else:
        estado = "ok"
        mensaje = f"La foto se parece a: {meta['nombres'][clases[k]]} ({confianza:.0%})."

    hechos = {}
    if estado == "ok":
        hechos = {meta["hechos"][c]: round(float(p), 3) for c, p in zip(clases, prob)}

    mapa = None
    if con_mapa and estado != "no_parece_hoja":
        paso = 224 // GRILLA
        lotes = []
        for fila in range(GRILLA):
            for col in range(GRILLA):
                tapada = x.copy()
                cy, cx = fila * paso + paso // 2, col * paso + paso // 2
                y0, y1 = max(0, cy - VENTANA // 2), min(224, cy + VENTANA // 2)
                x0, x1 = max(0, cx - VENTANA // 2), min(224, cx + VENTANA // 2)
                tapada[y0:y1, x0:x1, :] = 0.0          # gris medio en la escala [-1, 1]
                lotes.append(tapada)
        # En trozos de 7 para no disparar la memoria (49 de golpe pasa de 500 MB).
        prob_tapadas = np.concatenate([
            sesion.run(["probabilidades"], {"imagen": np.stack(lotes[i:i + 7])})[0][:, k]
            for i in range(0, len(lotes), 7)
        ])
        caida = np.clip(confianza - prob_tapadas, 0, None).reshape(GRILLA, GRILLA)
        mapa = (caida / caida.max()).round(3).tolist() if caida.max() > 1e-6 else caida.round(3).tolist()

    return {
        "estado": estado, "mensaje": mensaje,
        "clase": clases[k], "nombre": meta["nombres"][clases[k]], "confianza": round(confianza, 3),
        "probabilidades": {c: round(float(p), 3) for c, p in zip(clases, prob)},
        "nombres": meta["nombres"], "similitud_hoja": round(similitud, 3), "umbral_hoja": meta["umbral_hoja"],
        "umbral_confianza": meta["umbral_confianza"], "hechos": hechos, "mapa_calor": mapa,
        "tamano_original": list(tamano),
        "aviso": "Precisión medida: 97,7 % con fotos de laboratorio (hoja sobre fondo uniforme) y 56 % con fotos "
                 "de campo descargadas de internet. Por eso la foto es solo una evidencia más para el motor.",
    }
