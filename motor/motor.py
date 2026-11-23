"""Motor de inferencia difuso del sistema experto de plagas y enfermedades de la papa.

Recorrido de una consulta (ver el diagrama de la arquitectura):

1. Entrada: respuestas del usuario (-1 = no, 0 = no sé, 0,5 = un poco, 1 = sí), mediciones
   (temperatura, humedad, humedad del suelo, plantas afectadas, severidad de Wallin) y la cámara.
2. Fuzzificación: las respuestas ya son grados de pertenencia a "presente"; las mediciones se
   convierten con los conjuntos de `difuso.VARIABLES` ("humedad ES alta" → 0,9).
3. Motor de inferencia: encadenamiento hacia adelante sobre la base de conocimiento.
   - Y lógico = mínimo de los grados de las premisas.
   - Cada regla aporta peso × grado. Los pesos de las reglas de síntomas vienen de la calibración
     bayesiana con los datos del experto (`calibracion.py`).
   - Aportes a la misma conclusión se combinan con la suma probabilística (a + b - ab).
   - Hay reglas de descarte (NO síntoma → en contra de la plaga), que forman la evidencia en contra.
   - Las reglas de derivación producen hechos intermedios (por ejemplo "ambiente templado y húmedo").
4. Defuzzificación: por plaga, la evidencia neta activa los términos baja/media/alta de la variable
   "posibilidad" y el centroide da el porcentaje final.
5. Salida: diagnósticos ordenados, explicación (reglas disparadas), urgencia y manejo.

No usa librerías externas.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from . import difuso
from .calibracion import calibrar
from .difuso import probsum

RAIZ = Path(__file__).resolve().parent.parent
RUTA_BASE = RAIZ / "conocimiento" / "base_conocimiento.json"
RUTA_EXPERTO = RAIZ / "conocimiento" / "experto_crispin.json"

PREGUNTABLES = {"sintoma", "signo", "dano", "condicion"}
NO_PREGUNTABLES = {"derivado", "medicion", "percepcion"}
ORDEN_PARTES = {"hojas": 1.15, "planta": 1.10, "tallos": 1.05, "raices": 1.0, "tuberculos": 1.0, "condiciones": 1.0}


class ErrorBase(ValueError):
    """La base de conocimiento tiene un error de estructura."""


# --------------------------------------------------------------------------
# Base de conocimiento
# --------------------------------------------------------------------------

@dataclass
class Base:
    meta: dict
    partes: dict
    hechos: dict
    reglas: list
    plagas: dict
    umbral: float
    calibracion: list = field(default_factory=list)
    experto: dict = field(default_factory=dict)

    def es_hipotesis(self, ident: str) -> bool:
        return ident in self.plagas


def hecho_de(premisa) -> str:
    return premisa if isinstance(premisa, str) else premisa["hecho"]


def cargar_base(ruta: str | Path = RUTA_BASE, ruta_experto: str | Path | None = RUTA_EXPERTO,
                calibrar_pesos: bool = True, alfa: float | None = None) -> Base:
    datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    experto = json.loads(Path(ruta_experto).read_text(encoding="utf-8")) if ruta_experto else {}
    reporte = []
    if experto and calibrar_pesos:
        datos, reporte = calibrar(datos, experto, alfa)

    hechos = {h["id"]: h for h in datos["hechos"]}
    plagas = {p["id"]: p for p in datos["plagas"]}
    reglas = datos["reglas"]
    if len(hechos) != len(datos["hechos"]):
        raise ErrorBase("Hay ids de hechos repetidos")
    ids = [r["id"] for r in reglas]
    if len(set(ids)) != len(ids):
        raise ErrorBase("Hay ids de reglas repetidos")

    for r in reglas:
        if not 0 < r["fc"] <= 1:
            raise ErrorBase(f"{r['id']}: peso fuera de (0, 1]")
        if not r["si"]:
            raise ErrorBase(f"{r['id']}: regla sin premisas")
        for premisa in r["si"]:
            h = hecho_de(premisa)
            if h not in hechos:
                raise ErrorBase(f"{r['id']}: hecho desconocido '{h}'")
            if isinstance(premisa, dict) and "es" in premisa:
                variable = difuso.VARIABLES.get(h)
                if not variable or premisa["es"] not in variable["terminos"]:
                    raise ErrorBase(f"{r['id']}: término difuso desconocido '{h} es {premisa['es']}'")
            elif isinstance(premisa, dict) and not premisa.get("no"):
                raise ErrorBase(f"{r['id']}: premisa mal formada")
            elif isinstance(premisa, str) and hechos[h]["tipo"] == "medicion":
                raise ErrorBase(f"{r['id']}: una medición debe usarse con un término difuso")
        concl = r["entonces"]
        if concl in plagas:
            continue
        if concl not in hechos or hechos[concl]["tipo"] != "derivado":
            raise ErrorBase(f"{r['id']}: conclusión desconocida '{concl}'")
        if r["tipo"] == "descarte":
            raise ErrorBase(f"{r['id']}: un descarte debe concluir sobre una plaga")

    # Las reglas que derivan hechos intermedios van antes que las que los usan.
    nivel = {h: 0 for h in hechos}
    for _ in range(len(hechos) + 1):
        cambio = False
        for r in reglas:
            if r["entonces"] in plagas:
                continue
            n = 1 + max(nivel[hecho_de(p)] for p in r["si"])
            if n > nivel[r["entonces"]]:
                nivel[r["entonces"]] = n
                cambio = True
        if not cambio:
            break
    else:
        raise ErrorBase("Las reglas de derivación forman un ciclo")
    reglas = sorted(reglas, key=lambda r: len(hechos) + 1 if r["entonces"] in plagas else nivel[r["entonces"]])
    return Base(datos["meta"], datos["partes"], hechos, reglas, plagas,
                datos["meta"].get("umbral_disparo", 0.2), reporte, experto)


# --------------------------------------------------------------------------
# Fuzzificación de premisas
# --------------------------------------------------------------------------

def texto_premisa(base: Base, premisa) -> str:
    h = base.hechos[hecho_de(premisa)]
    if isinstance(premisa, str):
        return h["pregunta"]
    if premisa.get("no"):
        return f"NO: {h['pregunta']}"
    etiqueta = difuso.VARIABLES[h["id"]]["etiquetas"][premisa["es"]]
    return f"{h['corto']} es {etiqueta}"


_texto_premisa = texto_premisa  # compatibilidad con la versión 1


def grado_premisa(base: Base, premisa, memoria: dict):
    """Grado de verdad de una premisa en [-1, 1], o None si todavía no se sabe."""
    if isinstance(premisa, str):
        return memoria.get(premisa)
    valor = memoria.get(premisa["hecho"])
    if valor is None:
        return None
    if premisa.get("no"):
        return max(0.0, -valor)
    return difuso.grado(premisa["hecho"], premisa["es"], valor)


def fuzzificacion(base: Base, hechos: dict) -> dict:
    """Grados de pertenencia de cada medición presente, para mostrarlos en la interfaz."""
    salida = {}
    for h, valor in hechos.items():
        if h in difuso.VARIABLES and base.hechos.get(h, {}).get("tipo") == "medicion":
            salida[h] = {"valor": valor, "grados": difuso.fuzzificar(h, valor)}
    return salida


# --------------------------------------------------------------------------
# Inferencia
# --------------------------------------------------------------------------

@dataclass
class Disparo:
    regla: str
    tipo: str
    fuente: str
    ficha: int
    conclusion: str
    sentido: str            # "+" a favor, "-" en contra, "=" deriva un hecho intermedio
    premisas: list
    fc_regla: float
    certeza_premisas: float
    aporte: float
    antes: float
    despues: float


@dataclass
class Hipotesis:
    id: str
    nombre: str
    certeza: float          # posibilidad / 100, para comparar y ordenar
    posibilidad: float      # centroide de la salida difusa (0-100)
    evidencia_favor: float
    evidencia_contra: float
    fuerzas: dict           # fuerza de cada término de salida (baja/media/alta)
    nivel: str
    con_evidencia: bool
    nombres_locales: list
    disparos: list = field(default_factory=list)


@dataclass
class Resultado:
    diagnosticos: list
    riesgos: list
    descartadas: list
    derivados: dict
    traza: list
    empate: list
    fuzzificacion: dict
    urgencia: dict | None


def nivel_certeza(c: float) -> str:  # compatibilidad: c en [0, 1]
    return difuso.nivel_posibilidad(c * 100)


def combinar(a: float, b: float) -> float:  # compatibilidad con la versión 1 (evidencias positivas)
    if a >= 0 and b >= 0:
        return probsum(a, b)
    if a < 0 and b < 0:
        return a + b * (1 + a)
    return (a + b) / (1 - min(abs(a), abs(b)))


def inferir(base: Base, hechos: dict) -> Resultado:
    memoria = dict(hechos)
    favor = {p: 0.0 for p in base.plagas}
    contra = {p: 0.0 for p in base.plagas}
    disparos = {p: [] for p in base.plagas}
    derivados, traza = {}, []

    for r in base.reglas:
        valores = [grado_premisa(base, p, memoria) for p in r["si"]]
        if any(v is None for v in valores):
            continue
        certeza_premisas = min(valores)
        if certeza_premisas <= base.umbral:
            continue
        aporte = r["fc"] * certeza_premisas
        concl = r["entonces"]
        if not base.es_hipotesis(concl):
            sentido = "="
            antes = memoria.get(concl, 0.0)
            despues = memoria[concl] = derivados[concl] = probsum(antes, aporte)
        elif r["tipo"] == "descarte":
            sentido = "-"
            antes = contra[concl]
            despues = contra[concl] = probsum(antes, aporte)
        else:
            sentido = "+"
            antes = favor[concl]
            despues = favor[concl] = probsum(antes, aporte)
        d = Disparo(r["id"], r["tipo"], r.get("fuente", "guia"), r["ficha"], concl, sentido,
                    [{"hecho": hecho_de(p), "texto": texto_premisa(base, p), "certeza": round(v, 3)}
                     for p, v in zip(r["si"], valores)],
                    r["fc"], round(certeza_premisas, 3), round(aporte, 3), round(antes, 3), round(despues, 3))
        traza.append(d)
        if base.es_hipotesis(concl):
            disparos[concl].append(d)

    diagnosticos, riesgos, descartadas = [], [], []
    for pid, plaga in base.plagas.items():
        f, c = favor[pid], contra[pid]
        if f <= 0:
            if c > 0:
                descartadas.append({"id": pid, "nombre": plaga["nombre"], "evidencia_contra": round(c, 3),
                                    "disparos": disparos[pid]})
            continue
        posib, fuerzas = difuso.posibilidad(f, c)
        evidencia = any(d.sentido == "+" and d.tipo != "condicion" for d in disparos[pid])
        h = Hipotesis(pid, plaga["nombre"], round(posib / 100, 4), posib, round(f, 3), round(c, 3), fuerzas,
                      difuso.nivel_posibilidad(posib), evidencia, plaga.get("nombres_locales", []), disparos[pid])
        (diagnosticos if evidencia else riesgos).append(h)
    diagnosticos.sort(key=lambda h: (-h.posibilidad, -h.evidencia_favor))
    riesgos.sort(key=lambda h: -h.posibilidad)

    empate = []
    if len(diagnosticos) > 1 and diagnosticos[0].posibilidad - diagnosticos[1].posibilidad < 3:
        tope = diagnosticos[0].posibilidad
        empate = [h.id for h in diagnosticos if tope - h.posibilidad < 3]

    urg = None
    if diagnosticos:
        top = diagnosticos[0]
        urg = difuso.urgencia(top.posibilidad, hechos.get("plantas_afectadas"), hechos.get("dsv_rancha"),
                              es_rancha=top.id == "tizon_tardio")
    return Resultado(diagnosticos, riesgos, descartadas, derivados, traza, empate,
                     fuzzificacion(base, hechos), urg)


# --------------------------------------------------------------------------
# Selección de la siguiente pregunta
# --------------------------------------------------------------------------

def _alcance(base: Base) -> dict:
    """Para cada hecho preguntable: [(plaga, peso efectivo, regla, otras premisas)], siguiendo derivaciones."""
    por_hecho = {}
    for r in base.reglas:
        if r["tipo"] == "descarte":
            continue
        for premisa in r["si"]:
            if isinstance(premisa, dict) and premisa.get("no"):
                continue
            por_hecho.setdefault(hecho_de(premisa), []).append(r)

    def seguir(hecho, factor, visto):
        salida = []
        for r in por_hecho.get(hecho, []):
            otras = [p for p in r["si"] if hecho_de(p) != hecho]
            if base.es_hipotesis(r["entonces"]):
                salida.append((r["entonces"], factor * r["fc"], r["id"], otras))
            elif r["entonces"] not in visto:
                for hip, fc, rid, mas in seguir(r["entonces"], factor * r["fc"], visto | {r["entonces"]}):
                    salida.append((hip, fc, rid, otras + mas))
        return salida

    return {h: seguir(h, 1.0, {h}) for h, d in base.hechos.items() if d["tipo"] in PREGUNTABLES}


def _cobertura(base: Base, alcance: dict, partes: list | None) -> dict:
    """Qué fracción de las partes marcadas por el usuario puede explicar cada plaga."""
    if not partes:
        return {p: 1.0 for p in base.plagas}
    partes_de = {p: set() for p in base.plagas}
    for hecho, enlaces in alcance.items():
        if base.hechos[hecho]["tipo"] == "condicion":
            continue
        for hip, _fc, _r, _o in enlaces:
            partes_de[hip] |= set(base.hechos[hecho]["partes"])
    return {p: len(partes_de[p] & set(partes)) / len(partes) for p in base.plagas}


def siguiente_pregunta(base: Base, hechos: dict, partes: list | None = None, max_preguntas: int = 15):
    """Elige el hecho que más ayuda a confirmar o distinguir las hipótesis vigentes, o None.

    Estrategia hipotético-deductiva, como la de un técnico de campo:
    - Mientras no hay sospechas, pregunta por el síntoma más característico (mayor peso) de las plagas
      que mejor explican todas las partes que el agricultor marcó (cobertura), empezando por las hojas,
      que es el orden de revisión del experto. Si una plaga ya recibió "no", baja su prioridad.
    - Cuando aparece una sospecha, busca confirmarla o descartarla con sus otros síntomas.
    - Si dos plagas empatan, pregunta por lo que las distingue.
    - Se detiene con un diagnóstico claro (≥ 75 % y 15 puntos sobre la segunda) o tras 15 preguntas.
    """
    resultado = inferir(base, hechos)
    posib = {h.id: h.certeza for h in resultado.diagnosticos}
    memoria = {**hechos, **resultado.derivados}

    respondidas = sum(1 for h in hechos if base.hechos.get(h, {}).get("tipo") in PREGUNTABLES)
    if respondidas >= max_preguntas:
        return None
    if resultado.diagnosticos and not resultado.empate:
        primera = resultado.diagnosticos[0].posibilidad
        segunda = resultado.diagnosticos[1].posibilidad if len(resultado.diagnosticos) > 1 else 0.0
        if primera >= 75 and primera - segunda >= 15:
            return None

    alcance = _alcance(base)
    cobertura = _cobertura(base, alcance, partes)
    descartes = {}
    for hecho, enlaces in alcance.items():
        valor = hechos.get(hecho)
        if valor is not None and valor <= base.umbral:
            for hip in {e[0] for e in enlaces}:
                descartes[hip] = descartes.get(hip, 0) + 1
    enfocado = bool(resultado.diagnosticos) and resultado.diagnosticos[0].posibilidad >= 50

    mejor, mejor_puntaje, mejor_motivo = None, 0.0, []
    for hecho, enlaces in alcance.items():
        if hecho in hechos:
            continue
        definicion = base.hechos[hecho]
        es_condicion = definicion["tipo"] == "condicion"
        if not es_condicion and partes and not set(definicion["partes"]) & set(partes):
            continue
        puntaje, motivo = 0.0, []
        for hip, fc, _r, otras in enlaces:
            otras_c = [grado_premisa(base, p, memoria) for p in otras]
            if any(c is not None and c <= base.umbral for c in otras_c):
                continue
            actual = posib.get(hip, 0.0)
            if es_condicion and actual < 0.3:
                continue
            if enfocado and actual <= 0:
                continue
            exploracion = 0.25 * cobertura[hip] ** 2 / (1 + descartes.get(hip, 0))
            puntaje += fc * (actual + exploracion)
            nombre = base.plagas[hip]["nombre"]
            if nombre not in motivo:
                motivo.append(nombre)
        if es_condicion:
            puntaje *= 0.5
        puntaje *= ORDEN_PARTES.get(definicion["partes"][0], 1.0)
        if puntaje > mejor_puntaje:
            mejor, mejor_puntaje, mejor_motivo = hecho, puntaje, motivo

    if resultado.empate and (mejor is None or base.hechos[mejor]["tipo"] == "condicion"):
        mejor_puntaje = 0.0
        for pista in que_distingue(base, resultado, hechos):
            fuerza = max(fc for hip, fc, _r, _o in alcance[pista["hecho"]] if hip in resultado.empate)
            if fuerza > mejor_puntaje:
                mejor, mejor_puntaje, mejor_motivo = pista["hecho"], fuerza, [pista["apoya"]]
    if mejor is None:
        return None
    return {"hecho": mejor, "pregunta": base.hechos[mejor]["pregunta"], "motivo": mejor_motivo,
            "partes": base.hechos[mejor]["partes"]}


# --------------------------------------------------------------------------
# Explicación
# --------------------------------------------------------------------------

def explicar(base: Base, hipotesis: Hipotesis) -> str:
    plaga = base.plagas[hipotesis.id]
    locales = f" (en la zona: {', '.join(plaga['nombres_locales'])})" if plaga.get("nombres_locales") else ""
    lineas = [f"{plaga['nombre']}{locales}: posibilidad {hipotesis.posibilidad:.0f} % ({hipotesis.nivel})",
              f"Agente causal: {plaga['agente']} ({plaga['tipo']}). Ficha {plaga['ficha']:02d} de la guía del CIP.",
              f"Evidencia a favor {hipotesis.evidencia_favor:.2f}, en contra {hipotesis.evidencia_contra:.2f}. "
              f"Términos de salida: " + ", ".join(f"{t} {v:.2f}" for t, v in hipotesis.fuerzas.items())]
    for d in hipotesis.disparos:
        premisas = " Y ".join(f"'{p['texto']}' [{p['certeza']:+.2f}]" for p in d.premisas)
        signo = "a favor" if d.sentido == "+" else "en contra"
        lineas.append(f"  {d.regla} ({d.fuente}, {signo}): SI {premisas}")
        lineas.append(f"      aporte = peso {d.fc_regla:.2f} x {d.certeza_premisas:.2f} = {d.aporte:.2f}"
                      f"  |  acumulado {d.antes:.2f} -> {d.despues:.2f}")
    return "\n".join(lineas)


def que_distingue(base: Base, resultado: Resultado, hechos: dict) -> list:
    if not resultado.empate:
        return []
    salida = []
    for hecho, enlaces in _alcance(base).items():
        if hecho in hechos or base.hechos[hecho]["tipo"] == "condicion":
            continue
        apoyadas = {hip for hip, _fc, _r, _o in enlaces if hip in resultado.empate}
        if len(apoyadas) == 1:
            hip = apoyadas.pop()
            salida.append({"hecho": hecho, "pregunta": base.hechos[hecho]["pregunta"],
                           "apoya": base.plagas[hip]["nombre"]})
    return salida


def grupo_manejo(base: Base, resultado: Resultado) -> dict | None:
    """Si las dos primeras hipótesis se manejan igual según el experto, lo dice."""
    if len(resultado.diagnosticos) < 2:
        return None
    a, b = resultado.diagnosticos[0], resultado.diagnosticos[1]
    if b.id in base.plagas[a.id].get("grupo_con", []) and a.posibilidad - b.posibilidad < 15:
        return {"plagas": [a.nombre, b.nombre], "nota": base.plagas[a.id]["grupo_manejo"]}
    return None
