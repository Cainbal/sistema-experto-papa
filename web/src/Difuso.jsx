// Gráficos de la lógica difusa, dibujados a mano en SVG con los mismos conjuntos que usa el motor
// (llegan desde /api/base en base.variables). Lo que se ve aquí es exactamente lo que calcula Python.

export const COLORES_TERMINO = ["#86d6a6", "#ebc044", "#f08a6c", "#cbb9f6"];

function trapecio(x, [a, b, c, d]) {
  if (b <= x && x <= c) return 1;
  if (a < x && x < b) return (x - a) / (b - a);
  if (c < x && x < d) return (d - x) / (d - c);
  return 0;
}

export function grado(variable, termino, x) {
  return trapecio(x, variable.terminos[termino]);
}

const fmt = (x, dec = 1) => Number(x).toLocaleString("es-PE", { maximumFractionDigits: dec });

function Ejes({ variable, x0, x1, y0, y1, escalaX, marcas = 5 }) {
  const [lo, hi] = variable.rango;
  const ticks = Array.from({ length: marcas + 1 }, (_, i) => lo + ((hi - lo) * i) / marcas);
  return (
    <g fontSize="11" fill="rgba(255,255,255,0.7)" fontFamily="var(--font-texto)">
      <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="rgba(255,255,255,0.35)" />
      <line x1={x0} x2={x0} y1={y0} y2={y1} stroke="rgba(255,255,255,0.2)" />
      {ticks.map((t) => (
        <text key={t} x={escalaX(t)} y={y1 + 14} textAnchor="middle">{fmt(t)}</text>
      ))}
      <text x={x0 - 6} y={y0 + 4} textAnchor="end">1</text>
      <text x={x0 - 6} y={y1} textAnchor="end">0</text>
    </g>
  );
}

function camino(variable, termino, escalaX, escalaY, pasos = 120, recorte = 1) {
  const [lo, hi] = variable.rango;
  const puntos = [];
  for (let i = 0; i <= pasos; i++) {
    const x = lo + ((hi - lo) * i) / pasos;
    puntos.push(`${escalaX(x).toFixed(1)},${escalaY(Math.min(recorte, grado(variable, termino, x))).toFixed(1)}`);
  }
  return puntos;
}

/** Conjuntos de una variable de entrada y, si hay valor, cuánto pertenece a cada término. */
export function GraficoPertenencia({ variable, valor = null, titulo, alto = 150, compacto = false }) {
  const ancho = 420, m = { izq: 26, der: 14, arr: compacto ? 10 : 22, aba: 28 };
  const [lo, hi] = variable.rango;
  const escalaX = (x) => m.izq + ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo)) * (ancho - m.izq - m.der);
  const escalaY = (g) => alto - m.aba - g * (alto - m.aba - m.arr);
  const terminos = Object.keys(variable.terminos);
  const grados = valor == null ? null : Object.fromEntries(terminos.map((t) => [t, grado(variable, t, valor)]));
  return (
    <figure className="min-w-0">
      {titulo !== false && (
        <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-base">
          <b>{titulo ?? variable.nombre}</b>
          {valor != null && <span className="tabular-nums text-pulpa">{fmt(valor)} {variable.unidad}</span>}
        </figcaption>
      )}
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" role="img"
        aria-label={`Conjuntos difusos de ${variable.nombre}${valor != null ? `; valor ${valor}` : ""}`}>
        <Ejes variable={variable} x0={m.izq} x1={ancho - m.der} y0={m.arr} y1={alto - m.aba} escalaX={escalaX} />
        {terminos.map((t, i) => {
          const pts = camino(variable, t, escalaX, escalaY);
          const activo = grados && grados[t] > 0;
          return (
            <g key={t}>
              <polygon points={`${escalaX(lo)},${escalaY(0)} ${pts.join(" ")} ${escalaX(hi)},${escalaY(0)}`}
                fill={COLORES_TERMINO[i]} opacity={activo ? 0.28 : 0.1} />
              <polyline points={pts.join(" ")} fill="none" stroke={COLORES_TERMINO[i]} strokeWidth={activo ? 2.6 : 1.6} />
            </g>
          );
        })}
        {terminos.map((t, i) => {
          const [a, b, c, d] = variable.terminos[t];
          const centro = (Math.max(lo, b) + Math.min(hi, c)) / 2 || (a + d) / 2;
          return (
            <text key={t} x={escalaX(centro)} y={m.arr - 4 + (compacto ? 12 : 0)} textAnchor="middle" fontSize="12"
              fontWeight="700" fill={COLORES_TERMINO[i]} fontFamily="var(--font-titulo)">{variable.etiquetas[t]}</text>
          );
        })}
        {valor != null && (
          <g>
            <line x1={escalaX(valor)} x2={escalaX(valor)} y1={m.arr - 2} y2={alto - m.aba} stroke="#fff" strokeWidth="2" strokeDasharray="4 3" />
            {terminos.map((t, i) => grados[t] > 0 && (
              <g key={t}>
                <line x1={m.izq} x2={escalaX(valor)} y1={escalaY(grados[t])} y2={escalaY(grados[t])} stroke={COLORES_TERMINO[i]} strokeDasharray="2 3" />
                <circle cx={escalaX(valor)} cy={escalaY(grados[t])} r="4.5" fill={COLORES_TERMINO[i]} stroke="#1c1230" strokeWidth="1.5" />
              </g>
            ))}
          </g>
        )}
      </svg>
      {grados && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm tabular-nums">
          {terminos.map((t, i) => (
            <span key={t} style={{ color: grados[t] > 0 ? COLORES_TERMINO[i] : "rgba(255,255,255,0.45)" }}>
              μ<sub>{variable.etiquetas[t]}</sub> = {fmt(grados[t], 2)}
            </span>
          ))}
        </p>
      )}
    </figure>
  );
}

/** Salida difusa: cada término recortado a la fuerza con que se activó, su unión y el centroide. */
export function GraficoSalida({ variable, fuerzas, valor, alto = 170, titulo }) {
  const ancho = 420, m = { izq: 26, der: 14, arr: 24, aba: 28 };
  const [lo, hi] = variable.rango;
  const escalaX = (x) => m.izq + ((x - lo) / (hi - lo)) * (ancho - m.izq - m.der);
  const escalaY = (g) => alto - m.aba - g * (alto - m.aba - m.arr);
  const terminos = Object.keys(variable.terminos);
  const pasos = 160;
  const union = [];
  for (let i = 0; i <= pasos; i++) {
    const x = lo + ((hi - lo) * i) / pasos;
    const mu = Math.max(...terminos.map((t) => Math.min(fuerzas[t] ?? 0, grado(variable, t, x))));
    union.push(`${escalaX(x).toFixed(1)},${escalaY(mu).toFixed(1)}`);
  }
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-base">
        <b>{titulo ?? `Defuzzificación: ${variable.nombre.toLowerCase()}`}</b>
        {valor != null && <span className="tabular-nums text-pulpa">centroide = {fmt(valor)}{variable.unidad === "%" ? " %" : ""}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" role="img"
        aria-label={`Salida difusa de ${variable.nombre}: centroide ${valor}`}>
        <Ejes variable={variable} x0={m.izq} x1={ancho - m.der} y0={m.arr} y1={alto - m.aba} escalaX={escalaX} />
        {terminos.map((t, i) => (
          <polyline key={t} points={camino(variable, t, escalaX, escalaY).join(" ")} fill="none" stroke={COLORES_TERMINO[i]}
            strokeWidth="1.3" strokeDasharray="4 4" opacity="0.7" />
        ))}
        {terminos.map((t, i) => (fuerzas[t] ?? 0) > 0 && (
          <polygon key={t} fill={COLORES_TERMINO[i]} opacity="0.55"
            points={`${escalaX(lo)},${escalaY(0)} ${camino(variable, t, escalaX, escalaY, 120, fuerzas[t]).join(" ")} ${escalaX(hi)},${escalaY(0)}`} />
        ))}
        <polyline points={union.join(" ")} fill="none" stroke="#fff" strokeWidth="2" />
        {terminos.map((t, i) => {
          const [, b, c] = variable.terminos[t];
          const centro = (Math.max(lo, b) + Math.min(hi, c)) / 2;
          return (
            <text key={t} x={escalaX(centro)} y={m.arr - 8} textAnchor="middle" fontSize="12" fontWeight="700"
              fill={COLORES_TERMINO[i]} fontFamily="var(--font-titulo)">
              {variable.etiquetas[t]} {fmt(fuerzas[t] ?? 0, 2)}
            </text>
          );
        })}
        {valor != null && (
          <g>
            <line x1={escalaX(valor)} x2={escalaX(valor)} y1={m.arr} y2={alto - m.aba} stroke="var(--color-pulpa)" strokeWidth="3" />
            <polygon points={`${escalaX(valor) - 7},${alto - m.aba + 1} ${escalaX(valor) + 7},${alto - m.aba + 1} ${escalaX(valor)},${alto - m.aba - 11}`} fill="var(--color-pulpa)" />
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Barra doble: evidencia a favor y en contra que entra a la defuzzificación. */
export function BarraEvidencia({ favor, contra }) {
  const neta = favor * (1 - contra);
  const fila = (texto, valor, color) => (
    <div className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-sm">
      <span>{texto}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-white/15">
        <span className="block h-full rounded-full" style={{ width: `${valor * 100}%`, background: color, transition: "width 0.6s ease-out" }} />
      </span>
      <b className="text-right tabular-nums">{fmt(valor, 2)}</b>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {fila("A favor", favor, "var(--color-brote)")}
      {fila("En contra", contra, "#f08a6c")}
      {fila("Neta", neta, "var(--color-pulpa)")}
      <p className="text-sm text-white/70">Neta = a favor × (1 − en contra) = {fmt(favor, 2)} × {fmt(1 - contra, 2)} = {fmt(neta, 2)}</p>
    </div>
  );
}
