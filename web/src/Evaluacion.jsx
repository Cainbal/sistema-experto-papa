import { useEffect, useState } from "react";
import { leerEvaluacion } from "./api.js";

const p = (x, d = 0) => `${(x * 100).toLocaleString("es-PE", { maximumFractionDigits: d })} %`;
const n = (x, d = 1) => Number(x).toLocaleString("es-PE", { maximumFractionDigits: d });

function Cifra({ valor, texto, detalle, color = "text-pulpa" }) {
  return (
    <div className="rounded-2xl bg-noche/50 p-5">
      <p className={`font-titulo text-5xl font-bold tabular-nums ${color}`}>{valor}</p>
      <p className="mt-1 text-lg font-bold">{texto}</p>
      {detalle && <p className="mt-1 text-sm text-white/75">{detalle}</p>}
    </div>
  );
}

function Matriz({ m, titulo }) {
  const filas = m.valores.map((f, i) => [m.filas_reales[i], f]).filter(([, f]) => f.some((v) => v > 0));
  return (
    <figure>
      <figcaption className="mb-2 font-bold">{titulo}</figcaption>
      <table className="border-collapse text-sm tabular-nums">
        <thead>
          <tr><th className="p-1.5 text-left text-white/70">real \ predicha</th>{m.columnas_predichas.map((c) => <th key={c} className="p-1.5">{c}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map(([real, f]) => {
            const total = f.reduce((a, b) => a + b, 0);
            return (
              <tr key={real}>
                <th className="p-1.5 text-left">{real}</th>
                {f.map((v, j) => (
                  <td key={j} className="p-1.5 text-center" style={{ background: `rgba(${m.columnas_predichas[j] === real ? "134,214,166" : "240,138,108"}, ${total ? (v / total) * 0.8 : 0})` }}>{v}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}

export default function Evaluacion() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { leerEvaluacion().then(setD).catch((e) => setError(e.message)); }, []);

  if (error) return <p className="panel-tabla rounded-2xl p-6">No se encontró la evaluación ({error}). Genérala con <code>python pruebas/evaluar.py</code>.</p>;
  if (!d) return <p className="p-6">Cargando la evaluación…</p>;
  const cam = d.camara;
  const guia = d.calibracion.pesos_de_la_guia;
  return (
    <div className="space-y-6">
      <section className="panel-flor rounded-3xl p-5 sm:p-8">
        <h1 className="text-4xl font-bold sm:text-5xl">¿Qué tan bien funciona?</h1>
        <p className="mt-3 max-w-[70ch] text-lg text-white/90">
          Todo lo de esta página se calcula con un programa (<code>pruebas/evaluar.py</code>) sobre el mismo motor que usa
          la consulta. Última evaluación: {d.fecha}.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra valor={`${d.casos_guia.resumen.aciertos}/${d.casos_guia.resumen.total}`} texto="Casos de la guía del CIP"
            detalle={`Con todos los síntomas del caso. Margen mínimo sobre la segunda opción: ${n(d.casos_guia.resumen.margen_minimo)} puntos.`} />
          <Cifra valor={`${d.consulta_guiada.resumen.aciertos}/${d.consulta_guiada.resumen.total}`} texto="Consulta guiada"
            detalle={`El sistema elige qué preguntar: ${n(d.consulta_guiada.resumen.preguntas_promedio)} preguntas en promedio, ${d.consulta_guiada.resumen.preguntas_maximo} como máximo.`} />
          <Cifra valor={p(d.robustez.acierto_primero)} texto="Con usuarios que dudan"
            detalle={`${d.robustez.simulaciones} consultas simuladas con respuestas "un poco", "no sé" y errores. Entre los 3 primeros: ${p(d.robustez.acierto_entre_3)}.`} />
          <Cifra valor={`${d.pruebas.ejecutadas - d.pruebas.fallidas}/${d.pruebas.ejecutadas}`} texto="Pruebas automáticas"
            detalle="Del motor, la calibración, Wallin y la API; pasan todas. Las de la interfaz abren un navegador y se corren aparte." color="text-brote" />
        </div>
      </section>

      <section className="panel-noche rounded-2xl p-5 sm:p-6">
        <h2 className="text-2xl font-bold">Casos de la guía y consulta guiada</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-base">
            <thead>
              <tr className="border-b-2 border-pulpa text-pulpa">
                <th className="py-2 pr-3">Caso</th><th className="py-2 pr-3">Esperado</th><th className="py-2 pr-3 text-right">Posibilidad</th>
                <th className="py-2 pr-3 text-right">Margen</th><th className="py-2 pr-3 text-right">Preguntas (guiada)</th><th className="py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {d.casos_guia.filas.map((f, i) => {
                const g = d.consulta_guiada.filas[i];
                return (
                  <tr key={f.caso} className="border-b border-white/15">
                    <td className="py-2 pr-3">{f.caso}</td><td className="py-2 pr-3">{f.esperado}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{n(f.posibilidad, 0)} %</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{n(f.margen)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{g.preguntas}</td>
                    <td className={`py-2 font-bold ${f.ok && g.ok ? "text-brote" : "text-[#f08a6c]"}`}>{f.ok && g.ok ? "correcto" : "falla"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[80ch] text-sm text-white/75">
          Límite honesto: estos casos salen de la misma guía con la que se construyeron las reglas, así que prueban que
          las reglas son coherentes, no que el sistema acierte en el campo. Para eso hace falta validar con casos reales
          revisados por un agrónomo.
        </p>
      </section>

      <section className="panel-hoja rounded-3xl p-5 sm:p-8">
        <h2 className="text-2xl font-bold">¿Sirvió calibrar con el experto?</h2>
        <p className="mt-2 max-w-[75ch] text-white/90">
          Comparación entre usar solo los pesos basados en la guía y mezclarlos con los datos del experto (alfa = cuánto se
          confía en el experto). {d.robustez.modelo_de_usuario}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-base">
            <thead>
              <tr className="border-b-2 border-pulpa text-pulpa">
                <th className="py-2 pr-3">Confianza en el experto (alfa)</th><th className="py-2 pr-3 text-right">Margen mínimo</th>
                <th className="py-2 pr-3 text-right">Guiada</th><th className="py-2 pr-3 text-right">Preguntas</th>
                <th className="py-2 pr-3 text-right">Acierto con dudas</th><th className="py-2 text-right">Ponderado por la zona</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/15 text-white/80">
                <td className="py-2 pr-3">Pesos originales sin calibrar</td><td className="py-2 pr-3 text-right tabular-nums">{n(guia.margen_minimo)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{guia.guiada.aciertos}/{guia.guiada.total}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{n(guia.guiada.preguntas_promedio)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{p(d.calibracion.robustez_pesos_de_la_guia.acierto_primero, 1)}</td>
                <td className="py-2 text-right tabular-nums">{p(d.calibracion.robustez_pesos_de_la_guia.acierto_ponderado_por_frecuencia_en_la_zona, 1)}</td>
              </tr>
              {d.sensibilidad_alfa.map((s) => (
                <tr key={s.alfa} className={`border-b border-white/15 ${s.alfa === 0.5 ? "bg-white/10 font-bold" : ""}`}>
                  <td className="py-2 pr-3">{n(s.alfa, 2)}{s.alfa === 0.5 ? " (el que usa el sistema)" : s.alfa === 1 ? " (solo el experto)" : ""}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{n(s.margen_minimo)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.guiada_aciertos}/17</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{n(s.guiada_preguntas)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p(s.robustez_primero, 1)}</td>
                  <td className="py-2 text-right tabular-nums">{p(s.robustez_zona, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[80ch] text-white/85">
          Lectura: confiar solo en el experto empeora la robustez (sus puntajes miden qué tan típico es un síntoma y vienen
          de una sola entrevista). Mezclarlo con la guía da resultados iguales o un poco mejores que los pesos originales
          (diferencias de 1 a 3 puntos, cerca del ruido de la simulación, que es de ±1,2 puntos) y evita el fallo de la consulta
          guiada. Lo que la calibración aporta sobre todo es que el sistema refleja la zona: una plaga que el experto casi
          nunca ve necesita más evidencia.
        </p>
      </section>

      <section className="panel-noche rounded-2xl p-5 sm:p-6">
        <h2 className="text-2xl font-bold">Casos que contó el experto</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {d.experto.map((c) => (
            <li key={c.id} className="rounded-xl bg-white/5 p-4">
              <p className="text-white/90">"{c.relato}"</p>
              <p className="mt-2"><b>Experto:</b> {c.experto_dijo}</p>
              <p><b>Sistema:</b> {c.sistema.map((s) => `${s.plaga} (${n(s.posibilidad, 0)} %)`).join(", ")}</p>
              <p className={`mt-2 font-bold ${c.coincide ? "text-brote" : "text-pulpa"}`}>{c.coincide ? "Coinciden" : c.discrepancia ? "Discrepancia documentada" : "No coinciden"}</p>
              {!c.coincide && <p className="mt-1 text-sm text-white/75">{c.nota}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-noche rounded-2xl p-5 sm:p-6">
        <h2 className="text-2xl font-bold">Modelo de Wallin contra los valores publicados</h2>
        <table className="mt-4 w-full max-w-2xl border-collapse text-left text-base tabular-nums">
          <thead><tr className="border-b-2 border-pulpa text-pulpa"><th className="py-2">Horas húmedas</th><th className="py-2">Temperatura</th><th className="py-2 text-right">Publicado</th><th className="py-2 text-right">Modelo difuso</th></tr></thead>
          <tbody>
            {d.wallin.map((w) => (
              <tr key={w.temperatura_f} className="border-b border-white/15">
                <td className="py-2">{w.horas} h</td><td className="py-2">{n(w.temperatura_c)} °C ({w.temperatura_f} °F)</td>
                <td className="py-2 text-right">{w.publicado}</td><td className="py-2 text-right font-bold text-brote">{n(w.modelo, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-sm text-white/70">Valores de referencia: Universidad de Maine, Cooperative Extension (Bulletin #2418).</p>
      </section>

      {cam && (
        <section className="panel-flor rounded-3xl p-5 sm:p-8">
          <h2 className="text-2xl font-bold">Cámara</h2>
          <p className="mt-2 max-w-[75ch] text-white/90">
            MobileNet preentrenada con ImageNet más una regresión logística, entrenada con {cam.fotos.plantvillage} fotos de
            laboratorio (PlantVillage, {cam.fotos.hojas_distintas_plantvillage} hojas distintas) y {cam.fotos.plantdoc} de campo (PlantDoc).
            Las pruebas de laboratorio se separaron por hoja para no evaluar con hojas ya vistas.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Cifra valor={p(cam.laboratorio_plantvillage.exactitud, 1)} texto="Fotos de laboratorio" detalle="Hoja sobre fondo uniforme. Validación cruzada por hoja." color="text-brote" />
            <Cifra valor={p(cam.campo_plantdoc_con_fotos_de_campo.exactitud, 1)} texto="Fotos de campo" detalle="Rancha contra alternariosis, fondos reales, fotos de internet." color="text-[#f08a6c]" />
            <Cifra valor={p(cam.detector_de_hoja.otras_plantas_rechazadas)} texto="Otras plantas rechazadas"
              detalle={`Responde "no parece hoja de papa" con ${cam.detector_de_hoja.otras_plantas_n} fotos de otras plantas.`} />
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Matriz m={cam.laboratorio_plantvillage.matriz_confusion} titulo="Laboratorio" />
            <Matriz m={cam.campo_plantdoc_con_fotos_de_campo.matriz_confusion} titulo="Campo" />
          </div>
          <p className="mt-5 max-w-[80ch] text-white/90">
            Lectura: en laboratorio funciona; en campo casi adivina. Es la brecha conocida entre fotos de laboratorio y de campo.
            Por eso la cámara no decide: entra al motor como evidencia de peso moderado, se abstiene cuando no está segura y la
            interfaz pide fotografiar la hoja sobre un papel claro. Curiosidad: clasifica como rancha el
            {" "}{p(cam.detector_de_hoja.tomate_con_rancha_clasificadas_como_rancha)} de las hojas de tomate con tizón tardío, que es el mismo patógeno.
          </p>
        </section>
      )}
    </div>
  );
}
