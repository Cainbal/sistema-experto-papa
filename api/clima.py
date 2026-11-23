"""Pronóstico del tiempo (Open-Meteo) y alerta temprana de rancha.

Open-Meteo es gratuito para uso no comercial y no pide clave. Se piden la temperatura, la humedad
relativa y la lluvia por hora de los 2 días pasados y los 5 siguientes; con eso el modelo de Wallin
difuso calcula la severidad de cada día.

Si no hay internet, se usan datos de ejemplo generados por el propio programa, y la respuesta lo dice
claramente ("fuente": "ejemplo"). Nunca se presentan como datos reales.
"""

from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from motor import wallin

ZONA = timezone(timedelta(hours=-5), "PET")   # hora del Perú

URL_PRONOSTICO = "https://api.open-meteo.com/v1/forecast"
URL_LUGARES = "https://geocoding-api.open-meteo.com/v1/search"
HUANUCO = {"nombre": "Huánuco", "lat": -9.9306, "lon": -76.2422}
CACHE_SEGUNDOS = 30 * 60
_cache: dict = {}


def _pedir_json(url: str, parametros: dict, espera: float = 8.0) -> dict:
    direccion = f"{url}?{urllib.parse.urlencode(parametros)}"
    pedido = urllib.request.Request(direccion, headers={"User-Agent": "sistema-experto-papa/2.0 (proyecto universitario)"})
    with urllib.request.urlopen(pedido, timeout=espera) as respuesta:
        return json.loads(respuesta.read().decode("utf-8"))


def pronostico_open_meteo(lat: float, lon: float) -> dict:
    datos = _pedir_json(URL_PRONOSTICO, {
        "latitude": round(lat, 4), "longitude": round(lon, 4),
        "hourly": "temperature_2m,relative_humidity_2m,precipitation",
        "past_days": 2, "forecast_days": 5, "timezone": "auto",
    })
    h = datos["hourly"]
    # Open-Meteo a veces devuelve null en alguna hora; esas horas no entran al cálculo ni al gráfico.
    horas = [{"hora": t, "temperatura": temp, "humedad_relativa": hr, "lluvia": ll or 0.0}
             for t, temp, hr, ll in zip(h["time"], h["temperature_2m"], h["relative_humidity_2m"], h["precipitation"])
             if temp is not None and hr is not None]
    return {"horas": horas, "elevacion": datos.get("elevation"), "zona_horaria": datos.get("timezone")}


def clima_ejemplo(dias_pasados: int = 2, dias: int = 5) -> dict:
    """Siete días inventados pero verosímiles para la sierra en temporada de lluvias.

    Días normales: noches frías y húmedas, tardes secas. Mañana y pasado: neblina y garúa casi todo el
    día (humedad sobre 90 %), que es el escenario típico de la rancha. Sirve solo para probar sin internet.
    """
    hoy = datetime.now(ZONA).replace(hour=0, minute=0, second=0, microsecond=0)
    tipos = {-2: "normal", -1: "humedo", 0: "humedo", 1: "neblina", 2: "neblina", 3: "humedo", 4: "normal"}
    parametros = {             # temperatura media y amplitud, humedad media y amplitud, lluvia por hora
        "normal": (12.5, 6.0, 76, 18, 0.0),
        "humedo": (14.0, 4.0, 86, 10, 0.4),
        "neblina": (12.0, 2.0, 95, 4, 0.8),
    }
    horas = []
    for d in range(-dias_pasados, dias):
        t_media, t_amp, hr_media, hr_amp, ll = parametros[tipos.get(d, "normal")]
        for hh in range(24):
            fase = math.cos((hh - 14) / 24 * 2 * math.pi)       # máximo de temperatura a las 14:00
            hr = min(100.0, max(30.0, hr_media - hr_amp * fase))
            horas.append({"hora": (hoy + timedelta(days=d, hours=hh)).strftime("%Y-%m-%dT%H:%M"),
                          "temperatura": round(t_media + t_amp * fase, 1), "humedad_relativa": round(hr),
                          "lluvia": ll if hr >= 90 else 0.0})
    return {"horas": horas, "elevacion": None, "zona_horaria": "America/Lima"}


def alerta(resumen: dict, hoy: str) -> dict:
    """Mensaje para el agricultor: el peor día entre hoy y los próximos 3."""
    dias = resumen["dias"]
    proximos = [d for d in dias if hoy <= d["fecha"]][:4]
    if not proximos:
        return {"nivel": "sin_datos", "mensaje": "No hay pronóstico para los próximos días."}
    peor = max(proximos, key=lambda d: d["dsv"])
    pasados = [d for d in dias if d["fecha"] < hoy]
    acumulado_pasado = round(sum(d["dsv"] for d in pasados), 2)
    mensajes = {
        "alto": "Riesgo alto de rancha. Revisa el campo (hojas con manchas y pelusilla blanca en el envés) y "
                "considera la aplicación preventiva de fungicida que indica la ficha 01 de la guía.",
        "medio": "Riesgo moderado de rancha. Vigila las hojas bajas y las zonas más húmedas del campo.",
        "bajo": "Riesgo bajo de rancha por clima en los próximos días.",
    }
    return {"nivel": peor["nivel"], "dia": peor["fecha"], "dsv": peor["dsv"], "mensaje": mensajes[peor["nivel"]],
            "acumulado_dias_pasados": acumulado_pasado}


def condiciones_actuales(horas: list, ahora: datetime) -> dict:
    """Lo que la consulta puede tomar del clima: temperatura y humedad de la hora actual y la severidad de
    Wallin de las últimas 24 horas."""
    marca = ahora.strftime("%Y-%m-%dT%H:00")
    pasadas = [h for h in horas if h["hora"] <= marca]
    ultimas = pasadas[-24:]
    hechos = {}
    if pasadas:
        for clave in ("temperatura", "humedad_relativa"):
            if pasadas[-1].get(clave) is not None:
                hechos[clave] = round(float(pasadas[-1][clave]), 1)
    con_datos = sum(1 for h in ultimas if h.get("temperatura") is not None and h.get("humedad_relativa") is not None)
    dsv = wallin.dsv_ultimas_horas(ultimas) if con_datos >= 6 else None   # con menos de 6 h no dice nada
    if dsv is not None:
        hechos["dsv_rancha"] = dsv
    return {"hora": pasadas[-1]["hora"] if pasadas else None, "horas_con_datos": con_datos,
            "dsv_24h": dsv, "hechos": hechos}


def consultar_clima(lat: float | None = None, lon: float | None = None, nombre: str | None = None) -> dict:
    lat = HUANUCO["lat"] if lat is None else lat
    lon = HUANUCO["lon"] if lon is None else lon
    nombre = nombre or (HUANUCO["nombre"] if (lat, lon) == (HUANUCO["lat"], HUANUCO["lon"]) else None)
    clave = (round(lat, 2), round(lon, 2))
    guardado = _cache.get(clave)
    if guardado and time.time() - guardado["momento"] < CACHE_SEGUNDOS:
        datos, fuente, aviso = guardado["datos"], guardado["fuente"], guardado["aviso"]
    else:
        try:
            datos, fuente, aviso = pronostico_open_meteo(lat, lon), "open-meteo", None
            _cache[clave] = {"momento": time.time(), "datos": datos, "fuente": fuente, "aviso": None}
        except Exception as error:  # sin internet, servicio caído o respuesta inesperada
            datos, fuente = clima_ejemplo(), "ejemplo"
            aviso = ("No se pudo conectar con Open-Meteo, así que se muestran datos de ejemplo, no reales "
                     f"({type(error).__name__}).")
    resumen = wallin.resumen_diario(datos["horas"])
    hoy = datetime.now(ZONA).strftime("%Y-%m-%d")
    return {"fuente": fuente, "aviso": aviso,
            "ubicacion": {"nombre": nombre, "lat": lat, "lon": lon, "elevacion": datos.get("elevacion")},
            "hoy": hoy, "horas": datos["horas"], "dias": resumen["dias"], "periodos": resumen["periodos"],
            "alerta": alerta(resumen, hoy),
            "actual": condiciones_actuales(datos["horas"], datetime.now(ZONA)),
            "modelo": "Wallin (1962) en versión difusa: horas con humedad relativa alta y su temperatura media."}


def buscar_lugar(nombre: str) -> list:
    datos = _pedir_json(URL_LUGARES, {"name": nombre, "count": 8, "language": "es", "format": "json",
                                      "countryCode": "PE"})
    return [{"nombre": r.get("name"), "region": r.get("admin1"), "provincia": r.get("admin2"),
             "distrito": r.get("admin3"), "lat": r["latitude"], "lon": r["longitude"],
             "elevacion": r.get("elevation")}
            for r in datos.get("results", []) if "latitude" in r and "longitude" in r]
