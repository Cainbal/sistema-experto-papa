"""Convierte MobileNet v1 (Keras, pesos ImageNet) a ONNX armando el grafo a mano.

- Entrada: imágenes NHWC float32 [N, 224, 224, 3] ya escaladas a [-1, 1].
- Salida "embedding": vector de 1024 números por imagen (promedio global de la última capa).
- Las capas de BatchNormalization se fusionan en los pesos de la convolución anterior.
"""
import sys
import h5py
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

H5 = sys.argv[1]
SALIDA = sys.argv[2]
EPS = 1e-3
f = h5py.File(H5, "r")


def peso(capa, nombre):
    g = f[capa]
    for w in g.attrs["weight_names"]:
        w = w.decode() if isinstance(w, bytes) else w
        if w.split("/")[-1].startswith(nombre):
            return np.array(g[w])
    raise KeyError(capa, nombre)


def fusionar(kernel_onnx, capa_bn):
    gamma, beta = peso(capa_bn, "gamma"), peso(capa_bn, "beta")
    media, var = peso(capa_bn, "moving_mean"), peso(capa_bn, "moving_variance")
    escala = gamma / np.sqrt(var + EPS)
    return (kernel_onnx * escala[:, None, None, None]).astype(np.float32), (beta - media * escala).astype(np.float32)


nodos, inits = [], []
inits.append(numpy_helper.from_array(np.array(0.0, np.float32), "cero"))
inits.append(numpy_helper.from_array(np.array(6.0, np.float32), "seis"))
nodos.append(helper.make_node("Transpose", ["imagen"], ["x0"], perm=[0, 3, 1, 2]))
actual = "x0"


def conv(nombre, kernel_keras, capa_bn, stride, grupo=1, depthwise=False):
    global actual
    if depthwise:   # (kh, kw, in, 1) -> (in, 1, kh, kw)
        k = kernel_keras.transpose(2, 3, 0, 1)
    else:           # (kh, kw, in, out) -> (out, in, kh, kw)
        k = kernel_keras.transpose(3, 2, 0, 1)
    w, b = fusionar(k, capa_bn)
    inits.append(numpy_helper.from_array(w, f"{nombre}_w"))
    inits.append(numpy_helper.from_array(b, f"{nombre}_b"))
    kh = k.shape[2]
    if kh == 1:
        pads = [0, 0, 0, 0]
    elif stride == 1:
        pads = [1, 1, 1, 1]
    else:           # 'same' de TensorFlow con paso 2 y entrada par: 0 arriba/izquierda, 1 abajo/derecha
        pads = [0, 0, 1, 1]
    nodos.append(helper.make_node("Conv", [actual, f"{nombre}_w", f"{nombre}_b"], [f"{nombre}_c"],
                                  kernel_shape=[kh, kh], strides=[stride, stride], pads=pads, group=grupo))
    nodos.append(helper.make_node("Clip", [f"{nombre}_c", "cero", "seis"], [f"{nombre}_r"]))  # ReLU6
    actual = f"{nombre}_r"


conv("conv1", peso("conv1", "kernel"), "conv1_bn", 2)
pasos = {2: 2, 4: 2, 6: 2, 12: 2}
canales = 32
for i in range(1, 14):
    s = pasos.get(i, 1)
    conv(f"dw{i}", peso(f"conv_dw_{i}", "depthwise_kernel"), f"conv_dw_{i}_bn", s, grupo=canales, depthwise=True)
    kpw = peso(f"conv_pw_{i}", "kernel")
    conv(f"pw{i}", kpw, f"conv_pw_{i}_bn", 1)
    canales = kpw.shape[3]

nodos.append(helper.make_node("GlobalAveragePool", [actual], ["gap"]))
nodos.append(helper.make_node("Flatten", ["gap"], ["embedding"], axis=1))
grafo = helper.make_graph(nodos, "mobilenet_v1_embedding",
                          [helper.make_tensor_value_info("imagen", TensorProto.FLOAT, ["N", 224, 224, 3])],
                          [helper.make_tensor_value_info("embedding", TensorProto.FLOAT, ["N", 1024])], inits)
modelo = helper.make_model(grafo, opset_imports=[helper.make_opsetid("", 13)], producer_name="sistema-experto-papa")
modelo.ir_version = 8
onnx.checker.check_model(modelo)
onnx.save(modelo, SALIDA)
print("guardado", SALIDA, "nodos", len(nodos))
