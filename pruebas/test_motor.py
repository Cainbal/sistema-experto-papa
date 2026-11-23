"""Pruebas del motor difuso, la calibración y el modelo de Wallin.

    python -m unittest discover -s pruebas -v
"""

import json
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from motor import cargar_base, explicar, grupo_manejo, inferir, que_distingue, siguiente_pregunta  # noqa: E402
from motor import difuso, wallin  # noqa: E402

BASE = cargar_base()
CASOS = json.loads((RAIZ / "pruebas" / "casos.json").read_text(encoding="utf-8"))
PESO = {r["id"]: r["fc"] for r in BASE.reglas}


class TestBase(unittest.TestCase):
    def test_tamano(self):
        self.assertEqual(len(BASE.plagas), 16)
        self.assertGreaterEqual(len(BASE.reglas), 95)

    def test_toda_plaga_tiene_evidencia_observable(self):
        for pid in BASE.plagas:
            tipos = {r["tipo"] for r in BASE.reglas if r["entonces"] == pid}
            self.assertTrue(tipos & {"signo", "sintoma", "dano"}, pid)

    def test_todo_hecho_se_usa(self):
        usados = {p if isinstance(p, str) else p["hecho"] for r in BASE.reglas for p in r["si"]}
        sin_usar = set(BASE.hechos) - usados - {"plantas_afectadas"}  # plantas_afectadas entra a la urgencia
        self.assertEqual(sin_usar, set())

    def test_condiciones_pesan_poco(self):
        for r in BASE.reglas:
            if r["tipo"] == "condicion":
                self.assertLessEqual(r["fc"], 0.3, r["id"])

    def test_plagas_tienen_datos_del_experto(self):
        self.assertIn("platanero", BASE.plagas["rizoctoniasis"]["nombres_locales"])
        self.assertEqual(BASE.plagas["marchitez_bacteriana"]["frecuencia_zona"], "nunca")
        self.assertEqual(BASE.plagas["tizon_tardio"]["grupo_con"], ["alternariosis"])


class TestCalibracion(unittest.TestCase):
    def test_pesos_en_rango(self):
        for r in BASE.reglas:
            self.assertTrue(0.05 <= r["fc"] <= 1.0, r["id"])

    def test_cubre_todas_las_reglas_de_sintomas_de_la_guia(self):
        calibradas = {x["regla"] for x in BASE.calibracion}
        guia = {r["id"] for r in BASE.reglas if r.get("fc_guia") is not None and r["tipo"] in ("signo", "sintoma", "dano")}
        self.assertEqual(guia - calibradas, set())

    def test_signo_exclusivo_pesa_mas_que_sintoma_general(self):
        # "pelusilla blanca" (solo rancha) vs "hojas amarillentas" (tres plagas)
        self.assertGreater(PESO["R01"], 0.85)
        for rid in ("R38", "R50", "R61"):
            self.assertLess(PESO[rid], 0.35, rid)

    def test_sintoma_compartido_se_reparte(self):
        # "manchas marrones en hojas" es de rancha y de alternariosis: ninguna pasa de 0,3
        self.assertLess(PESO["R02"], 0.3)
        self.assertLess(PESO["R08"], 0.3)

    def test_sin_dato_del_experto_usa_la_version_1(self):
        reporte = {x["regla"]: x for x in BASE.calibracion}
        self.assertEqual(reporte["R32"]["origen_p"], "guia")       # marchitez: el experto no la conoce
        self.assertEqual(reporte["R01"]["origen_p"], "experto")

    def test_frecuencia_baja_reduce_el_peso(self):
        sin = cargar_base(calibrar_pesos=False)
        self.assertGreater({r["id"]: r["fc"] for r in sin.reglas}["R32"], PESO["R32"])

    def test_combinaciones_del_experto_se_calibran(self):
        reporte = {x["regla"]: x for x in BASE.calibracion}
        self.assertIn("pierna_negra", reporte["E01"]["competidores"])
        self.assertAlmostEqual(PESO["E01"], 0.5, places=2)


class TestDifuso(unittest.TestCase):
    def test_trapecio(self):
        self.assertEqual(difuso.trapecio(5, 0, 2, 6, 8), 1.0)
        self.assertAlmostEqual(difuso.trapecio(1, 0, 2, 6, 8), 0.5)
        self.assertAlmostEqual(difuso.trapecio(7, 0, 2, 6, 8), 0.5)
        self.assertEqual(difuso.trapecio(9, 0, 2, 6, 8), 0.0)

    def test_fuzzificar_temperatura(self):
        g = difuso.fuzzificar("temperatura", 22)
        self.assertAlmostEqual(g["templada"], 0.5)
        self.assertAlmostEqual(g["calida"], 0.5)
        self.assertEqual(g["fria"], 0.0)

    def test_centroide_crece_con_la_evidencia(self):
        valores = [difuso.posibilidad(s / 10, 0)[0] for s in range(11)]
        self.assertEqual(valores, sorted(valores))
        self.assertLess(valores[0], 20)
        self.assertGreater(valores[-1], 80)
        self.assertAlmostEqual(valores[5], 50, delta=0.5)

    def test_evidencia_en_contra_baja_la_posibilidad(self):
        self.assertLess(difuso.posibilidad(0.9, 0.5)[0], difuso.posibilidad(0.9, 0)[0])

    def test_logica_difusa_no_tiene_corte_brusco(self):
        # Con un umbral clásico (15-21 °C y HR > 90 %), 22 °C y 89 % darían cero.
        r = inferir(BASE, {"temperatura": 22, "humedad_relativa": 89})
        self.assertGreater(r.derivados.get("ambiente_templado_humedo", 0), 0)

    def test_urgencia(self):
        alta = difuso.urgencia(82, afectadas=40)
        baja = difuso.urgencia(20, afectadas=2)
        self.assertEqual(alta["termino"], "actuar_ya")
        self.assertEqual(baja["termino"], "vigilar")
        self.assertGreater(alta["valor"], baja["valor"])


class TestWallin(unittest.TestCase):
    """Puntos publicados por la Universidad de Maine: 18 h de humedad alta dan 3 a 65 °F, 2 a 56 °F,
    1 a 50 °F y 0 a 40 °F u 85 °F."""

    def test_puntos_publicados(self):
        self.assertAlmostEqual(wallin.dsv(18, 18.3)["valor"], 3, delta=0.05)
        self.assertAlmostEqual(wallin.dsv(18, 13.3)["valor"], 2, delta=0.05)
        self.assertAlmostEqual(wallin.dsv(18, 10.0)["valor"], 1, delta=0.05)
        self.assertLess(wallin.dsv(18, 4.4)["valor"], 0.05)
        self.assertLess(wallin.dsv(18, 29.4)["valor"], 0.05)

    def test_reproduce_la_tabla_en_horas_enteras(self):
        centro = {"fresca": 9.4, "templada": 13.6, "optima": 21.0}
        for banda, umbrales in wallin.UMBRALES.items():
            for k, desde in enumerate([0] + umbrales):
                with self.subTest(banda=banda, dsv=k):
                    self.assertAlmostEqual(wallin.dsv(desde, centro[banda])["valor"], k, delta=0.05)

    def test_transicion_gradual(self):
        # entre 18 y 19 h (óptima) la severidad sube de 3 a 4 sin saltos
        valores = [wallin.dsv(18 + i / 10, 20)["valor"] for i in range(11)]
        self.assertEqual(valores, sorted(valores))
        self.assertTrue(all(b - a < 0.6 for a, b in zip(valores, valores[1:])))

    def test_mas_horas_mas_severidad(self):
        valores = [wallin.dsv(h, 18)["valor"] for h in range(0, 25, 2)]
        self.assertEqual(valores, sorted(valores))

    def test_tres_periodos_cortos_no_suman(self):
        horas = []
        for i in range(24):
            hr = 95 if i % 8 < 6 else 60      # tres periodos de 6 h separados por 2 h secas
            horas.append({"hora": f"2026-11-20T{i:02d}:00", "temperatura": 18, "humedad_relativa": hr})
        self.assertLess(wallin.dsv_ultimas_horas(horas), 0.5)

    def test_un_periodo_largo_si_suma(self):
        horas = [{"hora": f"2026-11-20T{i:02d}:00", "temperatura": 18, "humedad_relativa": 95} for i in range(20)]
        self.assertGreater(wallin.dsv_ultimas_horas(horas), 3)

    def test_resumen_diario(self):
        horas = [{"hora": f"2026-11-2{d}T{i:02d}:00", "temperatura": 16, "humedad_relativa": 96 if d == 1 else 60}
                 for d in (0, 1) for i in range(24)]
        r = wallin.resumen_diario(horas)
        self.assertEqual([d["nivel"] for d in r["dias"]], ["bajo", "alto"])
        self.assertEqual(r["umbral_blitecast"], 18)

    def test_clima_alimenta_al_motor(self):
        r = inferir(BASE, {"dsv_rancha": 3.5, "h_manchas_necroticas": 1})
        self.assertGreater(r.derivados["ambiente_templado_humedo"], 0.9)
        self.assertIn("D09", [d.regla for d in r.traza])


class TestInferencia(unittest.TestCase):
    def test_casos_de_la_guia(self):
        for caso in CASOS:
            with self.subTest(caso["nombre"]):
                r = inferir(BASE, caso["hechos"])
                self.assertEqual(r.diagnosticos[0].id, caso["esperado"])
                segunda = r.diagnosticos[1].posibilidad if len(r.diagnosticos) > 1 else 0
                self.assertGreaterEqual(r.diagnosticos[0].posibilidad - segunda, 5)
                self.assertGreater(r.diagnosticos[0].posibilidad, 55)

    def test_casos_del_experto(self):
        casos = {c["id"]: c for c in BASE.experto["casos"]}
        for cid in ("crispin_1", "crispin_2"):
            with self.subTest(cid):
                self.assertEqual(inferir(BASE, casos[cid]["hechos"]).diagnosticos[0].id, casos[cid]["esperado"])
        # El caso 3 es una discrepancia documentada: el experto dice verruga, la guía no la respalda.
        self.assertNotEqual(inferir(BASE, casos["crispin_3"]["hechos"]).diagnosticos[0].id, "verruga")

    def test_sin_hechos_no_concluye(self):
        r = inferir(BASE, {})
        self.assertEqual((r.diagnosticos, r.riesgos, r.traza, r.urgencia), ([], [], [], None))

    def test_no_y_no_se_no_disparan_a_favor(self):
        r = inferir(BASE, {"h_perforaciones": -1.0, "x_tumores": 0.0})
        self.assertEqual(r.diagnosticos, [])

    def test_un_poco_pesa_menos_que_si(self):
        fuerte = inferir(BASE, {"h_perforaciones": 1.0}).diagnosticos[0].posibilidad
        debil = inferir(BASE, {"h_perforaciones": 0.5}).diagnosticos[0].posibilidad
        self.assertLess(debil, fuerte)

    def test_descarte_del_experto(self):
        con = inferir(BASE, {"p_marchitez": 1, "tu_exudado_ojos": 1})
        sin = inferir(BASE, {"p_marchitez": 1, "tu_exudado_ojos": 1, "tu_exudado_anillo_vascular": -1})
        h_con = next(h for h in con.diagnosticos if h.id == "marchitez_bacteriana")
        h_sin = next(h for h in sin.diagnosticos if h.id == "marchitez_bacteriana")
        self.assertGreater(h_sin.evidencia_contra, 0.7)
        self.assertLess(h_sin.posibilidad, h_con.posibilidad)
        self.assertIn("N01", [d.regla for d in h_sin.disparos])

    def test_condiciones_solas_son_riesgo(self):
        r = inferir(BASE, {"temperatura": 17, "humedad_relativa": 95})
        self.assertEqual(r.diagnosticos, [])
        self.assertEqual([h.id for h in r.riesgos], ["tizon_tardio"])
        self.assertIn("temperatura", r.fuzzificacion)

    def test_encadenamiento(self):
        r = inferir(BASE, {"temperatura": 26, "c_seco_sin_lluvias": 1, "h_perforaciones": 1})
        reglas = [d.regla for d in r.traza]
        self.assertLess(reglas.index("D04"), reglas.index("D05"))
        self.assertIn("R80", reglas)

    def test_compartidos_y_como_se_rompe(self):
        hechos = {"p_enanismo": 1, "h_amarillamiento": 1, "tu_tamano_reducido": 1}
        r = inferir(BASE, hechos)
        orden = [h.id for h in r.diagnosticos]
        self.assertLess(orden.index("virosis"), orden.index("nematodo_quiste"))  # virosis es más frecuente en la zona
        r = inferir(BASE, {**hechos, "r_quistes": 1})
        self.assertEqual(r.diagnosticos[0].id, "nematodo_quiste")

    def test_grupo_de_manejo(self):
        r = inferir(BASE, {"h_manchas_necroticas": 1})
        g = grupo_manejo(BASE, r)
        self.assertIsNotNone(g)
        self.assertEqual(set(g["plagas"]), {"Tizón tardío", "Alternariosis"})

    def test_que_distingue(self):
        r = inferir(BASE, {"h_manchas_necroticas": 1})
        if r.empate:
            pistas = {d["hecho"] for d in que_distingue(BASE, r, {"h_manchas_necroticas": 1})}
            self.assertTrue(pistas & {"h_pelusilla_enves", "h_anillos_concentricos"})

    def test_camara_entra_al_motor(self):
        r = inferir(BASE, {"foto_rancha": 0.9, "h_manchas_necroticas": 1})
        self.assertEqual(r.diagnosticos[0].id, "tizon_tardio")
        sana = inferir(BASE, {"foto_sana": 0.9, "h_manchas_necroticas": 1})
        h = next(h for h in sana.diagnosticos if h.id == "tizon_tardio")
        self.assertGreater(h.evidencia_contra, 0)

    def test_explicacion(self):
        r = inferir(BASE, CASOS[0]["hechos"])
        texto = explicar(BASE, r.diagnosticos[0])
        for fragmento in ("R01", "Phytophthora infestans", "Ficha 01", "rancha", "posibilidad"):
            self.assertIn(fragmento, texto)

    def test_urgencia_en_resultado(self):
        r = inferir(BASE, {**CASOS[0]["hechos"], "plantas_afectadas": 40})
        self.assertIsNotNone(r.urgencia)
        self.assertEqual(r.urgencia["termino"], "actuar_ya")


class TestConsulta(unittest.TestCase):
    def consultar(self, verdad):
        partes = sorted({p for h in verdad for p in BASE.hechos[h]["partes"] if p != "condiciones"})
        hechos = {h: v for h, v in verdad.items() if BASE.hechos[h]["tipo"] == "medicion"}
        n = 0
        while (sig := siguiente_pregunta(BASE, hechos, partes)) is not None:
            self.assertNotIn(sig["hecho"], hechos)
            self.assertTrue(sig["motivo"])
            hechos[sig["hecho"]] = float(verdad.get(sig["hecho"], -1))
            n += 1
            self.assertLessEqual(n, 15)
        return inferir(BASE, hechos), n

    def test_la_consulta_guiada_llega_al_diagnostico(self):
        for caso in CASOS:
            with self.subTest(caso["nombre"]):
                r, _ = self.consultar(caso["hechos"])
                self.assertEqual(r.diagnosticos[0].id, caso["esperado"])

    def test_empieza_por_las_hojas_y_no_por_el_clima(self):
        sig = siguiente_pregunta(BASE, {}, ["hojas", "tallos", "tuberculos"])
        self.assertIn("hojas", BASE.hechos[sig["hecho"]]["partes"])

    def test_se_detiene_con_diagnostico_claro(self):
        hechos = {"h_pelusilla_enves": 1, "t_manchas_alargadas_quebradizo": 1, "tu_corte_estrias_necroticas": 1}
        self.assertIsNone(siguiente_pregunta(BASE, hechos, ["hojas", "tallos", "tuberculos"]))


if __name__ == "__main__":
    unittest.main()
