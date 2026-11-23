"""Calibración de los pesos de las reglas con los datos del experto (teorema de Bayes).

Problema que resuelve: en la versión 1 los pesos de las reglas los asignó el programador. En la
entrevista, el experto puntuó de 0 a 10 cada síntoma de cada plaga. Por el patrón de sus respuestas
(por ejemplo, 9 a "hojas amarillentas" en virosis y 4 a "bolitas en las raíces" en el nematodo), lo
que midió es qué tan típico es el síntoma en la plaga: P(síntoma | plaga). Eso no es lo que necesita
una regla "SI síntoma ENTONCES plaga", que debe medir cuánto apunta el síntoma a la plaga.

Bayes convierte una cosa en la otra:

    P(plaga | síntoma) = P(síntoma | plaga) · P(plaga) / P(síntoma)

    P(síntoma) ≈ Σ P(síntoma | plaga') · P(plaga')   (todas las plagas que comparten el síntoma)
               + fuga                                (otras causas: nutrición, clima, otras plagas)

- P(síntoma | plaga): puntaje del experto / 10. Si no lo evaluó, se usa el peso de la versión 1
  (criterio basado en la guía del CIP).
- P(plaga): frecuencia en la zona según el experto (nunca, rara vez, a veces, siempre).
- fuga: depende de qué tan específico es el síntoma (signo único, específico o general).

Así, un síntoma típico de muchas plagas ("hojas amarillentas") termina pesando poco para cada una, y un
signo exclusivo ("pelusilla blanca en el envés") pesa mucho aunque el experto le haya puesto 5.
Cuando el experto dio además una certeza directa para la misma regla, se promedian ambas.
"""

from __future__ import annotations

import copy

TIPOS_SINTOMA = {"signo", "sintoma", "dano"}


def _clip(x, lo, hi):
    return max(lo, min(hi, x))


def calibrar(base: dict, experto: dict, alfa: float | None = None) -> tuple[dict, list]:
    base = copy.deepcopy(base)
    cfg = base["meta"]["calibracion"]
    alfa = cfg.get("alfa", 0.5) if alfa is None else alfa
    lo, hi = cfg["limites_peso"]
    prior_map, fuga_map = cfg["prior"], cfg["fuga"]
    especificidad = {h["id"]: h.get("especificidad", "especifico") for h in base["hechos"]}
    prior = {p["id"]: prior_map.get(experto["frecuencia_zona"].get(p["id"], "a veces"), 0.10)
             for p in base["plagas"]}
    tip = experto["tipicidad"]

    def clave(regla):
        return "+".join(regla["si"])

    sintomas = [r for r in base["reglas"]
                if r.get("fuente") == "guia" and r["tipo"] in TIPOS_SINTOMA and r["entonces"] in prior]

    def p_s_d(regla):
        k = clave(regla)
        puntajes = tip.get(regla["entonces"], {})
        if k in puntajes:
            return _clip(puntajes[k] / 10.0, 0.05, 0.95), "experto"
        return regla["fc_guia"], "guia"

    reporte = []
    simples = {}
    for o in sintomas:
        if len(o["si"]) == 1:
            simples.setdefault(o["si"][0], {})[o["entonces"]] = o

    def p_simple(plaga, hecho):
        regla = simples.get(hecho, {}).get(plaga)
        return p_s_d(regla)[0] if regla else None

    def fuga_de(hechos):
        if len(hechos) == 1:
            return fuga_map[especificidad[hechos[0]]]
        return min(fuga_map[especificidad[h]] for h in hechos) * 0.5

    def registrar(r, p, origen, competidores, fuga, bayes, peso):
        r["fc"] = peso
        r["calibracion"] = {
            "p_sintoma_dado_plaga": round(p, 3), "origen_p": origen, "prior": prior[r["entonces"]],
            "competidores": sorted(competidores), "fuga": fuga, "peso_bayes": round(bayes, 3),
        }
        reporte.append({"regla": r["id"], "plaga": r["entonces"], "si": r["si"], "fc_v1": r.get("fc_guia"),
                        "peso": peso, "fuente": r.get("fuente"), **r["calibracion"]})

    for r in sintomas:
        k = clave(r)
        competidores = [o for o in sintomas if clave(o) == k]
        fuga = fuga_de(r["si"])
        p, origen = p_s_d(r)
        if "tipicidad_combinacion" in r:
            p = (p + r["tipicidad_combinacion"]) / 2.0
            origen = "experto (promedio con su combinación)"
            r["fuente"] = "guia+experto"
        numerador = p * prior[r["entonces"]]
        denominador = numerador + sum(p_s_d(o)[0] * prior[o["entonces"]] for o in competidores if o is not r) + fuga
        bayes = numerador / denominador
        # Contracción hacia la guía: con un solo experto sus puntajes tienen ruido, así que el peso final
        # mezcla lo que dice Bayes con el peso basado en la guía (alfa = confianza en el experto).
        mezcla = alfa * bayes + (1 - alfa) * r["fc_guia"]
        registrar(r, p, origen, {o["entonces"] for o in competidores if o is not r}, fuga, bayes,
                  round(_clip(mezcla, lo, hi), 3))

    # Combinaciones propias del experto: P(combinación | plaga) = su puntaje; los competidores son las
    # plagas que tienen regla para cada uno de los síntomas de la combinación (independencia).
    for r in base["reglas"]:
        if r.get("fuente") != "experto" or "tipicidad_experto" not in r:
            continue
        p = r["tipicidad_experto"]
        numerador = p * prior[r["entonces"]]
        competidores, suma = set(), 0.0
        for otra in prior:
            if otra == r["entonces"]:
                continue
            ps = [p_simple(otra, h) for h in r["si"]]
            if all(x is not None for x in ps):
                producto = 1.0
                for x in ps:
                    producto *= x
                suma += producto * prior[otra]
                competidores.add(otra)
        fuga = fuga_de(r["si"])
        bayes = numerador / (numerador + suma + fuga)
        registrar(r, p, "experto (combinación)", competidores, fuga, bayes, round(_clip(bayes, lo, hi), 3))
    base["meta"]["prior_zona"] = prior
    return base, reporte
