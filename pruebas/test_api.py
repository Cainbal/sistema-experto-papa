"""Pruebas de la API. Requieren: pip install -r requirements-pruebas.txt"""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from fastapi.testclient import TestClient
    from api import main
except (ImportError, RuntimeError):                   # falta FastAPI o su cliente de pruebas
    TestClient = None


@unittest.skipIf(TestClient is None, "Falta instalar requirements-pruebas.txt")
class TestAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = TestClient(main.app)


    def test_base(self):
        d = self.c.get("/api/base").json()
        self.assertEqual(len(d["plagas"]), 16)
        self.assertEqual(len(d["reglas"]), len(main.BASE.reglas))
        self.assertNotIn("condiciones", d["partes"])
        self.assertIn("posibilidad", d["variables"])
        self.assertEqual(len(d["wallin"]["reglas"]), 16)
        self.assertTrue(d["calibracion"])
        self.assertIn("rizoctoniasis", d["experto"]["nombres_locales"].get("platanero", "rizoctoniasis"))
        descartes = [r for r in d["reglas"] if r["sentido"] == "-"]
        self.assertTrue(descartes)

    def test_consulta_vacia_propone_pregunta(self):
        d = self.c.post("/api/consulta", json={"hechos": {}, "partes": ["hojas"]}).json()
        self.assertEqual(d["diagnosticos"], [])
        self.assertIn("pregunta", d["siguiente"])
        self.assertIsNone(d["urgencia"])

    def test_consulta_con_diagnostico(self):
        d = self.c.post("/api/consulta", json={
            "hechos": {"h_pelusilla_enves": 1, "h_manchas_necroticas": 1, "temperatura": 17,
                       "humedad_relativa": 95, "plantas_afectadas": 20},
            "partes": ["hojas"]}).json()
        top = d["diagnosticos"][0]
        self.assertEqual(top["id"], "tizon_tardio")
        self.assertGreater(top["posibilidad"], 75)
        self.assertEqual(set(top["fuerzas"]), {"baja", "media", "alta"})
        self.assertIn("R01", [x["regla"] for x in top["disparos"]])
        self.assertIn("Uso de semilla sana", top["ficha"]["manejo"])
        self.assertIn("rancha", top["ficha"]["nombres_locales"])
        self.assertIn("ambiente_templado_humedo", d["derivados"])
        self.assertAlmostEqual(d["fuzzificacion"]["humedad_relativa"]["grados"]["alta"], 1.0)
        self.assertIn(d["urgencia"]["termino"], ("esta_semana", "actuar_ya"))
        self.assertIsNone(d["siguiente"])

    def test_descartadas(self):
        d = self.c.post("/api/consulta", json={"hechos": {"tu_exudado_anillo_vascular": -1}}).json()
        self.assertEqual([x["id"] for x in d["descartadas"]], ["marchitez_bacteriana"])
        self.assertEqual(d["diagnosticos"], [])
        d = self.c.post("/api/consulta", json={"hechos": {"p_marchitez": 1, "tu_exudado_anillo_vascular": -1}}).json()
        marchitez = next(h for h in d["diagnosticos"] if h["id"] == "marchitez_bacteriana")
        self.assertGreater(marchitez["evidencia_contra"], 0.7)

    def test_rechaza_datos_invalidos(self):
        for cuerpo in ({"hechos": {"no_existe": 1}}, {"hechos": {"h_minado": 5}},
                       {"hechos": {"ambiente_calido": 1}}, {"partes": ["condiciones"]},
                       {"hechos": {"humedad_relativa": 140}}, {"hechos": {"foto_rancha": -0.5}}):
            self.assertEqual(self.c.post("/api/consulta", json=cuerpo).status_code, 422, cuerpo)


    def test_clima_sin_internet_usa_ejemplo_y_lo_dice(self):
        original = main.clima.pronostico_open_meteo
        main.clima._cache.clear()

        def sin_red(lat, lon):
            raise OSError("sin red")
        main.clima.pronostico_open_meteo = sin_red
        try:
            d = self.c.get("/api/clima").json()
        finally:
            main.clima.pronostico_open_meteo = original
        self.assertEqual(d["fuente"], "ejemplo")
        self.assertIn("no reales", d["aviso"])
        self.assertEqual(len(d["dias"]), 7)
        self.assertIn(d["alerta"]["nivel"], ("bajo", "medio", "alto"))
        self.assertEqual(d["alerta"]["nivel"], "alto")   # el ejemplo trae dos días de lluvia

    def test_clima_con_respuesta_de_open_meteo(self):
        original = main.clima._pedir_json
        main.clima._cache.clear()
        horas = [f"2026-11-{20 + i // 24:02d}T{i % 24:02d}:00" for i in range(7 * 24)]

        def falso(url, parametros, espera=8.0):
            self.assertEqual(parametros["hourly"], "temperature_2m,relative_humidity_2m,precipitation")
            return {"elevation": 3200.0, "timezone": "America/Lima",
                    "hourly": {"time": horas, "temperature_2m": [None if i == 5 else 14.0 for i in range(len(horas))],
                               "relative_humidity_2m": [None if i == 9 else 96 for i in range(len(horas))],
                               "precipitation": [None if i == 13 else 0.2 for i in range(len(horas))]}}
        main.clima._pedir_json = falso
        try:
            d = self.c.get("/api/clima?lat=-9.9&lon=-76.2").json()
        finally:
            main.clima._pedir_json = original
            main.clima._cache.clear()
        self.assertEqual(d["fuente"], "open-meteo")
        self.assertIsNone(d["aviso"])
        self.assertEqual(d["ubicacion"]["elevacion"], 3200.0)
        self.assertTrue(all(x["nivel"] == "alto" for x in d["dias"][1:]))

    def test_camara_sin_modelo_responde_503_o_funciona(self):
        r = self.c.post("/api/camara", files={"foto": ("x.jpg", b"no es una imagen", "image/jpeg")})
        self.assertIn(r.status_code, (422, 503))

    def test_web_compilada(self):
        if not main.WEB.exists():
            self.skipTest("Falta compilar la interfaz (npm run build)")
        self.assertIn("<div id=\"root\">", self.c.get("/").text)

    def test_clima_da_hechos_para_la_consulta(self):
        """Temperatura y humedad de la hora actual y severidad de Wallin de las 24 h anteriores."""
        from datetime import datetime
        horas = [{"hora": f"2026-11-{20 + i // 24:02d}T{i % 24:02d}:00", "temperatura": 14.0,
                  "humedad_relativa": 96 if i >= 24 else 60, "lluvia": 0.0} for i in range(4 * 24)]
        actual = main.clima.condiciones_actuales(horas, datetime(2026, 11, 22, 13, 40))
        self.assertEqual(actual["hora"], "2026-11-22T13:00")
        self.assertEqual(actual["hechos"]["temperatura"], 14.0)
        self.assertEqual(actual["hechos"]["humedad_relativa"], 96.0)
        self.assertEqual(actual["horas_con_datos"], 24)
        self.assertGreaterEqual(actual["dsv_24h"], 3)          # 24 h seguidas sobre 90 % a 14 °C
        self.assertEqual(actual["hechos"]["dsv_rancha"], actual["dsv_24h"])
        seco = main.clima.condiciones_actuales(horas, datetime(2026, 11, 20, 23, 5))
        self.assertEqual(seco["dsv_24h"], 0)
        poco = main.clima.condiciones_actuales(horas, datetime(2026, 11, 20, 3, 0))
        self.assertIsNone(poco["dsv_24h"])                      # menos de 6 h: no se calcula
        self.assertNotIn("dsv_rancha", poco["hechos"])
        self.assertIn("actual", self.c.get("/api/clima").json())




if __name__ == "__main__":
    unittest.main()
