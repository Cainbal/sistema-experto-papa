import { useCallback, useEffect, useState } from "react";
import { buscarLugar, leerClima } from "./api.js";

const COLOR_NIVEL = { bajo: "#86d6a6", medio: "#ebc044", alto: "#f08a6c" };
const TEXTO_NIVEL = { bajo: "Bajo", medio: "Medio", alto: "Alto" };
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fmt = (x, d = 1) => (x == null ? "–" : Number(x).toLocaleString("es-PE", { maximumFractionDigits: d }));
const diaDe = (fecha) => { const [a, m, d] = fecha.split("-").map(Number); return new Date(a, m - 1, d); };

/** Temperatura y humedad por hora; las horas con humedad alta (≥ 90 %) se sombrean. */
function SerieHoras({ horas, alto = 190, hoy }) {
  const ancho = 760, m = { izq: 34, der: 38, arr: 14, aba: 30 };
  const validas = horas.filter((h) => h.temperatura != null);
  if (validas.length < 2) return <p className="text-white/75">Aún no hay suficientes horas con datos para dibujar.</p>;
  const n = horas.length;
  const x = (i) => m.izq + (i / (n - 1)) * (ancho - m.izq - m.der);
  const tMin = Math.floor(Math.min(...validas.map((h) => h.temperatura)) - 2);
  const tMax = Math.ceil(Math.max(...validas.map((h) => h.temperatura)) + 2);
  const yT = (t) => alto - m.aba - ((t - tMin) / (tMax - tMin)) * (alto - m.aba - m.arr);
  const yH = (h) => alto - m.aba - (h / 100) * (alto - m.aba - m.arr);
  const linea = (campo, y) => horas.map((h, i) => (h[campo] == null ? null : `${x(i).toFixed(1)},${y(h[campo]).toFixed(1)}`))
    .reduce((tramos, p) => { if (p == null) tramos.push([]); else tramos[tramos.length - 1].push(p); return tramos; }, [[]])
    .filter((t) => t.length > 1);
  const cambiosDia = horas.map((h, i) => [h.hora.slice(0, 10), i]).filter(([f], i, arr) => i === 0 || f !== arr[i - 1][0]);
  const paso = x(1) - x(0);
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" role="img" aria-label="Temperatura y humedad relativa por hora">
      {horas.map((h, i) => h.humedad_relativa >= 90 && (
        <rect key={i} x={x(i) - paso / 2} y={m.arr} width={paso} height={alto - m.aba - m.arr} fill="#6fc3df" opacity="0.18" />
      ))}
      {cambiosDia.map(([fecha, i]) => (
        <g key={fecha}>
          <line x1={x(i)} x2={x(i)} y1={m.arr} y2={alto - m.aba} stroke="rgba(255,255,255,0.18)" />
          <text x={x(i) + 4} y={alto - 10} fontSize="12" fill={fecha === hoy ? "var(--color-pulpa)" : "rgba(255,255,255,0.7)"} fontFamily="var(--font-texto)">
            {DIAS[diaDe(fecha).getDay()]} {Number(fecha.slice(8))}
          </text>
        </g>
      ))}
      <g fontSize="11" fill="rgba(255,255,255,0.7)" fontFamily="var(--font-texto)">
        {[tMin, (tMin + tMax) / 2, tMax].map((t) => <text key={t} x={m.izq - 6} y={yT(t) + 4} textAnchor="end">{fmt(t, 0)}°</text>)}
        {[0, 50, 90, 100].map((h) => <text key={h} x={ancho - m.der + 6} y={yH(h) + 4}>{h}%</text>)}
      </g>
      <line x1={m.izq} x2={ancho - m.der} y1={yH(90)} y2={yH(90)} stroke="#6fc3df" strokeDasharray="4 4" opacity="0.6" />
      {linea("humedad_relativa", yH).map((t, k) => <polyline key={`h${k}`} points={t.join(" ")} fill="none" stroke="#6fc3df" strokeWidth="2" />)}
      {linea("temperatura", yT).map((t, k) => <polyline key={`t${k}`} points={t.join(" ")} fill="none" stroke="var(--color-pulpa)" strokeWidth="2.2" />)}
    </svg>
  );
}

function Leyenda() {
  return (
    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/80">
      <span><span className="mr-1.5 inline-block h-1 w-5 rounded bg-pulpa align-middle" />Temperatura (°C)</span>
      <span><span className="mr-1.5 inline-block h-1 w-5 rounded bg-[#6fc3df] align-middle" />Humedad relativa (%)</span>
      <span><span className="mr-1.5 inline-block h-3 w-4 bg-[#6fc3df]/30 align-middle" />Horas con humedad alta</span>
    </p>
  );
}


export default function Alerta({ base, alUsarEnConsulta, alError }) {
  const [clima, setClima] = useState(null);
  const [lugar, setLugar] = useState(null);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const cargarClima = useCallback(async (l) => {
    try {
      setClima(await leerClima(l ?? {}));
      alError(null);
    } catch (e) { alError(e.message); }
  }, [alError]);


  useEffect(() => { cargarClima(); }, [cargarClima]);

  async function buscar(e) {
    e.preventDefault();
    if (texto.trim().length < 2) return;
    setBuscando(true);
    try {
      setResultados((await buscarLugar(texto.trim())).resultados);
      alError(null);
    } catch (err) { alError(err.message); setResultados(null); }
    finally { setBuscando(false); }
  }

  function elegir(r) {
    const l = { lat: r.lat, lon: r.lon, nombre: [r.nombre, r.provincia, r.region].filter(Boolean).join(", ") };
    setLugar(l);
    setResultados(null);
    setTexto("");
    cargarClima(l);
  }

  function miUbicacion() {
    if (!navigator.geolocation) { alError("Este navegador no permite leer la ubicación."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => elegir({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4, nombre: "Mi ubicación" }),
      () => alError("No se pudo leer la ubicación. Revisa el permiso del navegador o busca tu distrito por nombre."),
      { timeout: 10000 });
  }


  const alerta = clima?.alerta;
  const actual = clima?.actual;

  return (
    <div className="space-y-6">
      <section className="panel-flor rounded-3xl p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-white/85">Alerta temprana de rancha (tizón tardío)</p>
            <h1 className="mt-1 text-4xl font-bold sm:text-5xl">{clima?.ubicacion?.nombre ?? lugar?.nombre ?? "Huánuco"}</h1>
            {clima?.ubicacion?.elevacion != null && <p className="mt-1 text-white/80">{fmt(clima.ubicacion.elevacion, 0)} m s. n. m.</p>}
          </div>
          {clima && (
            <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${clima.fuente === "open-meteo" ? "bg-brote text-tinta" : "bg-[#f08a6c] text-tinta"}`}>
              {clima.fuente === "open-meteo" ? "Pronóstico real: Open-Meteo" : "Datos de ejemplo (sin internet)"}
            </span>
          )}
        </div>
        {clima?.aviso && <p className="mt-3 rounded-lg bg-noche/50 p-3 text-base">{clima.aviso}</p>}

        <form onSubmit={buscar} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-0">
            <span className="block text-base text-white/85">Buscar tu distrito o centro poblado</span>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Panao, Kichki, La Unión"
              className="mt-1 w-72 max-w-full rounded-lg border-2 border-white/40 bg-noche/40 px-3 py-2 text-lg text-white placeholder:text-white/50" />
          </label>
          <button type="submit" disabled={buscando} className="rounded-full bg-pulpa px-5 py-2.5 font-bold text-tinta disabled:opacity-60">
            {buscando ? "Buscando…" : "Buscar"}
          </button>
          <button type="button" onClick={miUbicacion} className="font-bold text-pulpa underline">Usar mi ubicación</button>
        </form>
        {resultados && (
          <ul className="mt-3 max-w-xl overflow-hidden rounded-xl bg-noche/60">
            {resultados.length === 0 && <li className="p-3">No se encontró ese lugar en Perú.</li>}
            {resultados.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button type="button" onClick={() => elegir(r)} className="block w-full px-4 py-2.5 text-left hover:bg-white/10">
                  <b>{r.nombre}</b> <span className="text-white/75">{[r.distrito, r.provincia, r.region].filter(Boolean).join(", ")}{r.elevacion != null ? ` · ${fmt(r.elevacion, 0)} m` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {alerta && (
          <div className="mt-6 rounded-2xl p-5 text-tinta" style={{ background: COLOR_NIVEL[alerta.nivel] ?? "#cbb9f6" }}>
            <p className="font-titulo text-3xl font-bold">Riesgo {TEXTO_NIVEL[alerta.nivel]?.toLowerCase() ?? "sin datos"}</p>
            <p className="mt-1 max-w-[70ch] text-lg">{alerta.mensaje}</p>
            {alerta.dia && <p className="mt-1 text-base">Peor día de los próximos cuatro: {DIAS[diaDe(alerta.dia).getDay()]} {Number(alerta.dia.slice(8))}, severidad {fmt(alerta.dsv, 2)} de 4.</p>}
          </div>
        )}
        {actual && "temperatura" in actual.hechos && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-noche/40 p-4">
            <p className="max-w-[60ch] text-base">
              Ahora: <b className="tabular-nums">{fmt(actual.hechos.temperatura)} °C</b> y <b className="tabular-nums">{fmt(actual.hechos.humedad_relativa, 0)} %</b> de humedad
              {actual.dsv_24h != null && <>; severidad de las últimas 24 h: <b className="tabular-nums">{fmt(actual.dsv_24h, 2)}</b> de 4</>}.
            </p>
            <button type="button" className="rounded-full bg-pulpa px-5 py-2.5 font-bold text-tinta"
              onClick={() => alUsarEnConsulta({
                origen: clima.fuente === "open-meteo" ? "clima" : "clima de ejemplo",
                hechos: actual.dsv_24h != null ? { dsv_rancha: actual.dsv_24h } : {},
                medidas: { temperatura: actual.hechos.temperatura, humedad_relativa: actual.hechos.humedad_relativa },
              })}>Usar este clima en una consulta</button>
          </div>
        )}
      </section>

      {clima && (
        <section className="panel-noche rounded-2xl p-5 sm:p-6">
          <h2 className="text-2xl font-bold">Severidad por día (modelo de Wallin difuso)</h2>
          <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {clima.dias.map((d) => {
              const pasado = d.fecha < clima.hoy, esHoy = d.fecha === clima.hoy;
              return (
                <li key={d.fecha} className={`rounded-xl border-2 p-3 ${esHoy ? "border-pulpa" : "border-white/15"} ${pasado ? "opacity-60" : ""}`}>
                  <p className="font-bold">{esHoy ? "Hoy" : DIAS[diaDe(d.fecha).getDay()]} <span className="font-normal text-white/75">{Number(d.fecha.slice(8))}</span></p>
                  <div className="mt-2 h-24 w-full rounded-lg bg-white/10 p-1" aria-hidden="true">
                    <div className="flex h-full items-end">
                      <div className="w-full rounded-md" style={{ height: `${Math.max(4, (d.dsv / 4) * 100)}%`, background: COLOR_NIVEL[d.nivel], transition: "height 0.6s ease-out" }} />
                    </div>
                  </div>
                  <p className="mt-2 font-titulo text-2xl font-bold tabular-nums" style={{ color: COLOR_NIVEL[d.nivel] }}>{fmt(d.dsv, 1)}</p>
                  <p className="text-sm">{TEXTO_NIVEL[d.nivel]}</p>
                  <p className="mt-1 text-sm text-white/75 tabular-nums">{fmt(d.horas_humedas, 0)} h húmedas · {fmt(d.temp_min, 0)}–{fmt(d.temp_max, 0)} °C</p>
                  {d.lluvia > 0 && <p className="text-sm text-white/75 tabular-nums">{fmt(d.lluvia)} mm de lluvia</p>}
                </li>
              );
            })}
          </ol>
          <div className="mt-6">
            <SerieHoras horas={clima.horas} hoy={clima.hoy} />
            <Leyenda />
          </div>
          <details className="mt-5">
            <summary className="cursor-pointer font-bold">¿Cómo se calcula?</summary>
            <div className="mt-2 max-w-[75ch] space-y-2 text-white/85">
              <p>
                La rancha necesita hojas mojadas por muchas horas. El modelo de Wallin (1962), base del sistema
                BLITECAST, cuenta las horas seguidas con humedad relativa alta y mira la temperatura de esas horas:
                con 18 horas húmedas a 18 °C da severidad 3; a 10 °C, solo 1.
              </p>
              <p>
                Aquí la versión es difusa: una hora con 89 % de humedad cuenta casi como húmeda en vez de no contar,
                y las bandas de temperatura tienen bordes suaves. En horas enteras reproduce exactamente la tabla
                original. La tabla completa está en Conocimiento → Lógica difusa.
              </p>
              <p className="text-white/70">
                Wallin se calibró en Estados Unidos. Para la sierra es una aproximación: sirve para avisar, no
                reemplaza la revisión del campo.
              </p>
            </div>
          </details>
        </section>
      )}

    </div>
  );
}
