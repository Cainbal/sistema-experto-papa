import { useEffect, useRef, useState } from "react";
import { consultar, leerClima } from "./api.js";
import Planta from "./Planta.jsx";
import Grafo from "./Grafo.jsx";
import { BarraEvidencia, GraficoPertenencia, GraficoSalida } from "./Difuso.jsx";

const RESPUESTAS = [
  { texto: "Sí", valor: 1, clase: "bg-pulpa text-tinta hover:brightness-110" },
  { texto: "Un poco", valor: 0.5, clase: "border-2 border-pulpa text-pulpa hover:bg-pulpa hover:text-tinta" },
  { texto: "No", valor: -1, clase: "bg-white/15 text-white hover:bg-white/30" },
  { texto: "No sé", valor: 0, clase: "border-2 border-white/40 text-white hover:bg-white/15" },
];
const COLOR_URGENCIA = { vigilar: "bg-brote text-tinta", esta_semana: "bg-pulpa text-tinta", actuar_ya: "bg-[#f08a6c] text-tinta" };
const VACIA = { diagnosticos: [], riesgos: [], descartadas: [], traza: [], derivados: {}, empate: [], distingue: [],
  siguiente: null, fuzzificacion: {}, urgencia: null, grupo_manejo: null };
const MEDIDAS = [["temperatura", "Temperatura", "°C"], ["humedad_relativa", "Humedad del aire", "%"]];
// La humedad del suelo se elige a ojo; cada opción cae de lleno en un conjunto difuso.
const SUELO = [["", "Sin dato"], ["15", "Seco"], ["45", "Húmedo"], ["85", "Encharcado"]];
const ETIQUETA_FOTO = { foto_rancha: "rancha", foto_alternaria: "alternariosis", foto_sana: "sana" };
const pct = (x) => `${Math.round(x)} %`;
const HAY_VOZ = typeof window !== "undefined" && "speechSynthesis" in window;

// Lectura en voz alta con la voz en español del navegador (no necesita internet en la mayoría de equipos).
function hablar(texto) {
  if (!HAY_VOZ) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto.replace(/[¿?]/g, ""));
  const voces = window.speechSynthesis.getVoices();
  u.voice = voces.find((v) => v.lang === "es-PE") ?? voces.find((v) => v.lang?.startsWith("es")) ?? null;
  u.lang = u.voice?.lang ?? "es-ES";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function BotonVoz({ texto, etiqueta }) {
  if (!HAY_VOZ) return null;
  return (
    <button type="button" onClick={() => hablar(texto)} className="font-bold text-pulpa underline">
      {etiqueta}
    </button>
  );
}
const textoRespuesta = (v) => (v >= 1 ? "sí" : v > 0 ? "un poco" : v === 0 ? "no sé" : "no");

// Responder con la voz: reconocimiento del navegador (Chrome y Edge). Necesita internet y una página
// segura (localhost en la laptop o HTTPS); en otros casos el botón no aparece.
const Reconocedor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const HAY_DICTADO = Boolean(Reconocedor) && window.isSecureContext;
const ESCUCHANDO = "Escuchando…";
const normalizar = (t) => ` ${t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()} `;
const DICHOS = [   // el orden importa: «no sé» antes que «no», «un poco» antes que «sí»
  [0, ["no se", "no lo se", "ni idea", "no estoy seguro", "no sabria", "quien sabe"]],
  [0.5, ["un poco", "un poquito", "poquito", "poco", "algo", "mas o menos", "regular", "a veces", "algunas", "algunos", "no mucho", "casi nada"]],
  [-1, ["no", "nada", "ninguna", "ninguno", "nunca"]],
  [1, ["si", "claro", "bastante", "harto", "mucho", "muchas", "muchos", "todas", "todos", "hay", "asi es", "correcto", "por supuesto"]],
];
export function interpretarVoz(dicho) {
  const t = normalizar(dicho);
  for (const [valor, frases] of DICHOS) if (frases.some((f) => t.includes(` ${f} `))) return valor;
  return null;
}
const ERRORES_VOZ = {
  "not-allowed": "El navegador no dejó usar el micrófono. Revisa el permiso.",
  "service-not-allowed": "El navegador no dejó usar el micrófono. Revisa el permiso.",
  network: "Para entender la voz se necesita internet.",
  "no-speech": "No escuché nada. Prueba otra vez.",
  "audio-capture": "No se encontró un micrófono.",
};

function BotonDictado({ alEntender, deshabilitado }) {
  const [estado, setEstado] = useState("");
  const reconocedor = useRef(null);
  useEffect(() => () => reconocedor.current?.abort?.(), []);
  if (!HAY_DICTADO) return null;

  function escuchar() {
    reconocedor.current?.abort?.();
    const r = new Reconocedor();
    r.lang = "es-PE";
    r.interimResults = false;
    r.maxAlternatives = 4;
    r.onresult = (e) => {
      const res = e.results[0];
      const dichos = Array.from({ length: res.length }, (_, i) => res[i].transcript.trim());
      for (const dicho of dichos) {
        const valor = interpretarVoz(dicho);
        if (valor !== null) { setEstado(""); alEntender(valor, dicho); return; }
      }
      setEstado(`No entendí «${dichos[0] ?? ""}». Di sí, no, un poco o no sé.`);
    };
    r.onerror = (e) => setEstado(ERRORES_VOZ[e.error] ?? "No se pudo usar la voz. Responde con los botones.");
    r.onend = () => setEstado((s) => (s === ESCUCHANDO ? "" : s));
    reconocedor.current = r;
    setEstado(ESCUCHANDO);
    try { r.start(); } catch { setEstado("No se pudo usar la voz. Responde con los botones."); }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={escuchar} disabled={deshabilitado || estado === ESCUCHANDO}
        className="font-bold text-pulpa underline disabled:opacity-60">
        {estado === ESCUCHANDO ? ESCUCHANDO : "Responder con la voz"}
      </button>
      {estado && estado !== ESCUCHANDO && <span role="status" className="text-white/80">{estado}</span>}
    </span>
  );
}

export default function Consulta({ base, modo, semilla, alConsumirSemilla, alError }) {
  const [etapa, setEtapa] = useState("inicio"); // inicio | preguntas | resultado
  const [partes, setPartes] = useState([]);
  const [medidas, setMedidas] = useState({ temperatura: "", humedad_relativa: "", humedad_suelo: "", plantas_afectadas: "" });
  const [extra, setExtra] = useState({}); // hechos que vienen del clima o de la cámara
  const [fuenteDsv, setFuenteDsv] = useState(null);
  const [origenExtra, setOrigenExtra] = useState([]);
  const [hechos, setHechos] = useState({});
  const [orden, setOrden] = useState([]);
  const [respuesta, setRespuesta] = useState(VACIA);
  const [verMotivo, setVerMotivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [dictado, setDictado] = useState(null); // lo último que se respondió con la voz
  const [leerSiguiente, setLeerSiguiente] = useState(false);
  const [trayendoClima, setTrayendoClima] = useState(false);
  const [avisoClima, setAvisoClima] = useState(null);
  const tecnico = modo === "tecnico";

  useEffect(() => {
    if (!semilla) return;
    setExtra((e) => ({ ...e, ...semilla.hechos }));
    setOrigenExtra((o) => [...new Set([...o, semilla.origen])]);
    if (semilla.hechos && "dsv_rancha" in semilla.hechos) {
      setFuenteDsv(semilla.origen === "clima" ? "Clima de las últimas 24 h" : "Clima de ejemplo");
    }
    if (semilla.partes) setPartes((p) => [...new Set([...p, ...semilla.partes])]);
    if (semilla.medidas) setMedidas((m) => ({ ...m, ...semilla.medidas }));
    setEtapa("inicio");
    alConsumirSemilla();
  }, [semilla]); // eslint-disable-line react-hooks/exhaustive-deps

  async function razonar(nuevosHechos, pasarAResultado = false) {
    setCargando(true);
    try {
      const r = await consultar(nuevosHechos, partes);
      setHechos(nuevosHechos);
      setRespuesta(r);
      setVerMotivo(false);
      setEtapa(pasarAResultado || !r.siguiente ? "resultado" : "preguntas");
      alError(null);
    } catch (e) {
      alError(e.message);
    } finally {
      setCargando(false);
    }
  }


  // El clima de ahora sale del pronóstico (Huánuco por defecto), sin pasar por la página de la alerta.
  async function traerClima() {
    setTrayendoClima(true);
    try {
      const c = await leerClima();
      const a = c.actual;
      if (!a || !("temperatura" in a.hechos)) throw new Error("El pronóstico no trajo el clima de esta hora. Escríbelo a mano o inténtalo otra vez.");
      const real = c.fuente === "open-meteo";
      setMedidas((m) => ({ ...m, temperatura: a.hechos.temperatura, humedad_relativa: a.hechos.humedad_relativa }));
      if (a.dsv_24h != null) {
        setExtra((e) => ({ ...e, dsv_rancha: a.dsv_24h }));
        setFuenteDsv(real ? "Clima de las últimas 24 h" : "Clima de ejemplo");
      }
      setOrigenExtra((o) => [...new Set([...o, real ? "clima" : "clima de ejemplo"])]);
      setAvisoClima(real ? `Clima de ahora en ${c.ubicacion?.nombre ?? "tu zona"}, según Open-Meteo.`
        : "No se pudo conectar con Open-Meteo: son datos de ejemplo, no reales.");
      alError(null);
    } catch (e) {
      alError(e.message);
    } finally {
      setTrayendoClima(false);
    }
  }

  function empezar() {
    const iniciales = { ...extra };
    for (const [id, texto] of Object.entries(medidas)) {
      const valor = parseFloat(String(texto).replace(",", "."));
      if (!Number.isNaN(valor)) iniciales[id] = valor;
    }
    setOrden([]);
    setDictado(null);
    setLeerSiguiente(false);
    razonar(iniciales);
  }

  function responder(valor) {
    const id = respuesta.siguiente.hecho;
    setOrden([...orden, id]);
    razonar({ ...hechos, [id]: valor });
  }

  function responderConBoton(valor) {
    setDictado(null);
    setLeerSiguiente(false);
    responder(valor);
  }

  // Si respondió con la voz, la siguiente pregunta se lee en voz alta: así puede seguir sin mirar la pantalla.
  function responderConVoz(valor, dicho) {
    setDictado(`Entendí: «${dicho}» (${textoRespuesta(valor)}).`);
    setLeerSiguiente(true);
    responder(valor);
  }

  function deshacer() {
    setDictado(null);
    setLeerSiguiente(false);
    const ultimo = orden[orden.length - 1];
    const resto = { ...hechos };
    delete resto[ultimo];
    setOrden(orden.slice(0, -1));
    razonar(resto);
  }

  function reiniciar() {
    setDictado(null);
    setLeerSiguiente(false);
    setEtapa("inicio");
    setPartes([]);
    setHechos({});
    setExtra({});
    setOrigenExtra([]);
    setFuenteDsv(null);
    setOrden([]);
    setRespuesta(VACIA);
  }

  const observados = Object.entries(hechos)
    .filter(([id, v]) => v > 0 && ["sintoma", "signo", "dano", "condicion"].includes(base.hechos[id].tipo))
    .map(([id]) => base.hechos[id].corto);

  if (etapa === "inicio") {
    const fotos = Object.entries(extra).filter(([id]) => id.startsWith("foto_"));
    return (
      <main className="panel-flor grid gap-8 rounded-3xl p-5 sm:p-10 md:grid-cols-2 md:items-center md:gap-x-10 md:gap-y-6">
        <div className="min-w-0 md:col-start-1 md:row-start-1 md:self-end">
          <h1 className="text-5xl font-bold sm:text-7xl">¿Dónde ves el daño?</h1>
          <p className="mt-5 max-w-[46ch] text-xl text-white/90">
            Marca en la planta las partes afectadas. Después responde unas preguntas sobre lo que observas
            y sabrás qué plaga o enfermedad es más probable, por qué, qué tan urgente es y cómo manejarla.
          </p>
        </div>
        <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1">
          <Planta modo="seleccion" partes={partes} nombres={base.partes} alCambiar={setPartes} />
        </div>
        <div className="min-w-0 md:col-start-1 md:row-start-2 md:self-start">
          <fieldset className="rounded-xl border-2 border-white/30 p-4">
            <legend className="px-2 font-bold">Datos del campo, si los tienes</legend>
            <div className="flex flex-wrap gap-4">
              {MEDIDAS.map(([id, texto, unidad]) => (
                <label key={id} className="block">
                  <span className="block text-base text-white/85">{texto} ({unidad})</span>
                  <input type="number" inputMode="decimal" value={medidas[id]} data-medida={id}
                    onChange={(e) => setMedidas({ ...medidas, [id]: e.target.value })}
                    className="mt-1 w-36 rounded-lg border-2 border-white/40 bg-noche/40 px-3 py-2 text-lg text-white" />
                </label>
              ))}
              <label className="block">
                <span className="block text-base text-white/85">Suelo</span>
                <select value={medidas.humedad_suelo} data-medida="humedad_suelo"
                  onChange={(e) => setMedidas({ ...medidas, humedad_suelo: e.target.value })}
                  className="mt-1 w-40 rounded-lg border-2 border-white/40 bg-noche/40 px-3 py-2 text-lg text-white">
                  {SUELO.map(([valor, texto]) => <option key={texto} value={valor} className="bg-noche">{texto}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <button type="button" onClick={traerClima} disabled={trayendoClima}
                className="font-bold text-pulpa underline disabled:no-underline disabled:opacity-60">
                {trayendoClima ? "Trayendo el clima…" : "Traer el clima de Open-Meteo"}
              </button>
              {avisoClima && <span role="status" className="text-base text-white/85">{avisoClima}</span>}
            </div>
            <label className="mt-4 block">
              <span className="block text-base text-white/85">
                Plantas afectadas en el campo: <b className="tabular-nums text-pulpa">{medidas.plantas_afectadas === "" ? "sin dato" : `${medidas.plantas_afectadas} %`}</b>
              </span>
              <input type="range" min="0" max="100" step="5" value={medidas.plantas_afectadas === "" ? 0 : medidas.plantas_afectadas}
                onChange={(e) => setMedidas({ ...medidas, plantas_afectadas: e.target.value })}
                className="mt-2 w-full max-w-sm accent-[var(--color-pulpa)]" aria-label="Porcentaje de plantas afectadas" />
            </label>
            {(origenExtra.length > 0) && (
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {"dsv_rancha" in extra && <li className="rounded-full bg-noche/50 px-3 py-1">{fuenteDsv ?? "Clima"}: severidad de Wallin {extra.dsv_rancha}</li>}
                {"humedad_suelo" in extra && <li className="rounded-full bg-noche/50 px-3 py-1">Suelo: {extra.humedad_suelo} %</li>}
                {fotos.length > 0 && (
                  <li className="rounded-full bg-noche/50 px-3 py-1">
                    Foto: {fotos.map(([id, v]) => `${ETIQUETA_FOTO[id]} ${Math.round(v * 100)} %`).join(", ")}
                  </li>
                )}
              </ul>
            )}
          </fieldset>

          <button type="button" disabled={partes.length === 0 || cargando} onClick={empezar}
            className="mt-8 rounded-full bg-pulpa px-8 py-4 text-xl font-bold text-tinta transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
            Empezar consulta
          </button>
          {partes.length === 0 && <p className="mt-2 text-base text-white/80">Marca al menos una parte de la planta.</p>}
        </div>
      </main>
    );
  }

  const principal = respuesta.diagnosticos[0];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 space-y-6">
        <main className="panel-flor overflow-hidden rounded-3xl p-5 sm:p-7" aria-busy={cargando}>
          {etapa === "preguntas" && (
            <Pregunta key={respuesta.siguiente.hecho} respuesta={respuesta} orden={orden} hechos={hechos}
              verMotivo={verMotivo} alVerMotivo={() => setVerMotivo(!verMotivo)} alResponder={responderConBoton} cargando={cargando}
              alResponderVoz={responderConVoz} dictado={dictado} leerAlEntrar={leerSiguiente}
              alDeshacer={orden.length > 0 ? deshacer : null} alTerminar={() => razonar(hechos, true)} />
          )}
          {etapa === "resultado" && (
            <Resultado base={base} respuesta={respuesta} tecnico={tecnico} alReiniciar={reiniciar}
              alDeshacer={orden.length > 0 ? deshacer : null} />
          )}
        </main>
        {tecnico && principal && etapa === "resultado" && (
          <section className="panel-noche space-y-5 rounded-2xl p-5">
            <h2 className="text-2xl font-bold">Defuzzificación de {principal.nombre.toLowerCase()}</h2>
            <BarraEvidencia favor={principal.evidencia_favor} contra={principal.evidencia_contra} />
            <GraficoSalida variable={base.variables.posibilidad} fuerzas={principal.fuerzas} valor={principal.posibilidad} />
            {respuesta.urgencia && (
              <>
                <GraficoSalida variable={base.variables.urgencia} fuerzas={respuesta.urgencia.fuerzas} valor={respuesta.urgencia.valor}
                  titulo="Segunda salida: urgencia de actuar" />
                <ul className="space-y-1 text-sm">
                  {respuesta.urgencia.reglas.map((r) => (
                    <li key={r.regla} className="flex justify-between gap-3 border-b border-white/15 py-1">
                      <span><b className="text-pulpa">{r.regla}</b> SI {r.texto} → {base.variables.urgencia.etiquetas[r.salida]}</span>
                      <b className="tabular-nums">{r.fuerza.toFixed(2)}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
      <div className="min-w-0 space-y-6">
        {tecnico && <Grafo respuesta={respuesta} hechos={hechos} base={base} />}
        {tecnico && Object.keys(respuesta.fuzzificacion).length > 0 && (
          <section className="panel-noche rounded-2xl p-5">
            <h2 className="text-2xl font-bold">Fuzzificación de las mediciones</h2>
            <p className="mt-1 max-w-[70ch] text-white/80">
              Cada número se convierte en grados de pertenencia. Las reglas usan esos grados, no cortes
              bruscos: 89 % de humedad no es "cero humedad alta".
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {Object.entries(respuesta.fuzzificacion).map(([id, f]) => (
                <GraficoPertenencia key={id} variable={base.variables[id]} valor={f.valor} />
              ))}
            </div>
          </section>
        )}
        <section className="panel-hoja grid items-center gap-5 rounded-3xl p-5 sm:grid-cols-[17rem_minmax(0,1fr)]">
          <Planta hechos={hechos} derivados={respuesta.derivados}
            zonaActiva={etapa === "preguntas" ? base.hechos[respuesta.siguiente.hecho].partes : []} />
          <div className="min-w-0">
            <h2 className="text-2xl font-bold">Lo que has observado</h2>
            {observados.length === 0 ? (
              <p className="mt-2 text-white/85">Los síntomas que confirmes se dibujan en la planta.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {observados.map((o) => <li key={o} className="marca rounded-full bg-pulpa px-3 py-1 text-base font-bold text-tinta">{o}</li>)}
              </ul>
            )}
            {etapa === "preguntas" && <p className="mt-3 text-base text-white/85">La parte que brilla es la que se está preguntando ahora.</p>}
            {!tecnico && (
              <p className="mt-3 text-sm text-white/75">¿Quieres ver cómo razona el sistema? Cambia a modo técnico arriba.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function useConteo(objetivo) {
  const [valor, setValor] = useState(objetivo);
  const desde = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValor(objetivo); return; }
    const inicio = performance.now(), a = desde.current;
    let cuadro;
    const paso = (t) => {
      const k = Math.min(1, Math.max(0, (t - inicio) / 700));
      setValor(a + (objetivo - a) * (1 - (1 - k) ** 3));
      if (k < 1) cuadro = requestAnimationFrame(paso); else desde.current = objetivo;
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [objetivo]);
  return valor;
}

function Pregunta({ respuesta, orden, hechos, verMotivo, alVerMotivo, alResponder, alResponderVoz, dictado, leerAlEntrar,
  alDeshacer, alTerminar, cargando }) {
  const { siguiente } = respuesta;
  const lider = respuesta.diagnosticos[0];
  useEffect(() => { if (leerAlEntrar) hablar(siguiente.pregunta); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="entra-pregunta">
      <div className="flex items-center gap-3">
        <p className="text-base text-white/80">Pregunta {orden.length + 1}</p>
        <ol className="flex flex-wrap gap-1.5" aria-label="Respuestas anteriores">
          {orden.map((id) => (
            <li key={id} title={textoRespuesta(hechos[id])}
              className={`h-2.5 w-2.5 rounded-full ${hechos[id] >= 1 ? "bg-pulpa" : hechos[id] > 0 ? "bg-pulpa/55" : hechos[id] < 0 ? "bg-white/30" : "border border-white/50"}`} />
          ))}
        </ol>
      </div>
      {dictado && <p role="status" className="mt-2 text-white/80">{dictado}</p>}
      <h1 className="mt-3 text-3xl font-bold">{siguiente.pregunta}</h1>

      <div className="mt-7 grid grid-cols-2 gap-3">
        {RESPUESTAS.map((r) => (
          <button key={r.texto} type="button" onClick={() => alResponder(r.valor)} disabled={cargando}
            className={`rounded-xl px-4 py-4 text-xl font-bold transition active:scale-95 disabled:opacity-60 ${r.clase}`}>
            {r.texto}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        <button type="button" onClick={alVerMotivo} aria-expanded={verMotivo} className="font-bold text-pulpa underline">
          ¿Por qué me preguntas esto?
        </button>
        <BotonVoz texto={siguiente.pregunta} etiqueta="Escuchar la pregunta" />
        <BotonDictado alEntender={alResponderVoz} deshabilitado={cargando} />
      </div>
      {verMotivo && (
        <p className="mt-2 max-w-[60ch] rounded-lg bg-noche/45 p-4">
          Porque la respuesta ayuda a confirmar o descartar: {siguiente.motivo.join(", ")}.
          {lider && ` Por ahora, lo más posible es ${lider.nombre.toLowerCase()} (${pct(lider.posibilidad)}).`}
        </p>
      )}

      <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/25 pt-5">
        {alDeshacer && <button type="button" onClick={alDeshacer} className="font-bold underline">Cambiar la respuesta anterior</button>}
        <button type="button" onClick={alTerminar} className="font-bold underline">Ver el resultado ya</button>
      </div>
    </div>
  );
}

function Resultado({ base, respuesta, tecnico, alReiniciar, alDeshacer }) {
  const { diagnosticos, riesgos, descartadas, empate, distingue, urgencia, grupo_manejo: grupo } = respuesta;
  const [principal, ...otros] = diagnosticos.filter((h) => h.posibilidad >= 30);
  const conteo = useConteo(principal ? principal.posibilidad : 0);
  const acciones = (
    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/25 pt-5">
      <button type="button" onClick={alReiniciar} className="rounded-full bg-pulpa px-6 py-3 font-bold text-tinta transition hover:brightness-110">Nueva consulta</button>
      {alDeshacer && <button type="button" onClick={alDeshacer} className="font-bold underline">Cambiar la respuesta anterior</button>}
    </div>
  );

  if (!principal) {
    return (
      <>
        <h1 className="text-3xl font-bold sm:text-4xl">Con lo observado no se puede concluir</h1>
        <p className="mt-4 max-w-[60ch] text-lg text-white/90">
          Lo marcado no alcanza para señalar ninguna de las 16 plagas y enfermedades de la guía. Revisa
          otra parte de la planta, toma una foto de la hoja o consulta a un técnico agrario.
        </p>
        {riesgos.length > 0 && (
          <p className="mt-4 max-w-[60ch] rounded-lg bg-noche/45 p-4">
            El clima sí favorece a: {riesgos.map((h) => `${h.nombre.toLowerCase()} (${pct(h.posibilidad)})`).join(", ")}. Conviene vigilar el cultivo.
          </p>
        )}
        <Descartadas descartadas={descartadas} />
        {acciones}
      </>
    );
  }

  const hayEmpate = empate.length > 1;
  const empatadas = hayEmpate ? diagnosticos.filter((h) => empate.includes(h.id)) : [principal];
  const resto = otros.filter((h) => !empate.includes(h.id));
  const locales = principal.nombres_locales ?? [];
  return (
    <>
      <p className="text-base text-white/80">{hayEmpate ? "Empate: los síntomas no alcanzan para decidir" : `Diagnóstico: ${principal.nivel}`}</p>
      <h1 className="mt-1 text-4xl font-bold">{empatadas.map((h) => h.nombre).join(" o ")}</h1>
      {!hayEmpate && locales.length > 0 && (
        <p className="mt-1 text-lg text-white/90">En la zona le dicen: <b>{locales.join(", ")}</b></p>
      )}

      {!hayEmpate && (
        <p className="mt-2">
          <BotonVoz etiqueta="Escuchar el resultado" texto={`Lo más posible es ${principal.nombre}${locales.length ? `, que en la zona llaman ${locales.join(" o ")}` : ""}, con ${Math.round(principal.posibilidad)} por ciento de posibilidad. ${urgencia ? `Urgencia: ${urgencia.etiqueta}.` : ""} Manejo recomendado: ${principal.ficha.manejo.slice(0, 4).join(". ")}.`} />
        </p>
      )}
      <p className="mt-5 flex items-baseline gap-3">
        <span className="font-titulo text-7xl font-bold text-pulpa tabular-nums">{Math.round(conteo)}%</span>
        <span className="text-lg">de posibilidad{hayEmpate ? " cada una" : ""}</span>
      </p>
      {urgencia && !hayEmpate && (
        <p className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-4 py-1.5 font-bold ${COLOR_URGENCIA[urgencia.termino]}`}>{urgencia.etiqueta[0].toUpperCase() + urgencia.etiqueta.slice(1)}</span>
          <span className="text-white/85">Urgencia {Math.round(urgencia.valor)}/100, según qué tan posible es y cuántas plantas tiene afectadas.</span>
        </p>
      )}
      {tecnico && (
        <p className="mt-3 text-sm text-white/75">
          {principal.disparos.filter((d) => d.sentido === "+").length} reglas a favor y {principal.disparos.filter((d) => d.sentido === "-").length} en contra.
          El porcentaje es el centroide de la salida difusa (gráfico de abajo).
        </p>
      )}

      {grupo && (
        <p className="mt-5 rounded-lg bg-noche/45 p-4"><b className="text-pulpa">Nota del experto.</b> {grupo.plagas.join(" y ")}: {grupo.nota}</p>
      )}

      {hayEmpate && distingue.length > 0 && (
        <div className="mt-5 rounded-lg bg-noche/45 p-4">
          <p className="font-bold text-pulpa">Para salir de la duda, revisa:</p>
          <ul className="mt-1 list-disc pl-6">
            {distingue.map((d) => <li key={d.hecho}>{d.pregunta} Si es así, apunta a {d.apoya.toLowerCase()}.</li>)}
          </ul>
        </div>
      )}

      {empatadas.map((h) => <Ficha key={h.id} hipotesis={h} conTitulo={hayEmpate} />)}

      {resto.length > 0 && (
        <>
          <h2 className="mt-8 text-2xl font-bold">También posibles</h2>
          <ul className="mt-2">
            {resto.map((h) => (
              <li key={h.id} className="flex justify-between border-b border-white/25 py-2">
                <span>{h.nombre}</span><b className="tabular-nums">{pct(h.posibilidad)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <Descartadas descartadas={descartadas} />
      {acciones}
    </>
  );
}

function Descartadas({ descartadas }) {
  if (!descartadas?.length) return null;
  return (
    <>
      <h2 className="mt-8 text-2xl font-bold">Descartadas</h2>
      <ul className="mt-2 space-y-2">
        {descartadas.map((d) => (
          <li key={d.id} className="border-b border-white/25 pb-2">
            <b>{d.nombre}</b>: {d.disparos.map((x) => x.premisas.map((p) => p.texto.replace(/^NO: ¿|\?$/g, "").replace(/^¿/, "")).join(" y ")).join("; ")}
            <span className="text-white/75"> — respondiste que no.</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Ficha({ hipotesis, conTitulo }) {
  const f = hipotesis.ficha;
  return (
    <section className="mt-6">
      {conTitulo && <h2 className="mb-3 border-t border-white/25 pt-6 text-2xl font-bold">Si es {hipotesis.nombre.toLowerCase()}</h2>}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
        <dt className="font-bold text-pulpa">Agente causal</dt><dd><i>{f.agente}</i> ({f.tipo.toLowerCase()})</dd>
        <dt className="font-bold text-pulpa">Fase que afecta</dt><dd>{f.fase}</dd>
        <dt className="font-bold text-pulpa">Cómo llega</dt><dd>{f.transmision}</dd>
        {f.nota_experto && (<><dt className="font-bold text-pulpa">El experto</dt><dd>{f.nota_experto}</dd></>)}
      </dl>
      <h3 className="mt-6 text-xl font-bold">Manejo recomendado</h3>
      <ul className="mt-3 list-disc space-y-1 pl-6 marker:text-pulpa">
        {f.manejo.map((m) => <li key={m}>{m}</li>)}
      </ul>
      <p className="mt-3 text-base text-white/75">Según la ficha {String(f.ficha).padStart(2, "0")} de la guía del CIP (Pérez y Forbes, 2011).</p>
    </section>
  );
}
