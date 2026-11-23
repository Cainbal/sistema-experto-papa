"""API del sistema experto (FastAPI).

Ejecutar desde la carpeta del proyecto:

    uvicorn api.main:app --reload

Para que un celular de la misma red pueda entrar:

    uvicorn api.main:app --host 0.0.0.0 --port 8000

La API no guarda el estado de la consulta: el navegador envía en cada llamada todos los hechos
conocidos y el motor vuelve a razonar desde cero. Así cada respuesta es reproducible y se puede
deshacer una respuesta sin más. No se guarda nada en el servidor.
"""

from __future__ import annotations

import socket
import time
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from motor import cargar_base, grupo_manejo, inferir, que_distingue, siguiente_pregunta, texto_premisa
from motor import difuso, wallin

from . import clima

RAIZ = Path(__file__).resolve().parent.parent
BASE = cargar_base()
WEB = RAIZ / "web" / "dist"

try:                                    # la cámara es opcional: necesita onnxruntime, numpy y pillow
    from . import camara
    CAMARA_ERROR = camara.disponible()
except Exception as error:              # pragma: no cover - depende de lo instalado
    camara = None
    CAMARA_ERROR = f"{type(error).__name__}: {error}"

app = FastAPI(title="Sistema experto difuso: plagas y enfermedades de la papa", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Consulta(BaseModel):
    hechos: dict[str, float] = Field(default_factory=dict)
    partes: list[str] = Field(default_factory=list)




RANGOS_MEDICION = {"temperatura": (-20, 60), "humedad_relativa": (0, 100), "humedad_suelo": (0, 100),
                   "plantas_afectadas": (0, 100), "dsv_rancha": (0, 4)}


def _validar(consulta: Consulta) -> None:
    for hecho, valor in consulta.hechos.items():
        definicion = BASE.hechos.get(hecho)
        if definicion is None or definicion["tipo"] == "derivado":
            raise HTTPException(422, f"Hecho desconocido: {hecho}")
        if definicion["tipo"] == "medicion":
            lo, hi = RANGOS_MEDICION[hecho]
            if not lo <= valor <= hi:
                raise HTTPException(422, f"'{hecho}' debe estar entre {lo} y {hi}")
        elif definicion["tipo"] == "percepcion":
            if not 0 <= valor <= 1:
                raise HTTPException(422, f"'{hecho}' debe estar entre 0 y 1")
        elif not -1 <= valor <= 1:
            raise HTTPException(422, f"La respuesta de '{hecho}' debe estar entre -1 y 1")
    for parte in consulta.partes:
        if parte not in BASE.partes or parte == "condiciones":
            raise HTTPException(422, f"Parte desconocida: {parte}")


def _hipotesis(h) -> dict:
    plaga = BASE.plagas[h.id]
    datos = asdict(h)
    datos["ficha"] = {k: plaga.get(k) for k in ("otros_nombres", "agente", "tipo", "ficha", "fase", "transmision",
                                                 "manejo", "nombres_locales", "frecuencia_zona", "nota_experto")}
    return datos


def _regla(r: dict) -> dict:
    concl = r["entonces"]
    es_plaga = concl in BASE.plagas
    return {
        "id": r["id"], "tipo": r["tipo"], "fc": r["fc"], "ficha": r["ficha"], "fuente": r.get("fuente", "guia"),
        "si": [texto_premisa(BASE, p) for p in r["si"]],
        "si_hechos": [p if isinstance(p, str) else p["hecho"] for p in r["si"]],
        "entonces": concl,
        "entonces_texto": BASE.plagas[concl]["nombre"] if es_plaga else BASE.hechos[concl]["pregunta"],
        "es_derivacion": not es_plaga,
        "sentido": "-" if r["tipo"] == "descarte" else ("+" if es_plaga else "="),
        "fc_guia": r.get("fc_guia"), "calibracion": r.get("calibracion"),
    }


@app.get("/api/base")
def base():
    """Todo lo que la interfaz necesita mostrar: partes, hechos, plagas, reglas y conjuntos difusos."""
    experto = BASE.experto
    return {
        "meta": BASE.meta,
        "partes": {k: v for k, v in BASE.partes.items() if k != "condiciones"},
        "hechos": BASE.hechos,
        "plagas": list(BASE.plagas.values()),
        "reglas": [_regla(r) for r in BASE.reglas],
        "variables": difuso.VARIABLES,
        "wallin": {"reglas": wallin.reglas_wallin(), "umbrales": wallin.UMBRALES, "bandas": wallin.BANDAS},
        "calibracion": BASE.calibracion,
        "experto": {k: experto.get(k) for k in ("experto", "frecuencia_zona", "nombres_locales", "descartes",
                                                 "grupos_manejo", "orden_revision", "notas", "casos",
                                                 "combinaciones_no_usadas")},
        "camara": {"disponible": CAMARA_ERROR is None, "motivo": CAMARA_ERROR},
    }


@app.post("/api/consulta")
def consulta(datos: Consulta):
    """Fuzzifica, razona con los hechos conocidos, defuzzifica y propone la siguiente pregunta."""
    _validar(datos)
    resultado = inferir(BASE, datos.hechos)
    siguiente = siguiente_pregunta(BASE, datos.hechos, datos.partes or None)
    return {
        "diagnosticos": [_hipotesis(h) for h in resultado.diagnosticos],
        "riesgos": [_hipotesis(h) for h in resultado.riesgos],
        "descartadas": [{k: v for k, v in d.items() if k != "disparos"} | {"disparos": [asdict(x) for x in d["disparos"]]}
                        for d in resultado.descartadas],
        "derivados": {k: {"texto": BASE.hechos[k]["pregunta"], "certeza": round(v, 3)}
                      for k, v in resultado.derivados.items()},
        "fuzzificacion": resultado.fuzzificacion,
        "urgencia": resultado.urgencia,
        "grupo_manejo": grupo_manejo(BASE, resultado),
        "traza": [asdict(d) for d in resultado.traza],
        "empate": resultado.empate,
        "distingue": que_distingue(BASE, resultado, datos.hechos)[:6],
        "siguiente": siguiente,
    }




# --------------------------------------------------------------------------
# Clima y alerta de rancha
# --------------------------------------------------------------------------

@app.get("/api/clima")
def clima_y_alerta(lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180),
                   nombre: str | None = Query(None, max_length=80)):
    return clima.consultar_clima(lat, lon, nombre)


@app.get("/api/clima/buscar")
def buscar_lugar(nombre: str = Query(..., min_length=2, max_length=80)):
    try:
        return {"resultados": clima.buscar_lugar(nombre)}
    except Exception as error:
        raise HTTPException(503, f"No se pudo buscar el lugar (¿hay internet?): {type(error).__name__}") from error


# --------------------------------------------------------------------------
# Cámara
# --------------------------------------------------------------------------

@app.post("/api/camara")
async def analizar_foto(foto: UploadFile = File(...)):
    """Clasifica la foto de una hoja (rancha, alternariosis o sana) y devuelve los hechos foto_*."""
    if camara is None or CAMARA_ERROR:
        raise HTTPException(503, f"La cámara no está disponible: {CAMARA_ERROR}")
    contenido = await foto.read()
    if len(contenido) > 8 * 1024 * 1024:
        raise HTTPException(413, "La foto pesa más de 8 MB")
    try:
        return camara.analizar(contenido)
    except camara.FotoInvalida as error:
        raise HTTPException(422, str(error)) from error


# --------------------------------------------------------------------------
# Red local (para abrir la página desde un celular con el código QR)
# --------------------------------------------------------------------------

def _ip_local() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))       # no envía nada: solo elige la interfaz de red de salida
            return s.getsockname()[0]
    except OSError:
        return None


@app.get("/api/red")
def red(request: Request):
    """Dirección con la que un celular de la misma red puede abrir esta página."""
    host = request.url.hostname or ""
    local = host in ("localhost", "127.0.0.1", "::1")
    puerto = request.url.port or (443 if request.url.scheme == "https" else 80)
    ip = _ip_local()
    if local and ip:
        url = f"{request.url.scheme}://{ip}:{puerto}"
    else:
        url = str(request.base_url).rstrip("/")
    return {"url": url, "ip": ip, "es_local": local}


# La interfaz web ya compilada se sirve desde el mismo servidor.
if WEB.exists():
    app.mount("/assets", StaticFiles(directory=WEB / "assets"), name="assets")
    for extra in ("ejemplos",):
        if (WEB / extra).exists():
            app.mount(f"/{extra}", StaticFiles(directory=WEB / extra), name=extra)

    @app.get("/")
    def inicio():
        return FileResponse(WEB / "index.html")

    @app.get("/{archivo}")
    def archivo_publico(archivo: str):
        ruta = (WEB / archivo).resolve()
        if ruta.parent == WEB.resolve() and ruta.is_file():
            return FileResponse(ruta)
        return FileResponse(WEB / "index.html")
