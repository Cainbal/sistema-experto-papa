"""Modelo de Wallin difuso para el riesgo de tizón tardío (rancha).

El modelo de Wallin (1962), base de BLITECAST, asigna "valores de severidad" (DSV, de 0 a 4) según
cuántas horas seguidas la humedad relativa estuvo en 90 % o más y la temperatura promedio de esas horas.
Tabla original (convertida a °C):

    Temperatura promedio     Horas con HR ≥ 90 % para DSV  1     2     3     4
    7,2 a 11,6 °C (fresca)                                16    19    22    25
    12,2 a 15,0 °C (templada)                             13    16    19    22
    15,6 a 26,6 °C (óptima)                               10    13    16    19

Fuera de 7,2 a 26,6 °C el valor es 0. Verificado con los puntos que publica la Universidad de Maine
(Bulletin #2418): 18 h de humedad alta dan 3 a 65 °F, 2 a 56 °F, 1 a 50 °F y 0 a 40 °F u 85 °F.

Versión difusa (Mamdani):
- Las horas no se cuentan con un corte en 90 %: cada hora suma su grado de "humedad alta"
  (85 % → 0, 92 % → 1). Así una hora con 89 % cuenta como 0,57 h y no como cero.
- Las bandas de temperatura y los umbrales de horas tienen bordes suaves: con horas enteras y
  temperaturas dentro de una banda da exactamente el valor de la tabla; entre una hora y la siguiente,
  o entre dos bandas, la transición es gradual en vez de un salto.
- Cada fila de la tabla es una regla: SI temperatura ES banda Y horas ES nivel ENTONCES severidad ES k.
- Se agrega con máximo y se defuzzifica por centroide.
"""

from __future__ import annotations

from collections import OrderedDict

from .difuso import grado, trapecio

# Las bandas vienen de la tabla en °F (45-53, 54-59 y 60-80 °F); los huecos entre una y otra
# (11,6-12,2 y 15,0-15,6 °C) son la transición difusa. Los bordes exteriores pasan de 44 a 45 °F y de 80 a 81 °F.
BANDAS = OrderedDict([
    ("fresca", [6.6, 7.2, 11.6, 12.2]),
    ("templada", [11.6, 12.2, 15.0, 15.6]),
    ("optima", [15.0, 15.6, 26.6, 27.2]),
])
UMBRALES = {"fresca": [16, 19, 22, 25], "templada": [13, 16, 19, 22], "optima": [10, 13, 16, 19]}
MARGEN_HORAS = 1.0   # en horas enteras se reproduce exactamente la tabla
ETIQUETA_BANDA = {"fresca": "fresca (7-12 °C)", "templada": "templada (12-15 °C)", "optima": "óptima (16-27 °C)",
                  "fuera": "fuera de rango"}


def grado_banda(banda: str, temp: float) -> float:
    return trapecio(temp, *BANDAS[banda])


def grado_horas(banda: str, nivel: int, horas: float) -> float:
    t = UMBRALES[banda]
    m = MARGEN_HORAS
    if nivel == 0:
        return trapecio(horas, -1, -1, t[0] - m, t[0])
    if nivel == 4:
        return trapecio(horas, t[3] - m, t[3], 999, 999)
    return trapecio(horas, t[nivel - 1] - m, t[nivel - 1], t[nivel] - m, t[nivel])


def reglas_wallin() -> list:
    """Las 16 reglas del modelo, para mostrarlas en la base de conocimiento."""
    reglas = []
    for banda, t in UMBRALES.items():
        limites = [0] + t + [24]
        for k in range(5):
            desde = limites[k]
            hasta = limites[k + 1] - 1 if k < 4 else None
            horas = f"{desde} a {hasta} h" if hasta is not None else f"{desde} h o más"
            reglas.append({"id": f"W-{banda[:3]}-{k}", "banda": banda, "temperatura": ETIQUETA_BANDA[banda],
                           "horas": horas, "dsv": k})
    reglas.append({"id": "W-fuera", "banda": "fuera", "temperatura": "menos de 7 °C o más de 27 °C",
                   "horas": "cualquiera", "dsv": 0})
    return reglas


def dsv(horas: float, temp: float) -> dict:
    """Severidad de Wallin difusa para un periodo húmedo."""
    disparos = []
    fuerzas = [0.0] * 5
    pertenencia_bandas = {b: grado_banda(b, temp) for b in BANDAS}
    for banda, mu_t in pertenencia_bandas.items():
        if mu_t == 0:
            continue
        for k in range(5):
            alpha = min(mu_t, grado_horas(banda, k, horas))
            if alpha > 0:
                fuerzas[k] = max(fuerzas[k], alpha)
                disparos.append({"banda": banda, "dsv": k, "fuerza": round(alpha, 3)})
    # Fuera de rango: más frío que 7,2 °C o más caliente que 26,6 °C (con bordes suaves).
    fuera = max(trapecio(temp, -99, -99, 6.6, 7.2), trapecio(temp, 26.6, 27.2, 99, 99))
    if fuera > 0:
        fuerzas[0] = max(fuerzas[0], fuera)
        disparos.append({"banda": "fuera", "dsv": 0, "fuerza": round(fuera, 3)})
    # Salida: triángulos (k-1, k, k+1) en el universo [-1, 5]; centroide por integración.
    num = den = 0.0
    pasos = 300
    for i in range(pasos + 1):
        x = -1 + 6 * i / pasos
        mu = max(min(f, trapecio(x, k - 1, k, k, k + 1)) for k, f in enumerate(fuerzas))
        num += x * mu
        den += mu
    valor = 0.0 if den == 0 else max(0.0, min(4.0, num / den))
    return {"valor": round(valor, 2), "fuerzas": [round(f, 3) for f in fuerzas],
            "bandas": {b: round(m, 3) for b, m in pertenencia_bandas.items()}, "disparos": disparos}


def grado_humedo(hr: float) -> float:
    return grado("humedad_relativa", "alta", hr)


def periodos_humedos(horas: list, continuar: float = 0.3) -> list:
    """Agrupa horas consecutivas húmedas en periodos.

    `horas` es una lista ordenada de {"hora": "AAAA-MM-DDTHH:MM", "temperatura", "humedad_relativa"}.
    Un periodo continúa mientras el grado de humedad alta supere `continuar` (≈ 87 %), igual que
    NoBlight, que no corta el periodo si la humedad baja un rato a 88 %.
    """
    periodos, actual = [], []
    for h in horas:
        if h.get("humedad_relativa") is None or h.get("temperatura") is None:
            # Hora sin datos: no se puede saber si siguió húmedo, así que el periodo se cierra.
            if actual:
                periodos.append(actual)
                actual = []
            continue
        mu = grado_humedo(h["humedad_relativa"])
        if mu > continuar:
            actual.append((h, mu))
        elif actual:
            periodos.append(actual)
            actual = []
    if actual:
        periodos.append(actual)
    # Un periodo de más de 24 h (días seguidos de neblina) se parte en bloques de 24 h para que cada
    # día sume su propia severidad, como en BLITECAST, que acumula un valor por día.
    bloques = [p[i:i + 24] for p in periodos for i in range(0, len(p), 24)]
    salida = []
    for p in bloques:
        horas_ef = sum(mu for _, mu in p)
        temp = sum(h["temperatura"] * mu for h, mu in p) / horas_ef
        r = dsv(horas_ef, temp)
        salida.append({"inicio": p[0][0]["hora"], "fin": p[-1][0]["hora"], "horas_reales": len(p),
                       "horas_efectivas": round(horas_ef, 1), "temp_media": round(temp, 1),
                       "dsv": r["valor"], "fuerzas": r["fuerzas"], "bandas": r["bandas"]})
    return salida


def resumen_diario(horas: list) -> dict:
    """Severidad por día (suma de los periodos que terminan ese día, máximo 4) y acumulado.

    Un periodo húmedo nocturno (por ejemplo de 19:00 a 09:00) se asigna al día en que termina, así no se
    corta a la medianoche.
    """
    periodos = periodos_humedos(horas)
    dias = OrderedDict()
    for h in horas:
        if h.get("temperatura") is None or h.get("humedad_relativa") is None:
            continue
        fecha = h["hora"][:10]
        d = dias.setdefault(fecha, {"fecha": fecha, "temps": [], "hrs": [], "lluvia": 0.0, "humedas": 0.0})
        d["temps"].append(h["temperatura"])
        d["hrs"].append(h["humedad_relativa"])
        d["lluvia"] += h.get("lluvia") or 0.0
        d["humedas"] += grado_humedo(h["humedad_relativa"])
    for d in dias.values():
        d["periodos"] = [p for p in periodos if p["fin"][:10] == d["fecha"]]
        valor = min(4.0, sum(p["dsv"] for p in d["periodos"]))
        d["dsv"] = round(valor, 2)
        g = {t: grado("dsv_rancha", t, valor) for t in ("bajo", "medio", "alto")}
        d["nivel"] = max(g, key=g.get)
        d["grados_nivel"] = g
        d["temp_min"] = round(min(d["temps"]), 1)
        d["temp_max"] = round(max(d["temps"]), 1)
        d["temp_media"] = round(sum(d["temps"]) / len(d["temps"]), 1)
        d["hr_media"] = round(sum(d["hrs"]) / len(d["hrs"]), 1)
        d["horas_humedas"] = round(d.pop("humedas"), 1)
        d["lluvia"] = round(d["lluvia"], 1)
        d["horas_con_datos"] = len(d.pop("temps"))
        d.pop("hrs")
    lista = list(dias.values())
    return {"dias": lista, "periodos": periodos, "acumulado": round(sum(d["dsv"] for d in lista), 2),
            "umbral_blitecast": 18}


def dsv_ultimas_horas(horas: list) -> float:
    """Severidad de los periodos húmedos dentro de la lista (por ejemplo, las últimas 24 h del pronóstico)."""
    return round(min(4.0, sum(p["dsv"] for p in periodos_humedos(horas))), 2)
