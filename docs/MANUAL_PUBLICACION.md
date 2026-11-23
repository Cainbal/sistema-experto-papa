# Manual: correr el sistema y publicarlo con un código QR

Hay dos formas de mostrarlo desde un celular:

| | Red local (laptop) | Internet (Render) |
|---|---|---|
| Qué necesitas | La laptop y el celular en la misma red WiFi o hotspot | Una cuenta de GitHub y otra de Render (gratis) |
| Dirección | `http://192.168.x.x:8000` | `https://sistema-experto-papa.onrender.com` (o parecido) |
| Ventaja | No depende de internet | Cualquiera lo abre, desde cualquier lugar |
| Cuidado | Firewall de Windows | Si nadie lo usa en 15 minutos se "duerme" y tarda ~1 minuto en despertar |

Para la exposición basta la **red local**. Render es opcional y sirve como respaldo.

## A. Correr en la laptop

1. Python 3.10 o superior instalado (al instalarlo, marca **Add python.exe to PATH**).
2. Doble clic en `iniciar.bat`. La primera vez instala lo necesario (FastAPI, Uvicorn y, para la
   cámara, onnxruntime, numpy y Pillow) y abre el navegador en `http://localhost:8000`.
3. Si Windows pregunta por el firewall, marca **Redes privadas** y **Permitir acceso**.
4. En la página pulsa **Abrir en el celular**: muestra un código QR con la dirección de la laptop
   en la red. El celular tiene que estar en la misma red.

Si el QR no abre en el celular:

- Revisa que ambos estén en la misma red (en el hotspot del celular es lo más seguro).
- Si la red de Windows quedó como "pública", cámbiala a **privada** (Configuración → Red e
  Internet → la red → Tipo de perfil de red → Privada).
- Crea la regla del firewall (PowerShell como administrador):

  ```powershell
  New-NetFirewallRule -DisplayName "Sistema experto papa" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
  ```

## B. Publicar en internet (Render)

Es el link que se le da al ingeniero: abre el sistema desde cualquier celular o computadora,
sin instalar nada. El código está en GitHub (`github.com/Cainbal/sistema-experto-papa`) y Render lo
publica desde ahí. Dentro de la página, «Abrir en el celular» muestra un QR con el link público, que
funciona desde cualquier red.

### 1. Subir el proyecto a GitHub

El repositorio ya está creado y con el código. Esto es solo por si algún día hay que subirlo de
nuevo desde cero.

La forma más fácil, sin comandos, es **GitHub Desktop**:

1. Instala GitHub Desktop e inicia sesión con tu cuenta (Cainbal).
2. File → Add local repository → elige la carpeta `sistema-experto-papa`. Si dice que no es un
   repositorio, pulsa **create a repository** ahí mismo.
3. Escribe un resumen (por ejemplo "Sistema experto v2") y pulsa **Commit to main**.
4. Pulsa **Publish repository**. Puede ser público o privado (Render puede leer los dos).

El archivo `.gitignore` ya evita subir `node_modules`. El modelo de
la cámara (`modelos/hoja_papa.onnx`, 12,5 MB) sí se sube; GitHub acepta archivos de hasta 100 MB.

### 2. Crear el servicio en Render

1. Entra a render.com y crea una cuenta con **Sign in with GitHub**.
2. Pulsa **New +** → **Blueprint** y elige el repositorio `sistema-experto-papa`. Render lee el
   archivo `render.yaml` (servicio web, Docker, plan gratis).
   - Si prefieres hacerlo a mano: **New +** → **Web Service** → el repositorio → Language:
     **Docker** → Instance type: **Free** → Create.
3. Espera a que termine (la primera vez 5 a 10 minutos). Cuando diga **Live**, abre la dirección
   que aparece arriba (algo como `https://sistema-experto-papa.onrender.com`).
4. Comprueba que `https://.../api/base` muestra datos y que la página carga.
5. Dentro de la página, **Abrir en el celular** ya muestra el QR con la dirección pública.

Cada vez que subas cambios a GitHub (Commit + Push en GitHub Desktop), Render vuelve a publicar solo.

### Cómo cambiar algo después

Render vuelve a publicar solo cada vez que cambia algo en GitHub (tarda 5 a 10 minutos).

- **Un texto o una regla, sin instalar nada:** en `github.com/Cainbal/sistema-experto-papa` abre el
  archivo, pulsa el lápiz (*Edit this file*), cambia lo que necesites y pulsa **Commit changes**.
- **La base de conocimiento** está en `conocimiento/base_conocimiento.json` (hechos y reglas) y
  `conocimiento/experto_crispin.json` (lo que dijo el experto). Después de cambiarla, en la laptop
  corre `python -m unittest discover -s pruebas` (que pasen todas) y `python pruebas/evaluar.py`;
  copia `web/public/evaluacion.json` encima de `web/dist/evaluacion.json` y sube los dos, para que
  la página Evaluación muestre los números nuevos.
- **La interfaz** (`web/src`) necesita Node.js 20 o más nuevo: `cd web`, `npm install`,
  `npm run build`, y sube la carpeta `web/dist` completa.
- Para cambios grandes conviene GitHub Desktop: **File → Clone repository →
  Cainbal/sistema-experto-papa**, cambias los archivos en tu laptop, **Commit to main** y **Push origin**.

### 3. El día de la exposición

- Abre la dirección de Render **2 minutos antes** para despertarla.
- En Render el clima de la consulta sale del pronóstico ("Usar este clima en una consulta").
- El pronóstico real (Open-Meteo) lo pide el servidor. Si la red de la universidad bloquea
  servicios externos, en la laptop verás los datos de ejemplo; en Render igual funciona, porque
  quien lo pide es el servidor de Render.

## C. Si algo falla

| Problema | Qué hacer |
|---|---|
| `python` no se reconoce | Reinstala Python marcando *Add python.exe to PATH* o usa `py` en vez de `python`. |
| `pip install` falla en la cámara | El resto funciona; la página Cámara explica qué falta. Prueba `python -m pip install --upgrade pip` y vuelve a intentar. |
| La página dice "No se pudo conectar con el servidor" | La ventana negra de `iniciar.bat` se cerró o mostró un error: léelo y vuelve a abrirla. |
| La alerta dice "Datos de ejemplo (sin internet)" | No hay internet o la red bloquea Open-Meteo. Los datos de ejemplo están marcados como tales; dilo así en la exposición. |
| Render se queda en "Build failed" | Abre el log del build: casi siempre es un archivo que no se subió a GitHub (revisa que estén `web/dist` y `modelos`). |
| El link tarda en abrir | El plan gratis de Render se duerme si nadie lo usa en 15 minutos: la primera visita tarda cerca de un minuto. Ábrelo antes de que lo usen. |
| El link dice que el servicio no existe | Entra a render.com con tu GitHub: el servicio se llama `sistema-experto-papa`. Si se borró, repite el paso 2 (Blueprint). |

## D. Comandos útiles

```bash
python -m unittest discover -s pruebas -v      # todas las pruebas
python pruebas/evaluar.py                      # recalcula la página Evaluación
python consola.py                              # consulta por consola
cd web && npm install && npm run build         # solo si cambias la interfaz (requiere Node 20+)
```
