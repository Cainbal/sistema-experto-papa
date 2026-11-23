# Cómo se hizo el modelo de la cámara

No hace falta correr esto para usar el sistema: el modelo ya está en `modelos/`.

1. `convertir.py`: arma a mano el grafo ONNX de MobileNet v1 con los pesos de Keras (ImageNet),
   fusionando cada BatchNormalization con su convolución. Pesos:
   `https://github.com/fchollet/deep-learning-models/releases/download/v0.6/mobilenet_1_0_224_tf_no_top.h5`
2. `verificar_tf.py`: compara el ONNX con MobileNet de TensorFlow/Keras en fotos reales.
   Diferencia máxima 1,7 × 10⁻⁵ (similitud coseno 0,99999994).
3. `entrenar.py`: calcula los vectores de 1024 números de cada foto (con espejo y recorte como
   aumentos), entrena la regresión logística, la evalúa y exporta `modelos/hoja_papa.onnx` y
   `modelos/hoja_papa.json`.
4. `comparar_redes.py` (experimento, no cambia el modelo): repite la prueba con solo fotos de campo
   usando MobileNet v1 y dos redes más modernas, EfficientNet-B0 y B3 con pesos Noisy Student.
   Resultado guardado en `comparacion_redes.json`: MobileNet 65 %, B0 61 %, B3 64 %, frente a 53 %
   de responder siempre la clase más común. Ninguna red mejora: el límite está en los datos de campo.

Datos usados: PlantVillage (papa: 1000 rancha, 1000 alternariosis, 152 sanas; separadas por hoja con
`leaf-map.json`) y PlantDoc (fotos de campo de papa: 105 rancha, 117 alternariosis).
Requisitos para reentrenar: `onnx`, `h5py`, `scikit-learn`, `onnxruntime`, `numpy`, `pillow`
(y `tensorflow` solo para la verificación; `tf-keras`, `efficientnet` y `keras_applications` solo
para la comparación de redes). Las rutas al inicio de `entrenar.py` apuntan a la
máquina donde se entrenó; cámbialas a donde tengas los datos.
