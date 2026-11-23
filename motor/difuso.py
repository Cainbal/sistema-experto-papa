"""Lógica difusa del sistema: conjuntos, fuzzificación, inferencia de salida y defuzzificación.

Corresponde a las cajas "Fuzzificación" y "Defuzzificación" del diagrama de la arquitectura:

    Entrada → Fuzzificación → Motor de inferencia (BH/BC) → Defuzzificación → Salida

Todos los conjuntos son trapezoidales: (a, b, c, d) sube de a a b, vale 1 entre b y c y baja de c a d.
Un triángulo es un trapecio con b = c. Se usan límites amplios (por ejemplo -50 o 101) para los
conjuntos de los extremos ("hombros"), que valen 1 hasta el borde del rango.
"""

from __future__ import annotations

VARIABLES = {
    "temperatura": {
        "nombre": "Temperatura del aire", "unidad": "°C", "rango": [-5, 35],
        "terminos": {"fria": [-50, -50, 6, 10], "templada": [8, 12, 20, 24], "calida": [20, 24, 60, 60]},
        "etiquetas": {"fria": "fría", "templada": "templada", "calida": "cálida"},
    },
    "humedad_relativa": {
        "nombre": "Humedad relativa del aire", "unidad": "%", "rango": [0, 100],
        "terminos": {"baja": [-1, -1, 50, 65], "media": [55, 70, 80, 90], "alta": [85, 92, 101, 101]},
        "etiquetas": {"baja": "baja", "media": "media", "alta": "alta"},
    },
    "humedad_suelo": {
        "nombre": "Humedad del suelo", "unidad": "%", "rango": [0, 100],
        "terminos": {"seca": [-1, -1, 15, 30], "adecuada": [20, 35, 55, 70], "saturada": [60, 75, 101, 101]},
        "etiquetas": {"seca": "seca", "adecuada": "adecuada", "saturada": "saturada"},
    },
    "plantas_afectadas": {
        "nombre": "Plantas afectadas", "unidad": "%", "rango": [0, 100],
        "terminos": {"leve": [-1, -1, 5, 15], "moderada": [5, 15, 30, 45], "severa": [30, 45, 101, 101]},
        "etiquetas": {"leve": "leve", "moderada": "moderada", "severa": "severa"},
    },
    "dsv_rancha": {
        "nombre": "Severidad de Wallin (rancha)", "unidad": "", "rango": [0, 4],
        "terminos": {"bajo": [-1, -1, 0.5, 1.5], "medio": [0.5, 1.5, 2.0, 3.0], "alto": [2.0, 3.0, 5, 5]},
        "etiquetas": {"bajo": "bajo", "medio": "medio", "alto": "alto"},
    },
    "posibilidad": {
        "nombre": "Posibilidad de la plaga", "unidad": "%", "rango": [0, 100],
        "terminos": {"baja": [-1, -1, 15, 40], "media": [25, 50, 50, 75], "alta": [60, 85, 101, 101]},
        "etiquetas": {"baja": "baja", "media": "media", "alta": "alta"},
    },
    "urgencia": {
        "nombre": "Urgencia de actuar", "unidad": "", "rango": [0, 100],
        "terminos": {"vigilar": [-1, -1, 15, 40], "esta_semana": [25, 50, 50, 75], "actuar_ya": [60, 85, 101, 101]},
        "etiquetas": {"vigilar": "vigilar", "esta_semana": "actuar esta semana", "actuar_ya": "actuar ya"},
    },
}


def trapecio(x: float, a: float, b: float, c: float, d: float) -> float:
    """Grado de pertenencia de x a un conjunto trapezoidal (a, b, c, d)."""
    if b <= x <= c:
        return 1.0
    if a < x < b:
        return (x - a) / (b - a)
    if c < x < d:
        return (d - x) / (d - c)
    return 0.0


def grado(variable: str, termino: str, x: float) -> float:
    a, b, c, d = VARIABLES[variable]["terminos"][termino]
    return round(trapecio(float(x), a, b, c, d), 4)


def fuzzificar(variable: str, x: float) -> dict:
    """Convierte un número en grados de pertenencia a cada término de la variable."""
    return {t: grado(variable, t, x) for t in VARIABLES[variable]["terminos"]}


def probsum(a: float, b: float) -> float:
    """Suma probabilística (S-norma): combina evidencias independientes a favor de lo mismo."""
    return a + b - a * b


def centroide(variable: str, fuerzas: dict, pasos: int = 400) -> float | None:
    """Defuzzificación por centroide (Mamdani).

    Cada término se recorta a la fuerza con que lo activaron las reglas, los recortes se unen con
    el máximo y se calcula el centro de gravedad del área resultante.
    """
    lo, hi = VARIABLES[variable]["rango"]
    num = den = 0.0
    for i in range(pasos + 1):
        x = lo + (hi - lo) * i / pasos
        mu = max(min(f, grado(variable, t, x)) for t, f in fuerzas.items())
        num += x * mu
        den += mu
    return None if den == 0 else round(num / den, 2)


def termino_dominante(variable: str, x: float) -> str:
    grados = fuzzificar(variable, x)
    return max(grados, key=grados.get)


# --------------------------------------------------------------------------
# Salida del diagnóstico: posibilidad de cada plaga
# --------------------------------------------------------------------------

def fuerzas_posibilidad(favor: float, contra: float) -> dict:
    """Fuerza de cada término de salida a partir de la evidencia a favor y en contra.

    s = evidencia neta. Sin evidencia todo es "baja"; con evidencia total, "alta"; en el medio,
    "media" llega a su máximo.
    """
    s = max(0.0, min(1.0, favor * (1.0 - contra)))
    return {"baja": round(1.0 - s, 4), "media": round(1.0 - abs(2.0 * s - 1.0), 4), "alta": round(s, 4)}


def posibilidad(favor: float, contra: float) -> tuple[float, dict]:
    fuerzas = fuerzas_posibilidad(favor, contra)
    return centroide("posibilidad", fuerzas), fuerzas


def nivel_posibilidad(p: float) -> str:
    if p >= 75:
        return "muy probable"
    if p >= 60:
        return "probable"
    if p >= 40:
        return "posible"
    return "poco probable"


# --------------------------------------------------------------------------
# Segunda salida: urgencia de actuar (inferencia Mamdani con dos entradas)
# --------------------------------------------------------------------------

def urgencia(posib: float, afectadas: float | None = None, dsv: float | None = None,
             es_rancha: bool = False) -> dict:
    """Combina qué tan posible es la plaga, cuánto se ha extendido y el clima.

    Reglas (Y = mínimo, se agregan con máximo, se defuzzifica por centroide):
      U1  posibilidad alta  Y afectadas severa/moderada → actuar ya
      U2  posibilidad alta  Y afectadas leve            → esta semana
      U3  posibilidad media Y afectadas severa          → esta semana
      U4  posibilidad media Y afectadas moderada        → esta semana
      U5  posibilidad media Y afectadas leve            → vigilar
      U6  posibilidad baja                              → vigilar
      U7  (sin dato de afectadas) posibilidad alta      → esta semana
      U8  (sin dato de afectadas) posibilidad media     → vigilar
      U9  (solo rancha) posibilidad alta Y clima de Wallin alto → actuar ya
    """
    p = fuzzificar("posibilidad", posib)
    reglas = []

    def regla(rid, texto, alpha, salida):
        if alpha > 0:
            reglas.append({"regla": rid, "texto": texto, "fuerza": round(alpha, 3), "salida": salida})

    if afectadas is not None:
        a = fuzzificar("plantas_afectadas", afectadas)
        regla("U1", "posibilidad alta Y afectadas moderada o severa", min(p["alta"], max(a["severa"], a["moderada"])), "actuar_ya")
        regla("U2", "posibilidad alta Y afectadas leve", min(p["alta"], a["leve"]), "esta_semana")
        regla("U3", "posibilidad media Y afectadas severa", min(p["media"], a["severa"]), "esta_semana")
        regla("U4", "posibilidad media Y afectadas moderada", min(p["media"], a["moderada"]), "esta_semana")
        regla("U5", "posibilidad media Y afectadas leve", min(p["media"], a["leve"]), "vigilar")
    else:
        regla("U7", "posibilidad alta (sin dato de cuántas plantas)", p["alta"], "esta_semana")
        regla("U8", "posibilidad media (sin dato de cuántas plantas)", p["media"], "vigilar")
    regla("U6", "posibilidad baja", p["baja"], "vigilar")
    if es_rancha and dsv is not None:
        regla("U9", "rancha con posibilidad alta Y clima de Wallin alto", min(p["alta"], grado("dsv_rancha", "alto", dsv)), "actuar_ya")

    fuerzas = {t: 0.0 for t in VARIABLES["urgencia"]["terminos"]}
    for r in reglas:
        fuerzas[r["salida"]] = max(fuerzas[r["salida"]], r["fuerza"])
    valor = centroide("urgencia", fuerzas) if any(fuerzas.values()) else 0.0
    termino = max(fuerzas, key=fuerzas.get)
    return {"valor": valor, "termino": termino, "etiqueta": VARIABLES["urgencia"]["etiquetas"][termino],
            "fuerzas": fuerzas, "reglas": reglas}
