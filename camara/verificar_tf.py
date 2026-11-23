"""Compara la salida del ONNX armado a mano con MobileNet de Keras (TensorFlow) en fotos reales."""
import glob, os, sys
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
import numpy as np
import onnxruntime as ort
from PIL import Image
import tensorflow as tf

H5, ONNX = sys.argv[1], sys.argv[2]
modelo = tf.keras.applications.MobileNet(weights=None, include_top=False, pooling="avg", input_shape=(224, 224, 3))
modelo.load_weights(H5)
sesion = ort.InferenceSession(ONNX, providers=["CPUExecutionProvider"])
fotos = sorted(glob.glob("datos/pv/raw/color/Potato___Late_blight/*"))[:6] + sorted(glob.glob("datos/plantdoc/repo/test/*/*"))[:6]
x = np.stack([np.asarray(Image.open(p).convert("RGB").resize((224, 224), Image.BILINEAR), np.float32) / 127.5 - 1 for p in fotos])
a = modelo.predict(x, verbose=0)
b = sesion.run(["embedding"], {"imagen": x})[0]
dif = np.abs(a - b)
cos = (a * b).sum(1) / np.linalg.norm(a, axis=1) / np.linalg.norm(b, axis=1)
print("fotos", len(fotos), "| diferencia máxima", dif.max(), "| diferencia media", dif.mean(), "| escala", np.abs(a).mean())
print("similitud coseno mínima", cos.min())
assert dif.max() < 1e-3 and cos.min() > 0.99999, "NO coincide"
print("OK: el ONNX reproduce a Keras")
