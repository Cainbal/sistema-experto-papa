"""Consulta por consola: el sistema pregunta, razona y explica.

Uso:  python consola.py
En cualquier pregunta se puede escribir "p" para ver por qué se pregunta.
"""

import sys

from motor import cargar_base, explicar, grupo_manejo, inferir, que_distingue, siguiente_pregunta
from motor import difuso

# En consolas de Windows con una página de códigos antigua, un carácter que no
# exista en ella se reemplaza en vez de detener el programa.
for flujo in (sys.stdout, sys.stderr):
    if hasattr(flujo, "reconfigure"):
        flujo.reconfigure(errors="replace")

RESPUESTAS = {"s": 1.0, "u": 0.5, "?": 0.0, "n": -1.0}


def elegir_partes(base):
    partes = [(k, v) for k, v in base.partes.items() if k != "condiciones"]
    print("\n¿En qué parte de la planta ves el problema? (números separados por coma)")
    for i, (_k, nombre) in enumerate(partes, 1):
        print(f"  {i}. {nombre}")
    while True:
        try:
            indices = [int(x) for x in input("> ").replace(" ", "").split(",") if x]
            if indices and all(1 <= i <= len(partes) for i in indices):
                return [partes[i - 1][0] for i in indices]
        except ValueError:
            pass
        print("Escribe por ejemplo: 1,5")


def preguntar_medicion(texto):
    valor = input(f"{texto} (Enter si no lo sabes): ").strip().replace(",", ".")
    try:
        return float(valor) if valor else None
    except ValueError:
        return None


def main():
    base = cargar_base()
    print("=" * 70)
    print("SISTEMA EXPERTO DIFUSO: plagas y enfermedades de la papa (zona andina)")
    for fuente in base.meta["fuentes"]:
        print("  -", fuente)
    print("=" * 70)

    partes = elegir_partes(base)
    hechos = {}
    for medicion in ("temperatura", "humedad_relativa", "plantas_afectadas"):
        valor = preguntar_medicion(base.hechos[medicion]["pregunta"])
        if valor is not None:
            hechos[medicion] = valor
            grados = difuso.fuzzificar(medicion, valor)
            texto = ", ".join(f"{difuso.VARIABLES[medicion]['etiquetas'][t]} {g:.2f}" for t, g in grados.items() if g > 0)
            print(f"  Fuzzificación: {texto}")

    print("\nResponde: s = sí, u = un poco / creo que sí, n = no, ? = no sé, p = ¿por qué me preguntas esto?")
    while (siguiente := siguiente_pregunta(base, hechos, partes)) is not None:
        while True:
            r = input(f"\n{siguiente['pregunta']} [s/u/n/?/p]: ").strip().lower()
            if r == "p":
                print("  Porque ayuda a evaluar: " + ", ".join(siguiente["motivo"]) + ".")
            elif r in RESPUESTAS:
                hechos[siguiente["hecho"]] = RESPUESTAS[r]
                break

    resultado = inferir(base, hechos)
    print("\n" + "=" * 70 + "\nRESULTADO\n" + "=" * 70)
    if not resultado.diagnosticos:
        print("Con lo observado no se puede concluir ninguna plaga de la guía.")
    for h in resultado.diagnosticos:
        if h.posibilidad < 30:
            continue
        print("\n" + explicar(base, h))
    if resultado.empate:
        print("\nHay un empate. Para distinguir, conviene revisar:")
        for d in que_distingue(base, resultado, hechos)[:6]:
            print(f"  - {d['pregunta']}  (apoyaría: {d['apoya']})")
    grupo = grupo_manejo(base, resultado)
    if grupo:
        print(f"\nNota del experto: {' y '.join(grupo['plagas'])} se manejan igual. {grupo['nota']}")
    if resultado.riesgos:
        print("\nCondiciones favorables (riesgo, no diagnóstico):")
        for h in resultado.riesgos:
            print(f"  - {h.nombre}: {h.posibilidad:.0f} %")
    if resultado.urgencia:
        u = resultado.urgencia
        print(f"\nUrgencia: {u['etiqueta']} ({u['valor']:.0f}/100)")
    if resultado.diagnosticos and resultado.diagnosticos[0].posibilidad >= 30:
        plaga = base.plagas[resultado.diagnosticos[0].id]
        print(f"\nManejo recomendado para {plaga['nombre']} (guía del CIP, ficha {plaga['ficha']:02d}):")
        for medida in plaga["manejo"]:
            print(f"  - {medida}")


if __name__ == "__main__":
    main()
