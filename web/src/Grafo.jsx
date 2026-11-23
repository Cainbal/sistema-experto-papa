import { useEffect, useMemo, useRef, useState } from "react";

// Red de razonamiento: hechos -> reglas -> (hechos intermedios -> reglas ->) plagas.
// Se dibuja a partir de la traza que devuelve el motor, así que muestra
// exactamente lo que el motor hizo, no una ilustración aparte.

const COLOR_TIPO = { signo: "#b79cf0", sintoma: "#9a80d6", dano: "#c9b6f5", condicion: "#c98e62", derivacion: "#7fb596", percepcion: "#6fc3df", descarte: "#f08a6c" };
const NOMBRE_TIPO = { signo: "signo", sintoma: "síntoma", dano: "daño", condicion: "condición", derivacion: "paso intermedio", percepcion: "cámara", descarte: "descarte" };
const FUENTE = { guia: "guía del CIP", experto: "experto", "guia+experto": "guía y experto", camara: "cámara", wallin: "modelo de Wallin" };
const num = (x) => x.toFixed(2);
const pct = (x) => `${Math.round(x * 100)}%`;
const limpio = (t) => t.replace(/^¿|\?$/g, "");

function partir(texto, max) {
  const lineas = [""];
  for (const palabra of texto.split(" ")) {
    const ultima = lineas[lineas.length - 1];
    if (ultima && (ultima + " " + palabra).length > max) lineas.push(palabra);
    else lineas[lineas.length - 1] = ultima ? `${ultima} ${palabra}` : palabra;
  }
  return lineas.slice(0, 2);
}

function construir(respuesta, base, hechos) {
  const descartadas = (respuesta.descartadas ?? []).map((d) => ({ ...d, certeza: 0, descartada: true }));
  const hipotesis = [...respuesta.diagnosticos, ...respuesta.riesgos, ...descartadas];
  const esRiesgo = new Set(respuesta.riesgos.map((h) => h.id));
  const indicePlaga = new Map(hipotesis.map((h, i) => [h.id, i]));
  const capa = new Map(); // hecho -> capa
  const reglas = [];

  for (const d of respuesta.traza) {
    for (const p of d.premisas) if (!capa.has(p.hecho)) capa.set(p.hecho, 0);
    const c = Math.max(...d.premisas.map((p) => capa.get(p.hecho))) + 1;
    reglas.push({ d, capa: c, aPlaga: indicePlaga.has(d.conclusion) });
    if (!indicePlaga.has(d.conclusion)) capa.set(d.conclusion, Math.max(capa.get(d.conclusion) ?? 0, c + 1));
  }
  const maxHecho = Math.max(0, ...capa.values());
  const capaRegla = maxHecho + 1;
  const capaPlaga = maxHecho + 2;
  for (const r of reglas) if (r.aPlaga) r.capa = capaRegla;
  // Columnas: hechos en capas pares, reglas en impares, plagas al final.
  const xs = [200];
  for (let c = 1; c <= capaPlaga; c++) xs.push(xs[c - 1] + (c === capaPlaga ? 104 : c % 2 ? 78 : 200));
  const x = (c) => xs[c];
  const ancho = xs[capaPlaga] + 178;

  // Orden vertical: plagas por certeza; reglas junto a su plaga; hechos junto a sus reglas.
  const finales = reglas.filter((r) => r.aPlaga).sort((a, b) => indicePlaga.get(a.d.conclusion) - indicePlaga.get(b.d.conclusion));
  const posRegla = new Map(finales.map((r, i) => [r.d.regla, i]));
  const peso = (hecho) => {
    const usos = reglas.filter((r) => r.d.premisas.some((p) => p.hecho === hecho));
    const vals = usos.map((r) => (r.aPlaga ? posRegla.get(r.d.regla) : peso(r.d.conclusion)));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const porCapa = new Map();
  for (const [hecho, c] of capa) porCapa.set(c, [...(porCapa.get(c) ?? []), hecho]);
  for (const lista of porCapa.values()) lista.sort((a, b) => peso(a) - peso(b));
  const intermedias = new Map();
  for (const r of reglas.filter((r) => !r.aPlaga)) intermedias.set(r.capa, [...(intermedias.get(r.capa) ?? []), r]);

  const filas = Math.max(hipotesis.length * 84, finales.length * 44, ...[...porCapa.values()].map((l) => l.length * 50), 150);
  const alto = filas + 40;
  const y = (i, n, paso) => alto / 2 + (i - (n - 1) / 2) * paso;

  const nodos = new Map();
  for (const [c, lista] of porCapa) {
    lista.forEach((hecho, i) => {
      const def = base.hechos[hecho];
      const etiqueta = def.tipo === "medicion" ? `${def.corto}: ${hechos[hecho]} ${def.unidad}` : def.corto;
      const derivado = def.tipo === "derivado";
      nodos.set(hecho, { x: x(c), y: y(i, lista.length, 50), etiqueta, derivado, largo: derivado ? 150 : 196 });
    });
  }
  for (const [c, lista] of intermedias) lista.forEach((r, i) => nodos.set(`r:${r.d.regla}`, { x: x(c), y: y(i, lista.length, 50) }));
  finales.forEach((r, i) => nodos.set(`r:${r.d.regla}`, { x: x(capaRegla), y: y(i, finales.length, 44) }));
  hipotesis.forEach((h, i) => nodos.set(h.id, { x: x(capaPlaga), y: y(i, hipotesis.length, 84) }));

  const curva = (a, b, da, db) => {
    const x1 = a.x + da, x2 = b.x - db, m = (x1 + x2) / 2;
    return `M${x1} ${a.y} C${m} ${a.y} ${m} ${b.y} ${x2} ${b.y}`;
  };
  const aristas = [];
  for (const r of reglas) {
    const nr = nodos.get(`r:${r.d.regla}`);
    for (const p of r.d.premisas) aristas.push({ regla: r.d.regla, tipo: r.d.tipo, fase: 0, grosor: 2, d: curva(nodos.get(p.hecho), nr, 4, 24) });
    const destino = nodos.get(r.d.conclusion);
    aristas.push({ regla: r.d.regla, tipo: r.d.tipo, fase: 1, grosor: 1.5 + r.d.aporte * 7, plaga: r.aPlaga ? r.d.conclusion : null,
      contra: r.d.sentido === "-", d: curva(nr, destino, 24, r.aPlaga ? 34 : destino.largo) });
  }
  return { hipotesis, esRiesgo, reglas, nodos, aristas, alto, ancho, capa, xRegla: x(capaRegla), xPlaga: x(capaPlaga) };
}

// Punto que recorre una línea recién disparada. Se mueve con JavaScript para
// que funcione igual en todos los navegadores.
function Pulso({ d, espera }) {
  const camino = useRef(null);
  const punto = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const largo = camino.current.getTotalLength();
    const inicio = performance.now() + espera;
    const DURACION = 750, VUELTAS = 2;
    let cuadro;
    const paso = (t) => {
      const k = (t - inicio) / DURACION;
      if (k >= VUELTAS) { punto.current.setAttribute("opacity", "0"); return; }
      if (k >= 0) {
        const f = k % 1;
        const p = camino.current.getPointAtLength(largo * (f * f * (3 - 2 * f)));
        punto.current.setAttribute("cx", p.x);
        punto.current.setAttribute("cy", p.y);
        punto.current.setAttribute("opacity", "1");
      }
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [d, espera]);
  return (
    <>
      <path ref={camino} d={d} fill="none" stroke="none" />
      <circle ref={punto} r="4.5" fill="var(--color-pulpa)" opacity="0" />
    </>
  );
}

export default function Grafo({ respuesta, hechos, base }) {
  const [fijada, setFijada] = useState(null);
  const [encima, setEncima] = useState(null);
  const vistas = useRef(new Set());
  const caja = useRef(null);
  const [desborda, setDesborda] = useState(false);
  const g = useMemo(() => construir(respuesta, base, hechos), [respuesta, base, hechos]);

  const actuales = respuesta.traza.map((d) => d.regla);
  const nuevas = new Set(actuales.filter((r) => !vistas.current.has(r)));
  useEffect(() => { vistas.current = new Set(actuales); });
  useEffect(() => { if (fijada && !actuales.includes(fijada)) setFijada(null); });
  useEffect(() => {
    const medir = () => setDesborda(Boolean(caja.current) && caja.current.scrollWidth > caja.current.clientWidth + 1);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [g.ancho, g.reglas.length]);

  const foco = encima ?? fijada;
  const reglasFoco = new Set(
    !foco ? [] : foco.startsWith("p:") ? g.reglas.filter((r) => r.d.conclusion === foco.slice(2)).map((r) => r.d.regla) : [foco]);
  const tenue = (regla) => (reglasFoco.size && !reglasFoco.has(regla) ? 0.15 : 1);
  const detalle = g.reglas.find((r) => r.d.regla === (foco && !foco.startsWith("p:") ? foco : null))?.d;
  const conocidos = Object.entries(hechos);
  const nombreDe = (id) => base.plagas.find((p) => p.id === id)?.nombre ?? base.hechos[id].corto;

  return (
    <aside className="panel-noche rounded-2xl p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">Cómo va razonando</h2>
        {g.reglas.length > 0 && <p className="text-sm opacity-75">{g.reglas.length} {g.reglas.length === 1 ? "regla disparada" : "reglas disparadas"}</p>}
      </div>

      {g.reglas.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/30 p-6">
          <p className="max-w-[44ch] opacity-85">
            Todavía no se disparó ninguna regla. Cada respuesta afirmativa enciende las reglas
            que la usan, y aquí verás cómo llevan hasta una plaga.
          </p>
        </div>
      ) : (
        <div ref={caja} className="mt-3 overflow-x-auto" tabIndex={desborda ? 0 : undefined}>
          <svg viewBox={`0 0 ${g.ancho} ${g.alto}`} className="mx-auto block" role="img"
            style={{ width: `min(100%, ${g.ancho * 1.15}px)`, minWidth: `${g.ancho * 0.66}px` }}
            aria-label="Red de razonamiento: hechos observados, reglas disparadas y plagas concluidas">
            <g fontFamily="var(--font-texto)" fontSize="13" fill="#ffffff" opacity="0.65">
              <text x="104" y="14" textAnchor="middle">Lo observado</text>
              <text x={g.xRegla} y="14" textAnchor="middle">Reglas</text>
              <text x={g.xPlaga} y="14" textAnchor="middle">Conclusión</text>
            </g>

            {g.aristas.map((a, i) => {
              const nueva = nuevas.has(a.regla);
              return (
                <g key={`${a.regla}-${i}`} opacity={tenue(a.regla)} style={{ transition: "opacity 0.2s" }}>
                  <path d={a.d} fill="none" stroke={COLOR_TIPO[a.tipo]} strokeWidth={a.grosor} strokeLinecap="round" pathLength="1"
                    strokeDasharray={a.contra && !nueva ? "0.02 0.02" : undefined}
                    className={nueva ? "arista-nueva" : undefined} style={nueva ? { animationDelay: `${a.fase * 0.45}s` } : undefined} />
                  {nueva && <Pulso d={a.d} espera={a.fase * 450} />}
                </g>
              );
            })}

            {[...g.capa.keys()].map((hecho) => {
              const n = g.nodos.get(hecho);
              const lineas = partir(n.etiqueta, n.derivado ? 18 : 25);
              return (
                <g key={hecho} transform={`translate(${n.x} ${n.y})`}>
                  <rect x={-n.largo} y="-19" width={n.largo + 4} height="38" rx="19" fill={n.derivado ? "#35513f" : "#3a2c4a"} stroke={n.derivado ? COLOR_TIPO.derivacion : "#6a4c9c"} strokeWidth="1.5" />
                  {lineas.map((l, k) => (
                    <text key={k} x={2 - n.largo / 2} y={(k - (lineas.length - 1) / 2) * 15 + 4.5} textAnchor="middle" fontSize="13.5" fill="#ffffff" fontFamily="var(--font-texto)">{l}</text>
                  ))}
                </g>
              );
            })}

            {g.reglas.map(({ d }) => {
              const n = g.nodos.get(`r:${d.regla}`);
              const activa = reglasFoco.has(d.regla);
              return (
                <g key={d.regla} transform={`translate(${n.x} ${n.y})`} opacity={tenue(d.regla)} style={{ transition: "opacity 0.2s", cursor: "pointer" }}
                  className={nuevas.has(d.regla) ? "nodo-nuevo" : undefined}
                  role="button" tabIndex="0" aria-label={`Regla ${d.regla}, aporta ${num(d.aporte)} a ${nombreDe(d.conclusion)}`} aria-pressed={fijada === d.regla}
                  onMouseEnter={() => setEncima(d.regla)} onMouseLeave={() => setEncima(null)}
                  onFocus={() => setEncima(d.regla)} onBlur={() => setEncima(null)}
                  onClick={() => setFijada(fijada === d.regla ? null : d.regla)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFijada(fijada === d.regla ? null : d.regla); } }}>
                  <rect x="-24" y="-13" width="48" height="26" rx="6" fill={COLOR_TIPO[d.tipo]} stroke={activa || fijada === d.regla ? "var(--color-pulpa)" : "none"} strokeWidth="3" />
                  <text y="4.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1c1230" fontFamily="var(--font-titulo)">{d.regla}</text>
                </g>
              );
            })}

            {g.hipotesis.map((h) => {
              const n = g.nodos.get(h.id);
              const riesgo = g.esRiesgo.has(h.id);
              const fuera = Boolean(h.descartada);
              const r = 30, largo = 2 * Math.PI * r;
              const lineas = partir(h.nombre, 15);
              return (
                <g key={h.id} transform={`translate(${n.x} ${n.y})`} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setEncima(`p:${h.id}`)} onMouseLeave={() => setEncima(null)}>
                  <circle r={r} fill="#2f2340" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="7" />
                  {!fuera && (
                    <circle r={r} fill="none" stroke={riesgo ? COLOR_TIPO.condicion : "var(--color-pulpa)"} strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={riesgo ? "3 9" : `${largo * h.certeza} ${largo}`} transform="rotate(-90)"
                      style={{ transition: "stroke-dasharray 0.7s ease-out" }} />
                  )}
                  <text y="6" textAnchor="middle" fontSize={fuera ? 22 : 17} fontWeight="700" fill={fuera ? COLOR_TIPO.descarte : "#ffffff"} fontFamily="var(--font-titulo)">{fuera ? "✕" : pct(h.certeza)}</text>
                  {lineas.map((l, k) => (
                    <text key={k} x="46" y={(k - (lineas.length - 1) / 2) * 17 + (riesgo ? -3 : 5)} fontSize="15" fontWeight="700" fill="#ffffff" fontFamily="var(--font-titulo)">{l}</text>
                  ))}
                  {riesgo && <text x="46" y={lineas.length * 9 + 12} fontSize="12" fill={COLOR_TIPO.condicion} fontFamily="var(--font-texto)">riesgo, sin síntomas</text>}
                  {fuera && <text x="46" y={lineas.length * 9 + 12} fontSize="12" fill={COLOR_TIPO.descarte} fontFamily="var(--font-texto)">descartada</text>}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {g.reglas.length > 0 && desborda && <p className="mt-2 text-sm text-pulpa">Desliza hacia los lados para ver toda la red.</p>}

      {g.reglas.length > 0 && (
        <div className="mt-3 min-h-[5.5rem] rounded-xl bg-white/10 p-4 text-base" aria-live="polite">
          {detalle ? (
            <>
              <p>
                <b className="font-titulo text-pulpa">{detalle.regla}</b>{" "}
                <span className="opacity-75">({NOMBRE_TIPO[detalle.tipo]}, fuente: {FUENTE[detalle.fuente] ?? detalle.fuente}, ficha {String(detalle.ficha).padStart(2, "0")})</span>
              </p>
              <p className="mt-1"><b>Si</b> {detalle.premisas.map((p) => `${limpio(p.texto)} [${num(p.certeza)}]`).join(" Y ")}, <b>entonces</b> {detalle.sentido === "-" ? "en contra de " : ""}{nombreDe(detalle.conclusion)}.</p>
              <p className="mt-1 tabular-nums opacity-85">
                Grado de las premisas (Y = mínimo): {num(detalle.certeza_premisas)}. Aporte = peso {num(detalle.fc_regla)} × {num(detalle.certeza_premisas)} = {num(detalle.aporte)}.
                Evidencia {detalle.sentido === "-" ? "en contra" : detalle.sentido === "=" ? "del hecho intermedio" : "a favor"}: de {num(detalle.antes)} a {num(detalle.despues)}.
              </p>
            </>
          ) : (
            <p className="opacity-80">
              Toca una regla, o pasa el cursor por ella, para ver qué dice y cuánto aporta.
              El grosor de cada línea indica el aporte; las punteadas rojas son reglas de descarte (evidencia en contra).
            </p>
          )}
        </div>
      )}

      {g.reglas.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-bold">Cálculo paso a paso</summary>
          <ol className="mt-2 space-y-1 text-sm">
            {respuesta.traza.map((d) => (
              <li key={d.regla} className="border-b border-white/15 py-1.5 tabular-nums">
                <b className="text-pulpa">{d.regla}</b> {d.sentido === "-" ? "contra" : "a"} {nombreDe(d.conclusion)}: {num(d.fc_regla)} × {num(d.certeza_premisas)} = {num(d.aporte)}; suma probabilística {num(d.antes)} + {num(d.aporte)} × (1 − {num(d.antes)}) = {num(d.despues)}
              </li>
            ))}
          </ol>
        </details>
      )}

      {conocidos.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-bold">
            Memoria de trabajo ({conocidos.length} {conocidos.length === 1 ? "hecho" : "hechos"})
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {conocidos.map(([id, valor]) => {
              const h = base.hechos[id];
              const texto = h.tipo === "medicion" ? `${valor} ${h.unidad}` : h.tipo === "percepcion" ? `${Math.round(valor * 100)} %` : valor >= 1 ? "sí" : valor > 0 ? "un poco" : valor === 0 ? "no sé" : "no";
              return (
                <li key={id} className="flex justify-between gap-3 border-b border-white/15 py-1">
                  <span className="opacity-85">{h.corto}</span><b className="shrink-0">{texto}</b>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </aside>
  );
}
