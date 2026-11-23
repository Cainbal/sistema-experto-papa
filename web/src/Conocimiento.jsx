import { useState } from "react";
import Sintomas from "./Sintomas.jsx";
import { GraficoPertenencia } from "./Difuso.jsx";

const PESTANAS = [["reglas", "Reglas"], ["difusa", "Lógica difusa"], ["calibracion", "Calibración con el experto"],
  ["experto", "El experto"], ["sintomas", "Síntomas dibujados"]];
const NOMBRE_TIPO = { signo: "signo", sintoma: "síntoma", dano: "daño", condicion: "condición", derivacion: "paso intermedio",
  percepcion: "cámara", descarte: "descarte" };
const FUENTE = { guia: "Guía CIP", experto: "Experto", "guia+experto": "Guía + experto", camara: "Cámara", wallin: "Wallin" };
const FRECUENCIA = { nunca: 0.05, "rara vez": 0.33, "a veces": 0.66, siempre: 1 };
const n2 = (x) => (x == null ? "–" : Number(x).toFixed(2));
const limpio = (t) => t.replace(/^¿|\?$/g, "").replace(/^NO: ¿/, "NO: ");

export default function Conocimiento({ base }) {
  const [pestana, setPestana] = useState("reglas");
  return (
    <section className="panel-tabla rounded-2xl p-5 sm:p-8">
      <h1 className="text-4xl font-bold">Base de conocimiento</h1>
      <p className="mt-3 max-w-[75ch] text-white/85">
        {base.reglas.length} reglas sobre {base.plagas.length} plagas y enfermedades, {Object.keys(base.hechos).length} hechos
        y {Object.keys(base.variables).length} variables difusas. Fuentes: la guía del Centro Internacional de la Papa
        (Pérez y Forbes, 2011), la entrevista a un agricultor con unos 30 años de experiencia y el modelo de Wallin (1962).
      </p>
      <div className="mt-6 flex flex-wrap gap-1 rounded-2xl bg-noche/60 p-1" role="tablist">
        {PESTANAS.map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)}
            className={`rounded-xl px-4 py-2 font-bold transition-colors ${pestana === id ? "bg-lila text-tinta" : "hover:bg-white/10"}`}>
            {texto}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {pestana === "reglas" && <Reglas base={base} />}
        {pestana === "difusa" && <LogicaDifusa base={base} />}
        {pestana === "calibracion" && <Calibracion base={base} />}
        {pestana === "experto" && <Experto base={base} />}
        {pestana === "sintomas" && <Sintomas base={base} />}
      </div>
    </section>
  );
}

function Reglas({ base }) {
  const [filtro, setFiltro] = useState("todas");
  const reglas = base.reglas.filter((r) => filtro === "todas" ? true : filtro === "intermedias" ? r.es_derivacion
    : filtro.startsWith("f:") ? r.fuente === filtro.slice(2) : r.entonces === filtro);
  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="block font-bold">Mostrar</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
            className="mt-1 rounded-lg border-2 border-white/30 bg-noche px-3 py-2 text-base text-white">
            <option value="todas">Todas las reglas</option>
            <option value="intermedias">Pasos intermedios (clima y suelo)</option>
            <option value="f:experto">Aportadas por el experto</option>
            <option value="f:camara">De la cámara</option>
            {base.plagas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <p className="text-white/75">{reglas.length} reglas</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-base">
          <thead>
            <tr className="border-b-2 border-pulpa text-pulpa">
              <th className="py-2 pr-3">Regla</th><th className="py-2 pr-3">Si</th><th className="py-2 pr-3">Entonces</th>
              <th className="py-2 pr-3 text-right">Peso</th><th className="py-2 pr-3">Tipo</th><th className="py-2">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {reglas.map((r) => (
              <tr key={r.id} className="border-b border-white/15 align-top">
                <td className="py-2 pr-3 font-titulo font-bold text-lila">{r.id}</td>
                <td className="py-2 pr-3">{r.si.map(limpio).join(" Y ")}</td>
                <td className="py-2 pr-3 font-bold">{r.sentido === "-" ? <span className="text-[#f08a6c]">en contra de {r.entonces_texto}</span> : r.entonces_texto}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{n2(r.fc)}</td>
                <td className="py-2 pr-3">{NOMBRE_TIPO[r.tipo]}</td>
                <td className="py-2">{FUENTE[r.fuente] ?? r.fuente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LogicaDifusa({ base }) {
  const v = base.variables;
  const entradas = ["temperatura", "humedad_relativa", "humedad_suelo", "plantas_afectadas", "dsv_rancha"];
  const porBanda = {};
  for (const r of base.wallin.reglas) (porBanda[r.banda] ??= []).push(r);
  return (
    <div className="space-y-10">
      <div className="max-w-[75ch] space-y-3 text-white/90">
        <h2 className="text-2xl font-bold">Arquitectura</h2>
        <ol className="grid gap-3 sm:grid-cols-5">
          {[["Entrada", "Respuestas, el clima y la foto"], ["Fuzzificación", "Cada número pasa a grados de pertenencia"],
            ["Motor de inferencia", "Reglas SI-ENTONCES sobre la base de hechos y la de conocimiento"],
            ["Defuzzificación", "Centroide de la salida difusa"], ["Salida", "Posibilidad, urgencia, explicación y manejo"]].map(([t, d], i) => (
            <li key={t} className="rounded-xl bg-noche/60 p-3">
              <p className="font-titulo text-lg font-bold text-pulpa">{i + 1}. {t}</p>
              <p className="text-sm text-white/80">{d}</p>
            </li>
          ))}
        </ol>
        <p>
          Operadores: Y = mínimo; aportes a la misma conclusión = suma probabilística (a + b − ab). Las respuestas
          se fuzzifican así: sí = 1, un poco = 0,5, no sé = 0 y no = −1. Una regla dispara si el grado de sus premisas
          supera {base.meta.umbral_disparo}.
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Variables de entrada</h2>
        <div className="mt-4 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {entradas.map((id) => <GraficoPertenencia key={id} variable={v[id]} />)}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Variables de salida</h2>
        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <div>
            <GraficoPertenencia variable={v.posibilidad} />
            <p className="mt-2 text-sm text-white/80">
              Con la evidencia neta s de cada plaga: fuerza(baja) = 1 − s, fuerza(media) = 1 − |2s − 1|, fuerza(alta) = s.
              Se recorta cada conjunto a su fuerza, se unen con el máximo y el centroide da el porcentaje.
            </p>
          </div>
          <div>
            <GraficoPertenencia variable={v.urgencia} />
            <p className="mt-2 text-sm text-white/80">
              Inferencia Mamdani con dos entradas: posibilidad de la plaga y plantas afectadas (más el clima de Wallin si es rancha).
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Tabla de Wallin (base de BLITECAST)</h2>
        <p className="mt-2 max-w-[75ch] text-white/85">
          Severidad (0 a 4) según las horas seguidas con humedad relativa alta y su temperatura promedio. Cada fila es
          una regla difusa: SI temperatura ES banda Y horas ES nivel ENTONCES severidad ES k.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-base">
            <thead>
              <tr className="border-b-2 border-pulpa text-pulpa">
                <th className="py-2 pr-3">Temperatura promedio</th>
                {[0, 1, 2, 3, 4].map((k) => <th key={k} className="py-2 pr-3 text-center">Severidad {k}</th>)}
              </tr>
            </thead>
            <tbody>
              {["fresca", "templada", "optima"].map((b) => (
                <tr key={b} className="border-b border-white/15">
                  <td className="py-2 pr-3 font-bold">{porBanda[b][0].temperatura}</td>
                  {porBanda[b].map((r) => <td key={r.id} className="py-2 pr-3 text-center tabular-nums">{r.horas}</td>)}
                </tr>
              ))}
              <tr><td className="py-2 pr-3 font-bold">{porBanda.fuera[0].temperatura}</td><td className="py-2 text-center" colSpan="5">siempre 0</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-white/70">
          Wallin, J. R. (1962). Verificado con los puntos que publica la Universidad de Maine (18 h húmedas: 3 a 18,3 °C,
          2 a 13,3 °C, 1 a 10 °C y 0 a 4,4 °C o 29,4 °C). El modelo difuso los reproduce exactamente (ver Evaluación).
        </p>
      </div>
    </div>
  );
}

function Calibracion({ base }) {
  const c = base.meta.calibracion;
  const [plaga, setPlaga] = useState("tizon_tardio");
  const filas = base.calibracion.filter((x) => plaga === "todas" || x.plaga === plaga);
  const nombre = (id) => base.plagas.find((p) => p.id === id)?.nombre ?? id;
  const corto = (ids) => ids.map((h) => base.hechos[h]?.corto ?? h).join(" + ");
  return (
    <div className="space-y-6">
      <div className="max-w-[78ch] space-y-3 text-white/90">
        <h2 className="text-2xl font-bold">De la entrevista a los pesos de las reglas</h2>
        <p>
          El experto puntuó de 0 a 10 qué tan típico es cada síntoma en cada plaga. Eso es P(síntoma | plaga), lo
          contrario de lo que necesita una regla "SI síntoma ENTONCES plaga". El teorema de Bayes da la vuelta:
        </p>
        <p className="overflow-x-auto rounded-xl bg-noche/60 p-4 font-titulo text-lg">
          peso<sub>Bayes</sub> = P(s|d)·P(d) / ( Σ<sub>d′</sub> P(s|d′)·P(d′) + fuga )
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>P(s|d): puntaje del experto ÷ 10 (si no lo evaluó, el criterio basado en la guía).</li>
          <li>P(d): frecuencia en la zona según el experto: nunca {c.prior.nunca}, rara vez {c.prior["rara vez"]}, a veces {c.prior["a veces"]}, siempre {c.prior.siempre}.</li>
          <li>Fuga: otras causas posibles según qué tan específico es el síntoma: signo {c.fuga.signo}, específico {c.fuga.especifico}, general {c.fuga.general}.</li>
          <li>Peso final = {c.alfa} × Bayes + {1 - c.alfa} × peso de la guía. {c.explicacion_alfa.split(". ").slice(1, 2).join("")}.</li>
        </ul>
      </div>
      <label className="block">
        <span className="block font-bold">Plaga</span>
        <select value={plaga} onChange={(e) => setPlaga(e.target.value)} className="mt-1 rounded-lg border-2 border-white/30 bg-noche px-3 py-2 text-base text-white">
          <option value="todas">Todas</option>
          {base.plagas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-base">
          <thead>
            <tr className="border-b-2 border-pulpa text-pulpa">
              <th className="py-2 pr-3">Regla</th><th className="py-2 pr-3">Síntoma</th><th className="py-2 pr-3">Plaga</th>
              <th className="py-2 pr-3 text-right">P(s|d)</th><th className="py-2 pr-3 text-right">P(d)</th>
              <th className="py-2 pr-3">Comparte con</th><th className="py-2 pr-3 text-right">Fuga</th>
              <th className="py-2 pr-3 text-right">Bayes</th><th className="py-2 pr-3 text-right">Guía</th><th className="py-2 text-right">Final</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.regla} className="border-b border-white/15 align-top">
                <td className="py-2 pr-3 font-titulo font-bold text-lila">{x.regla}</td>
                <td className="py-2 pr-3">{corto(x.si)}</td>
                <td className="py-2 pr-3">{nombre(x.plaga)}</td>
                <td className="py-2 pr-3 text-right tabular-nums" title={x.origen_p}>{n2(x.p_sintoma_dado_plaga)}{x.origen_p.startsWith("experto") ? "" : "*"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{n2(x.prior)}</td>
                <td className="py-2 pr-3 text-sm">{x.competidores.map(nombre).join(", ") || "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{x.fuga}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{n2(x.peso_bayes)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{n2(x.fc_v1)}</td>
                <td className="py-2 text-right font-bold tabular-nums text-pulpa">{n2(x.peso)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-white/70">* El experto no evaluó ese síntoma; se usa el criterio basado en la guía. Las reglas aportadas solo por el experto no tienen peso de la guía.</p>
    </div>
  );
}

function Experto({ base }) {
  const e = base.experto;
  const nombre = (id) => base.plagas.find((p) => p.id === id)?.nombre ?? id;
  const corto = (h) => base.hechos[h]?.corto ?? h;
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{e.experto.nombre}</h2>
          <p className="mt-1 text-white/85">{e.experto.perfil}. {e.experto.instrumento}.</p>
          {String(e.experto.consentimiento_nombre).startsWith("pendiente") && (
            <p className="mt-3 rounded-lg bg-[#f08a6c] p-3 text-base font-bold text-tinta">
              Pendiente: confirmar su consentimiento para citar su nombre (las casillas quedaron sin marcar).
            </p>
          )}
        </div>
        <div>
          <h3 className="text-xl font-bold text-pulpa">Qué tan seguido aparece cada plaga en su zona</h3>
          <ul className="mt-3 space-y-1.5">
            {Object.entries(e.frecuencia_zona).sort((a, b) => FRECUENCIA[b[1]] - FRECUENCIA[a[1]]).map(([p, f]) => (
              <li key={p} className="grid grid-cols-[11rem_1fr_5rem] items-center gap-2 text-base">
                <span className="truncate">{nombre(p)}</span>
                <span className="h-2.5 rounded-full bg-white/15"><span className="block h-full rounded-full bg-brote" style={{ width: `${FRECUENCIA[f] * 100}%` }} /></span>
                <span className="text-white/80">{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xl font-bold text-pulpa">Cómo revisa una planta</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6">{e.notas.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </div>
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-bold text-pulpa">Nombres que se usan en la zona</h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {Object.entries(e.nombres_locales).filter(([, v]) => v.length).map(([p, v]) => (
              <li key={p}><b>{v.join(", ")}</b> <span className="text-white/75">→ {nombre(p)}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-white/70">"Chupadera" se usa para tres problemas distintos: el sistema muestra el nombre local, pero no lo usa para decidir.</p>
        </div>
        <div>
          <h3 className="text-xl font-bold text-pulpa">Reglas de descarte que dio</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {e.descartes.map((d) => (
              <li key={d.plaga}>Si NO hay {d.si_no.map(corto).join(" ni ").toLowerCase()}, entonces no es {nombre(d.plaga).toLowerCase()} <span className="text-white/75">({d.respuesta === "sí" ? "seguro" : "a veces"})</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xl font-bold text-pulpa">Casos que contó</h3>
          <ul className="mt-2 space-y-3">
            {e.casos.map((c) => (
              <li key={c.id} className="rounded-xl bg-noche/50 p-3">
                <p>"{c.texto}"</p>
                <p className="mt-1 text-sm"><b>Él dijo:</b> {nombre(c.esperado)}. {c.nota}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
