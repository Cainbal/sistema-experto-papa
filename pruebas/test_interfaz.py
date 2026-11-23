"""Pruebas de extremo a extremo: manejan la interfaz en un navegador real.

Son opcionales. Requieren:  pip install -r requirements-pruebas.txt  (y un
Chrome o Chromium instalado, o `playwright install chromium`).

    python -m unittest pruebas.test_interfaz -v

Para probar otro motor de navegador:  NAVEGADOR=firefox  o  NAVEGADOR=webkit
"""

import glob
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

try:
    import uvicorn
    from playwright.sync_api import sync_playwright
    from api import main
    BASE = main.BASE
    DISPONIBLE = (RAIZ / "web" / "dist" / "index.html").exists()
except ImportError:
    DISPONIBLE = False

CASOS = json.loads((RAIZ / "pruebas" / "casos.json").read_text(encoding="utf-8"))
NAVEGADOR = os.environ.get("NAVEGADOR", "chromium")
# Una foto de rancha de PlantVillage (Hughes y Salathé, 2015) viaja con las pruebas; si falta, se busca en el conjunto completo.
FOTO_RANCHA = (sorted(glob.glob(str(RAIZ / "pruebas" / "fotos" / "*.jpg")))
               or sorted(glob.glob(str(RAIZ.parent / "datos" / "pv" / "raw" / "color" / "Potato___Late_blight" / "*")))[:1])


def _lanzar(p):
    motor = getattr(p, NAVEGADOR)
    try:
        return motor.launch()
    except Exception:
        if NAVEGADOR != "chromium":
            raise
        return motor.launch(channel="chrome", args=["--no-sandbox"])


@unittest.skipUnless(DISPONIBLE, "Falta playwright, uvicorn o la interfaz compilada (web/dist)")
class TestInterfaz(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            puerto = s.getsockname()[1]
        cls.url = f"http://127.0.0.1:{puerto}"
        cls.servidor = uvicorn.Server(uvicorn.Config(main.app, port=puerto, log_level="error"))
        threading.Thread(target=cls.servidor.run, daemon=True).start()
        while not cls.servidor.started:
            time.sleep(0.05)
        cls.pw = sync_playwright().start()
        try:
            cls.navegador = _lanzar(cls.pw)
        except Exception as e:                       # navegador no instalado
            cls.pw.stop()
            cls.servidor.should_exit = True
            raise unittest.SkipTest(f"No se pudo abrir {NAVEGADOR}: {e}")
        cls.pregunta_a_hecho = {h["pregunta"]: k for k, h in BASE.hechos.items()}

    @classmethod
    def tearDownClass(cls):
        cls.navegador.close()
        cls.pw.stop()
        cls.servidor.should_exit = True

    def pagina(self, ancho=1280, alto=900, modo="agricultor", voz=None):
        pagina = self.navegador.new_page(viewport={"width": ancho, "height": alto})
        if voz is not None:   # reconocimiento de voz simulado: devuelve estas frases en orden
            pagina.add_init_script("""(dichos => {
                class Falso { start() { const t = dichos.shift() ?? ""; setTimeout(() => {
                    this.onresult?.({ results: [[{ transcript: t, confidence: 0.9 }]] }); this.onend?.(); }, 50); }
                  abort() {} stop() {} }
                window.SpeechRecognition = Falso; window.webkitSpeechRecognition = Falso;
            })(%s)""" % json.dumps(voz))
        self.errores = []
        pagina.on("pageerror", lambda e: self.errores.append(str(e)))
        pagina.on("console", lambda m: self.errores.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
        pagina.goto(self.url)
        pagina.wait_for_selector("h1")
        pagina.get_by_role("button", name="Técnico" if modo == "tecnico" else "Agricultor", exact=True).click()
        self.addCleanup(pagina.close)
        return pagina

    def ir(self, pagina, seccion):
        pagina.get_by_role("navigation").get_by_role("button", name=seccion, exact=True).click()

    def empezar(self, pagina):
        pagina.get_by_role("button", name="Empezar consulta").click()
        pagina.wait_for_function("document.querySelector('main h1')?.innerText !== '¿Dónde ves el daño?'")

    def consultar(self, pagina, caso):
        """Responde como lo haría alguien que observa exactamente el caso."""
        verdad = caso["hechos"]
        partes = {p for h in verdad for p in BASE.hechos[h]["partes"] if p != "condiciones"}
        for parte in sorted(partes):
            pagina.get_by_role("button", name=BASE.partes[parte], exact=True).click()
        for medida in ("temperatura", "humedad_relativa"):
            if medida in verdad:
                pagina.locator(f"[data-medida={medida}]").fill(str(verdad[medida]))
        self.empezar(pagina)
        for _ in range(20):
            pagina.wait_for_selector("main h1")
            if pagina.get_by_role("button", name="Nueva consulta").count():
                return
            texto = pagina.locator("main h1").inner_text()
            hecho = self.pregunta_a_hecho[texto]
            pagina.get_by_role("button", name="Sí" if verdad.get(hecho, 0) > 0 else "No", exact=True).click()
            pagina.wait_for_function("t => document.querySelector('main h1')?.innerText !== t", arg=texto)
        self.fail("La consulta no terminó en 20 preguntas")

    def test_cada_caso_llega_a_su_diagnostico(self):
        for caso in CASOS:
            with self.subTest(caso["nombre"]):
                pagina = self.pagina()
                self.consultar(pagina, caso)
                esperado = BASE.plagas[caso["esperado"]]["nombre"]
                self.assertEqual(pagina.locator("main h1").inner_text(), esperado)
                texto = pagina.locator("main").inner_text()
                self.assertIn("de posibilidad", texto)
                self.assertIn("Manejo recomendado", texto)
                self.assertEqual(self.errores, [])
                pagina.close()

    def test_modo_tecnico_muestra_el_razonamiento(self):
        pagina = self.pagina(modo="tecnico")
        self.consultar(pagina, CASOS[0])
        esperado = BASE.plagas[CASOS[0]["esperado"]]["nombre"]
        grafo = pagina.locator("aside svg").first.text_content().replace(" ", "")
        self.assertIn(esperado.replace(" ", ""), grafo)
        self.assertIn("Fuzzificación de las mediciones", pagina.content())
        self.assertIn("centroide =", pagina.content())
        pagina.locator("aside svg [role=button]").first.click()
        detalle = pagina.locator("aside [aria-live=polite]").inner_text()
        self.assertRegex(detalle, r"Si .+ entonces .+")
        self.assertRegex(detalle, r"Aporte = peso \d\.\d\d × \d\.\d\d = \d\.\d\d")
        self.assertEqual(self.errores, [])

    def test_modo_agricultor_no_muestra_el_grafo(self):
        pagina = self.pagina()
        self.consultar(pagina, CASOS[0])
        self.assertEqual(pagina.locator("aside svg").count(), 0)
        self.assertIn("En la zona le dicen", pagina.locator("main").inner_text())

    def test_por_que_y_deshacer(self):
        pagina = self.pagina()
        pagina.get_by_role("button", name="Hojas", exact=True).click()
        self.empezar(pagina)
        primera = pagina.locator("main h1").inner_text()
        pagina.get_by_role("button", name="¿Por qué me preguntas esto?").click()
        self.assertIn("ayuda a confirmar o descartar", pagina.locator("main").inner_text())
        pagina.get_by_role("button", name="No", exact=True).click()
        pagina.wait_for_function("t => document.querySelector('main h1')?.innerText !== t", arg=primera)
        pagina.get_by_role("button", name="Cambiar la respuesta anterior").click()
        pagina.wait_for_function("t => document.querySelector('main h1')?.innerText === t", arg=primera)
        self.assertEqual(self.errores, [])
        # Responder con la voz: lo que entiende pasa como respuesta; si no entiende, lo dice y no avanza
        voz = self.pagina(voz=["mmm un poquito", "papa amarilla"])
        voz.get_by_role("button", name="Hojas", exact=True).click()
        self.empezar(voz)
        primera = voz.locator("main h1").inner_text()
        voz.get_by_role("button", name="Responder con la voz").click()
        voz.wait_for_function("t => document.querySelector('main h1')?.innerText !== t", arg=primera)
        self.assertIn("Entendí: «mmm un poquito» (un poco).", voz.locator("main").inner_text())
        self.assertEqual(voz.locator("ol[aria-label='Respuestas anteriores'] li").first.get_attribute("title"), "un poco")
        segunda = voz.locator("main h1").inner_text()
        voz.get_by_role("button", name="Responder con la voz").click()
        voz.get_by_text("No entendí «papa amarilla». Di sí, no, un poco o no sé.").wait_for()
        self.assertEqual(voz.locator("main h1").inner_text(), segunda)
        self.assertEqual(self.errores, [])

    def test_sin_sintomas_no_concluye(self):
        pagina = self.pagina()
        pagina.get_by_role("button", name="Hojas", exact=True).click()
        self.empezar(pagina)
        pagina.get_by_role("button", name="Ver el resultado ya").click()
        pagina.wait_for_selector("text=Nueva consulta")
        self.assertEqual(pagina.locator("main h1").inner_text(), "Con lo observado no se puede concluir")
        pagina.get_by_role("button", name="Nueva consulta").click()
        self.assertEqual(pagina.locator("main h1").inner_text(), "¿Dónde ves el daño?")
        self.assertEqual(self.errores, [])

    def test_descarte_del_experto(self):
        pagina = self.pagina()
        self.consultar(pagina, {"hechos": {"tu_exudado_ojos": 1, "p_marchitez": 1, "tu_exudado_anillo_vascular": -1}})
        texto = pagina.locator("main").inner_text()
        self.assertNotIn("Marchitez bacteriana\n", texto.split("También posibles")[0][:40])
        self.assertEqual(self.errores, [])



    @unittest.skipUnless(FOTO_RANCHA, "No hay fotos de prueba de PlantVillage")
    def test_camara(self):
        if not main.CAMARA_ERROR is None:
            self.skipTest(f"Cámara no disponible: {main.CAMARA_ERROR}")
        pagina = self.pagina()
        self.ir(pagina, "Cámara")
        pagina.locator("input[type=file]").set_input_files(FOTO_RANCHA[0])
        pagina.wait_for_selector("text=Usar en la consulta", timeout=20000)
        self.assertIn("Tizón tardío", pagina.locator("aside").inner_text())
        pagina.get_by_role("button", name="Usar en la consulta").click()
        pagina.wait_for_selector("text=¿Dónde ves el daño?")
        pagina.wait_for_selector("text=Foto: rancha", timeout=5000)   # la foto entra un instante después
        self.empezar(pagina)
        self.assertEqual(self.errores, [])


    def test_alerta_y_clima_en_la_consulta(self):
        """El clima del pronóstico entra a la consulta con su botón o desde la alerta, que muestra siete días."""
        pagina = self.pagina()
        pagina.get_by_role("button", name="Traer el clima de Open-Meteo").click()
        pagina.wait_for_selector("[role=status]:has-text('Open-Meteo')", timeout=20000)
        self.assertNotEqual(pagina.locator("[data-medida=temperatura]").input_value(), "")
        self.assertNotEqual(pagina.locator("[data-medida=humedad_relativa]").input_value(), "")
        self.assertIn("severidad de Wallin", pagina.locator("body").inner_text())
        self.ir(pagina, "Alerta de rancha")
        pagina.wait_for_selector("text=Severidad por día")
        self.assertEqual(pagina.locator("ol li").count(), 7)
        self.assertRegex(pagina.locator("body").inner_text(), r"Riesgo (bajo|medio|alto)")
        pagina.get_by_role("button", name="Usar este clima en una consulta").click()
        pagina.wait_for_selector("text=¿Dónde ves el daño?")
        pagina.wait_for_selector("text=severidad de Wallin", timeout=5000)   # entra un instante después
        self.assertNotEqual(pagina.locator("[data-medida=temperatura]").input_value(), "")
        pagina.locator("[data-medida=humedad_suelo]").select_option("85")
        pagina.get_by_role("button", name="Hojas", exact=True).click()
        self.empezar(pagina)
        self.assertEqual(self.errores, [])

    def test_conocimiento_y_evaluacion(self):
        pagina = self.pagina()
        self.ir(pagina, "Conocimiento")
        self.assertEqual(pagina.locator("tbody tr").count(), len(BASE.reglas))
        pagina.locator("select:visible").select_option("tizon_tardio")
        self.assertEqual(pagina.locator("tbody tr").count(), sum(r["entonces"] == "tizon_tardio" for r in BASE.reglas))
        pagina.get_by_role("tab", name="Lógica difusa").click()
        self.assertIn("Tabla de Wallin", pagina.content())
        pagina.get_by_role("tab", name="Calibración con el experto").click()
        self.assertIn("P(s|d)", pagina.content())
        pagina.get_by_role("tab", name="El experto", exact=True).click()
        self.assertIn("platanero", pagina.content())
        pagina.get_by_role("tab", name="Síntomas dibujados").click()
        self.assertEqual(pagina.locator("section li svg").count(), 60)
        self.ir(pagina, "Evaluación")
        pagina.wait_for_selector("text=Casos de la guía del CIP")
        self.assertIn("17/17", pagina.locator("body").inner_text())
        self.assertEqual(self.errores, [])

    def test_codigo_qr(self):
        pagina = self.pagina()
        pagina.get_by_role("button", name="Abrir en el celular").click()
        pagina.wait_for_selector("dialog img")
        self.assertRegex(pagina.locator("dialog").inner_text(), r"https?://")
        pagina.get_by_role("button", name="Cerrar").click()
        self.assertEqual(self.errores, [])

    def test_no_hay_desborde_horizontal(self):
        for ancho in (1280, 1024, 768, 390):
            for modo in ("agricultor", "tecnico"):
                with self.subTest(ancho=ancho, modo=modo):
                    pagina = self.pagina(ancho, 800, modo)
                    self.consultar(pagina, CASOS[0])
                    desborde = pagina.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                    self.assertLessEqual(desborde, 0)
                    pagina.close()


if __name__ == "__main__":
    unittest.main()
