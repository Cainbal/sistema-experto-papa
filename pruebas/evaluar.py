"""Evaluación del sistema con números. Genera web/public/evaluacion.json (lo muestra la interfaz).

    python pruebas/evaluar.py

Qué mide:
1. Casos de la guía del CIP (16 fichas, 17 casos): ¿el primer diagnóstico es el correcto y con qué margen?
2. Consulta guiada: el sistema elige las preguntas; ¿llega al diagnóstico y en cuántas preguntas?
3. Robustez: usuarios simulados que dudan ("un poco", "no sé") o se equivocan a veces.
4. Efecto de la calibración con los datos del experto (pesos calibrados vs pesos de la guía).
5. Casos contados por el experto.
6. Modelo de Wallin difuso contra los puntos publicados.
7. Cámara (métricas del entrenamiento).
8. Pruebas automáticas.
"""

from __future__ import annotations

import json
import random
import statistics
import sys
import unittest
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from motor import cargar_base, inferir, siguiente_pregunta  # noqa: E402
from motor import wallin  # noqa: E402

CASOS = json.loads((RAIZ / "pruebas" / "casos.json").read_text(encoding="utf-8"))
SALIDA = RAIZ / "web" / "public" / "evaluacion.json"


def margen(r):
    if not r.diagnosticos:
        return 0.0
    segunda = r.diagnosticos[1].posibilidad if len(r.diagnosticos) > 1 else 0.0
    return r.diagnosticos[0].posibilidad - segunda


def casos_completos(base):
    filas = []
    for c in CASOS:
        r = inferir(base, c["hechos"])
        top = r.diagnosticos[0] if r.diagnosticos else None
        filas.append({"caso": c["nombre"], "ficha": c["ficha"], "esperado": base.plagas[c["esperado"]]["nombre"],
                      "obtenido": top.nombre if top else None, "posibilidad": top.posibilidad if top else 0,
                      "margen": round(margen(r), 1), "ok": bool(top and top.id == c["esperado"])})
    return filas


def consulta(base, verdad, responder):
    partes = sorted({p for h in verdad for p in base.hechos[h]["partes"] if p != "condiciones"})
    hechos = {h: v for h, v in verdad.items() if base.hechos[h]["tipo"] == "medicion"}
    n = 0
    while (sig := siguiente_pregunta(base, hechos, partes)) is not None:
        hechos[sig["hecho"]] = responder(sig["hecho"], verdad.get(sig["hecho"]))
        n += 1
    return inferir(base, hechos), n


def guiada(base):
    filas = []
    for c in CASOS:
        r, n = consulta(base, c["hechos"], lambda h, v: float(v) if v is not None else -1.0)
        top = r.diagnosticos[0] if r.diagnosticos else None
        filas.append({"caso": c["nombre"], "preguntas": n, "obtenido": top.nombre if top else None,
                      "posibilidad": top.posibilidad if top else 0, "ok": bool(top and top.id == c["esperado"])})
    return filas


def robustez(base, repeticiones=40, semilla=2026):
    """Usuario que ve el síntoma: sí 60 %, un poco 25 %, no sé 15 %.
    Usuario que no lo ve: no 85 %, no sé 10 %, un poco 5 % (se equivoca)."""
    rng = random.Random(semilla)

    def responder(_h, v):
        x = rng.random()
        if v is not None and v > 0:
            return 1.0 if x < 0.60 else 0.5 if x < 0.85 else 0.0
        return -1.0 if x < 0.85 else 0.0 if x < 0.95 else 0.5

    top1 = top3 = total = 0
    preguntas = []
    por_plaga = {}
    for c in CASOS:
        for _ in range(repeticiones):
            r, n = consulta(base, c["hechos"], responder)
            ids = [h.id for h in r.diagnosticos]
            ok = ids[:1] == [c["esperado"]]
            top1 += ok
            top3 += c["esperado"] in ids[:3]
            total += 1
            preguntas.append(n)
            por_plaga.setdefault(c["esperado"], []).append(ok)
    # Acierto esperado en la zona: cada plaga pesa según qué tan seguido aparece (según el experto).
    prior = CALIBRADA_PRIOR
    ponderado = sum(prior[p] * statistics.mean(v) for p, v in por_plaga.items()) / sum(prior[p] for p in por_plaga)
    return {"simulaciones": total, "acierto_primero": round(top1 / total, 3), "acierto_entre_3": round(top3 / total, 3),
            "acierto_ponderado_por_frecuencia_en_la_zona": round(ponderado, 3),
            "preguntas_promedio": round(statistics.mean(preguntas), 1),
            "modelo_de_usuario": "Si ve el síntoma responde sí (60 %), un poco (25 %) o no sé (15 %); si no lo ve, "
                                 "no (85 %), no sé (10 %) o un poco (5 %, error)."}


def resumen_casos(filas):
    return {"aciertos": sum(f["ok"] for f in filas), "total": len(filas),
            "margen_promedio": round(statistics.mean(f["margen"] for f in filas), 1),
            "margen_minimo": round(min(f["margen"] for f in filas), 1)}


def resumen_guiada(filas):
    return {"aciertos": sum(f["ok"] for f in filas), "total": len(filas),
            "preguntas_promedio": round(statistics.mean(f["preguntas"] for f in filas), 1),
            "preguntas_maximo": max(f["preguntas"] for f in filas)}


def experto(base):
    salida = []
    for c in base.experto["casos"]:
        r = inferir(base, c["hechos"])
        salida.append({"id": c["id"], "relato": c["texto"], "experto_dijo": base.plagas[c["esperado"]]["nombre"],
                       "sistema": [{"plaga": h.nombre, "posibilidad": h.posibilidad} for h in r.diagnosticos[:3]],
                       "coincide": bool(r.diagnosticos and r.diagnosticos[0].id == c["esperado"]),
                       "discrepancia": bool(c.get("discrepancia")), "nota": c.get("nota", "")})
    return salida


def sensibilidad():
    """Cómo cambian los resultados según cuánto se confía en el experto (alfa)."""
    filas = []
    for alfa in (0.0, 0.25, 0.5, 0.75, 1.0):
        b = cargar_base(alfa=alfa)
        c, g, r = resumen_casos(casos_completos(b)), resumen_guiada(guiada(b)), robustez(b)
        filas.append({"alfa": alfa, "casos_aciertos": c["aciertos"], "margen_minimo": c["margen_minimo"],
                      "guiada_aciertos": g["aciertos"], "guiada_preguntas": g["preguntas_promedio"],
                      "robustez_primero": r["acierto_primero"], "robustez_zona": r["acierto_ponderado_por_frecuencia_en_la_zona"]})
    return filas


def puntos_wallin():
    puntos = [(18, 65, 3), (18, 56, 2), (18, 50, 1), (18, 40, 0), (18, 85, 0)]
    return [{"horas": h, "temperatura_f": f, "temperatura_c": round((f - 32) / 1.8, 1), "publicado": v,
             "modelo": wallin.dsv(h, (f - 32) / 1.8)["valor"]} for h, f, v in puntos]


def pruebas_automaticas():
    # Pruebas del motor y de la API (las de la interfaz necesitan un navegador y se corren aparte).
    carpeta = str(RAIZ / "pruebas")
    suite = unittest.TestSuite(unittest.defaultTestLoader.discover(carpeta, pattern=patron, top_level_dir=carpeta)
                               for patron in ("test_motor.py", "test_api.py"))
    resultado = unittest.TestResult()
    suite.run(resultado)
    return {"ejecutadas": resultado.testsRun, "fallidas": len(resultado.failures) + len(resultado.errors),
            "omitidas": len(resultado.skipped)}


CALIBRADA_PRIOR = cargar_base().meta["prior_zona"]


def main():
    calibrada = cargar_base()
    guia = cargar_base(calibrar_pesos=False)
    completos = casos_completos(calibrada)
    completos_guia = casos_completos(guia)
    guiada_cal = guiada(calibrada)
    guiada_guia = guiada(guia)
    meta_camara = RAIZ / "modelos" / "hoja_papa.json"
    camara = json.loads(meta_camara.read_text(encoding="utf-8"))["metricas"] if meta_camara.exists() else None
    datos = {
        "fecha": date.today().isoformat(),
        "casos_guia": {"resumen": resumen_casos(completos), "filas": completos},
        "consulta_guiada": {"resumen": resumen_guiada(guiada_cal), "filas": guiada_cal},
        "robustez": robustez(calibrada),
        "calibracion": {
            "calibrada": {**resumen_casos(completos), "guiada": resumen_guiada(guiada_cal)},
            "pesos_de_la_guia": {**resumen_casos(completos_guia), "guiada": resumen_guiada(guiada_guia)},
            "robustez_pesos_de_la_guia": robustez(guia),
        },
        "sensibilidad_alfa": sensibilidad(),
        "experto": experto(calibrada),
        "wallin": puntos_wallin(),
        "camara": camara,
        "pruebas": pruebas_automaticas(),
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    r = datos
    print("Casos de la guía:", r["casos_guia"]["resumen"])
    print("Consulta guiada:", r["consulta_guiada"]["resumen"])
    print("Robustez:", r["robustez"])
    print("Pesos de la guía (sin calibrar):", r["calibracion"]["pesos_de_la_guia"], r["calibracion"]["robustez_pesos_de_la_guia"])
    print("Wallin:", r["wallin"])
    print("Pruebas:", r["pruebas"])
    print("Guardado en", SALIDA)


if __name__ == "__main__":
    main()
