# Sistema experto difuso: plagas y enfermedades de la papa (zona andina)

Diagnostica 16 plagas y enfermedades de la papa a partir de lo que el agricultor observa, del clima que da el pronóstico y de la foto de una hoja. Dice qué tan posible es cada una, qué tan urgente
es actuar, explica su razonamiento y recomienda el manejo. Además avisa con días de anticipación
cuándo el clima favorece a la rancha.

**Pruébalo en línea:** https://sistema-experto-papa.onrender.com (la primera visita puede tardar
un minuto: el servidor gratuito se duerme cuando nadie lo usa).

Proyecto del curso Sistemas Inteligentes, Ingeniería de Sistemas, UNHEVAL (2026), con el
Mg. Marx Danly León Trujillo. Integrantes: Esther Jhadira León Flores, Cristina Reyes Lino y
Jack Roller Torres Caldas.

## Arquitectura

```
Entrada ──> Fuzzificación ──> Motor de inferencia (BH + BC) ──> Defuzzificación ──> Salida
respuestas   grados de         100 reglas SI-ENTONCES,          centroide de        posibilidad (%),
pronóstico   pertenencia       encadenamiento hacia adelante,   "posibilidad" y     urgencia, explicación
cámara       (trapecios)       Y = mínimo, O = suma prob.,      "urgencia"          y manejo
                               reglas de descarte
```

- **Conocimiento** (`conocimiento/`): guía del CIP (Pérez y Forbes, 2011), entrevista a un
  agricultor de Huánuco (Crispín Reyes Jesús, unos 30 años de experiencia) y tabla de Wallin (1962).
- **Calibración con Bayes** (`motor/calibracion.py`): convierte los puntajes del experto (qué tan
  típico es un síntoma) en pesos de reglas, usando la frecuencia de cada plaga en su zona.
- **Alerta de rancha** (`motor/wallin.py`, `api/clima.py`): modelo de Wallin en versión difusa con
  el pronóstico de Open-Meteo, que también da el clima de la consulta.
- **Cámara** (`api/camara.py`): MobileNet preentrenada + regresión logística (ONNX). Entra al motor
  como un hecho más, nunca decide sola.
- **Interfaz** (`web/`): React + Tailwind, con modo agricultor y modo técnico (gráficos difusos y red
  de razonamiento en vivo).

## Cómo ejecutarlo

En Windows: doble clic en **`iniciar.bat`**. En cualquier sistema (Python 3.10+):

    pip install -r requirements.txt -r requirements-camara.txt
    python -m uvicorn api.main:app --host 0.0.0.0 --port 8000

y abrir http://localhost:8000. La interfaz ya viene compilada en `web/dist` (no hace falta Node).
La cámara es opcional: sin `requirements-camara.txt` todo lo demás funciona.

El clima de la consulta puede escribirse a mano o traerse del pronóstico con el botón "Usar este
clima en una consulta" (página Alerta de rancha); la humedad del suelo se elige a ojo (seco, húmedo o encharcado).

Otras formas:

    python consola.py                     # consulta por consola, solo con la biblioteca estándar

## Pruebas y evaluación

    python -m unittest discover -s pruebas -v     # 64 pruebas: motor, calibración, Wallin, API e interfaz
    python pruebas/evaluar.py                     # regenera la página Evaluación

`test_interfaz.py` abre un navegador real (requiere `requirements-pruebas.txt` y Chrome o Chromium);
se salta sola si falta algo.

## Carpetas

| Carpeta | Contenido |
|---|---|
| `motor/` | Motor difuso (`motor.py`), conjuntos y defuzzificación (`difuso.py`), calibración (`calibracion.py`), Wallin (`wallin.py`) |
| `conocimiento/` | Base de conocimiento (hechos, reglas, plagas) y datos del experto |
| `api/` | Servidor FastAPI, clima y cámara |
| `modelos/` | Modelo de la cámara (`hoja_papa.onnx`) y sus métricas (`hoja_papa.json`) |
| `web/` | Interfaz (código en `src/`, compilada en `dist/`) |
| `pruebas/` | Pruebas automáticas, casos de la guía y evaluación |
| `camara/` | Scripts con los que se convirtió y entrenó el modelo de la cámara |
| `docs/` | Manual para correrlo y publicarlo |

## Documentación

- `docs/MANUAL_PUBLICACION.md`: correrlo, abrirlo en el celular y publicarlo en internet.

## Créditos de datos

- Pérez, W. y Forbes, G. (2011). *Guía de identificación de plagas que afectan a la papa en la zona andina*. CIP.
- Mohanty, S. P., Hughes, D. P. y Salathé, M. (2016). PlantVillage (CC BY-SA 3.0).
- Singh, D. et al. (2020). PlantDoc (CC BY 4.0).
- Howard, A. G. et al. (2017). MobileNets (pesos de Keras Applications).
- Pronóstico: Open-Meteo (uso no comercial).

El sistema orienta; no reemplaza la revisión de un agrónomo.
