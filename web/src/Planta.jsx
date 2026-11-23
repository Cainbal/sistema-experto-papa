// Planta de papa ilustrada. Tiene dos usos:
//  - seleccion: se marcan las partes afectadas (inicio de la consulta).
//  - viva: va mostrando los síntomas que el usuario confirma.
// Los dibujos de los síntomas son esquemas propios para orientar; no
// reemplazan a las fotos de la guía del CIP.

const CIELO = "#c9d8f8";
const HOJA = "#4f9b6b";
const TALLO = "#2e6b4a";
const PULPA = "#ebc044";
const RAIZ = "#7a4a2c";
const SUELO = "#d2b394";
const TINTA = "#1c1230";
const MARRON = "#6b4226";
const NEGRO = "#2a1a12";

const HOJAS = [
  { x: 180, y: 56, rot: -90 },
  { x: 84, y: 142, rot: 26 },
  { x: 276, y: 122, rot: -28 },
  { x: 114, y: 84, rot: 42 },
  { x: 250, y: 200, rot: -18 },
  { x: 108, y: 212, rot: 16 },
];
const TUBERCULOS = [
  { x: 84, y: 368, rx: 42, ry: 30, rot: -16 },
  { x: 276, y: 366, rx: 44, ry: 31, rot: 14 },
  { x: 180, y: 422, rx: 38, ry: 26, rot: 0 },
  { x: 60, y: 302, rx: 36, ry: 24, rot: 8 },
  { x: 302, y: 300, rx: 36, ry: 24, rot: -8 },
];
const ZONAS = ["hojas", "tallos", "raices", "tuberculos"];

export default function Planta({ modo = "viva", partes = [], nombres = {}, alCambiar, hechos = {}, derivados = {}, zonaActiva = [], quieta = false, encuadre = "0 0 360 460" }) {
  const sel = modo === "seleccion";
  const on = (id) => (hechos[id] ?? 0) > 0;
  const marcada = (p) => partes.includes(p);
  const alternar = (p) => alCambiar(marcada(p) ? partes.filter((x) => x !== p) : [...partes, p]);
  const zona = (p) => ({
    ...(sel ? { onClick: () => alternar(p), style: { cursor: "pointer" } } : {}),
    className: !sel && zonaActiva.includes(p) ? "zona-activa" : undefined,
  });
  const color = (p, natural) => (sel && marcada(p) ? "#8f5fe0" : natural);

  const seca = on("p_secado_muerte");
  const marchita = on("p_marchitez");
  const amarilla = on("h_amarillamiento");
  const colorHoja = color("hojas", seca ? "#a98c58" : amarilla ? "#c6c460" : marchita ? "#7d9a5e" : HOJA);
  const colorTallo = color("tallos", seca ? "#8a7a4a" : TALLO);
  const colorPapa = color("tuberculos", on("tu_decoloracion_superficie") ? "#f0e6b8" : PULPA);
  const enana = on("p_enanismo") || on("p_detiene_crecimiento");
  const escalaPapa = on("tu_tamano_reducido") ? 0.7 : 1;

  const humedo = "ambiente_templado_humedo" in derivados || on("c_templado_humedo") || on("c_calor_lluvia_alternada");
  const calido = "ambiente_calido" in derivados || on("c_clima_calido") || on("c_calor_lluvia_alternada");

  return (
    <div>
      <svg viewBox={encuadre} className={`mx-auto block w-full rounded-3xl ${sel ? "max-w-sm" : "max-w-[17rem]"}`} role="img"
        aria-label={sel ? "Planta de papa: marca las partes afectadas" : "Planta de papa con los síntomas confirmados"}>
        <rect width="360" height="460" rx="24" fill={CIELO} />
        {sel && marcada("planta") && (
          <rect x="5" y="5" width="350" height="450" rx="20" fill="none" stroke="#8f5fe0" strokeWidth="5" strokeDasharray="10 8" />
        )}

        {/* Clima */}
        {calido && (
          <g className="marca">
            <circle cx="304" cy="52" r="20" fill={PULPA} />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <line key={a} x1="304" y1="22" x2="304" y2="14" stroke={PULPA} strokeWidth="4" strokeLinecap="round" transform={`rotate(${a} 304 52)`} />
            ))}
          </g>
        )}
        {humedo && (
          <g className="marca">
            <path d="M20 34 a16 16 0 0 1 30 -8 a13 13 0 0 1 24 8 z" fill="#8ea0cf" />
            <g className="lluvia" stroke="#4f6fc0" strokeWidth="3.5" strokeLinecap="round">
              {[30, 46, 62, 38, 54].map((x, i) => (
                <line key={i} x1={x} y1={42 + (i % 2) * 13} x2={x - 4} y2={51 + (i % 2) * 13} />
              ))}
            </g>
          </g>
        )}

        {/* Tierra */}
        <path d="M0 270 Q90 258 180 268 T360 266 V436 a24 24 0 0 1 -24 24 H24 a24 24 0 0 1 -24 -24 Z" fill={SUELO} />
        {on("c_suelo_muy_humedo") && <path className="marca" d="M0 270 Q90 258 180 268 T360 266 V284 Q270 278 180 286 T0 288 Z" fill="#4f7fd6" opacity="0.85" />}

        {on("c_seco_sin_lluvias") && (
          <g className="marca" fill="none" stroke="#7a5236" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 270 l10 12 l-8 10 l12 10 l-6 12" /><path d="M338 268 l-10 12 l10 10 l-8 12" /><path d="M236 270 l6 10 l-10 8 l6 10" /><path d="M118 268 l-6 11 l11 8 l-5 10" /><path d="M150 440 l8 -10 l10 8" />
          </g>
        )}

        {/* Raíces y estolones */}
        <g {...zona("raices")}>
          <g fill="none" strokeLinecap="round" stroke={color("raices", RAIZ)} strokeWidth="6">
            <path d="M180 270 C168 308 132 322 108 342" />
            <path d="M180 270 C192 310 228 324 252 340" />
            <path d="M180 270 C178 320 180 356 180 394" />
            <path d="M168 298 C146 298 124 292 104 298" />
            <path d="M192 298 C218 294 240 298 264 292" />
            <path d="M180 340 C164 358 150 374 138 400" strokeWidth="3" />
            <path d="M180 340 C198 360 210 378 224 404" strokeWidth="3" />
          </g>
          {on("r_necrosis") && (
            <g className="marca" fill="none" stroke="#17100c" strokeWidth="8" strokeLinecap="round">
              <path d="M179 292 C179 312 180 330 180 350" /><path d="M174 284 C164 304 148 314 134 324" />
              <path d="M186 284 C196 304 212 316 228 326" /><path d="M156 362 C150 372 144 384 139 398" strokeWidth="5" />
            </g>
          )}
          {on("r_agallas_oscuras") && (
            <g className="marca" fill="#3a271b" stroke="#17100c" strokeWidth="1.5">
              <path d="M134 308 q13 -15 23 0 q10 13 -5 20 q-20 6 -18 -20z" /><path d="M208 314 q12 -13 21 -2 q8 13 -6 20 q-17 3 -15 -18z" />
              <path d="M169 362 q12 -10 20 2 q5 13 -10 16 q-13 0 -10 -18z" /><path d="M116 292 q8 -8 14 0 q4 9 -6 11 q-10 0 -8 -11z" />
            </g>
          )}
          {on("r_quistes") && (
            <g className="marca" fill="#fff6b8" stroke="#5a3a22" strokeWidth="1.4">
              {[[156, 304], [146, 314], [130, 328], [204, 306], [220, 320], [181, 322], [179, 352], [158, 368], [146, 386], [202, 366], [214, 386]].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="4.6" />
              ))}
            </g>
          )}
          {on("e_cancros") && (
            <g className="marca" fill="#17100c" stroke="#c9a070" strokeWidth="2">
              <ellipse cx="134" cy="296" rx="15" ry="6" /><ellipse cx="230" cy="296" rx="15" ry="6" />
            </g>
          )}
        </g>

        {/* Tubérculos */}
        <g {...zona("tuberculos")}>
          {TUBERCULOS.map((t, i) => {
            const deforme = on("tu_deformes") && i % 2 === 0;
            return (
              <g key={i} transform={`translate(${t.x} ${t.y}) rotate(${t.rot}) scale(${escalaPapa})`}>
                {deforme
                  ? <path d={`M${-t.rx} 0 C${-t.rx} ${-t.ry * 1.3} ${-t.rx * 0.2} ${-t.ry * 0.6} ${t.rx * 0.1} ${-t.ry} S${t.rx * 1.2} ${-t.ry * 0.4} ${t.rx} ${t.ry * 0.2} S${t.rx * 0.2} ${t.ry * 0.7} ${-t.rx * 0.3} ${t.ry * 1.1} S${-t.rx} ${t.ry * 0.6} ${-t.rx} 0Z`} fill={colorPapa} stroke={TINTA} strokeWidth="2" />
                  : <ellipse rx={t.rx} ry={t.ry} fill={colorPapa} stroke={TINTA} strokeWidth="2" />}
                <MarcasTuberculo i={i} t={t} on={on} />
              </g>
            );
          })}
          {on("tu_olor_desagradable") && (
            <g className="marca olor" fill="none" stroke="#3d5a12" strokeWidth="4.5" strokeLinecap="round">
              <path d="M136 376 q-8 -10 0 -20 q8 -10 0 -20" /><path d="M150 370 q-8 -10 0 -20 q8 -10 0 -20" /><path d="M164 376 q-8 -10 0 -20 q8 -10 0 -20" />
            </g>
          )}
        </g>

        {/* Parte aérea */}
        <g transform={enana ? "translate(180 270) scale(0.76) translate(-180 -270)" : undefined} style={{ transition: "transform 0.6s ease" }}>
          <g className={quieta ? undefined : "mece"}>
            <g {...zona("tallos")}>
              <g fill="none" strokeLinecap="round" stroke={colorTallo} strokeWidth="12">
                <path d="M180 270 C180 220 178 160 180 80" />
                <path d="M180 228 C158 216 140 214 118 212" strokeWidth="9" />
                <path d="M180 216 C204 206 222 204 242 200" strokeWidth="9" />
                <path d="M180 178 C150 170 122 160 94 144" strokeWidth="9" />
                <path d="M180 160 C212 150 240 140 266 124" strokeWidth="9" />
                <path d="M180 116 C160 106 138 98 120 86" strokeWidth="9" />
              </g>
              {on("t_manchas_alargadas_quebradizo") && (
                <g className="marca" fill={MARRON} stroke="#2a1a12" strokeWidth="1.5">
                  <ellipse cx="180" cy="200" rx="7.5" ry="20" /><ellipse cx="180" cy="134" rx="7.5" ry="18" /><ellipse cx="136" cy="166" rx="14" ry="5.5" transform="rotate(16 136 166)" />
                  <path d="M170 104 l10 -4 l-3 6 l13 -5" fill="none" stroke={CIELO} strokeWidth="4" />
                </g>
              )}
              {on("t_manchas_necroticas") && (
                <g className="marca" fill="#17100c">
                  <ellipse cx="144" cy="167" rx="11" ry="5.5" transform="rotate(18 144 167)" /><ellipse cx="224" cy="146" rx="11" ry="5.5" transform="rotate(-18 224 146)" />
                  <ellipse cx="180" cy="100" rx="6.5" ry="11" /><ellipse cx="180" cy="190" rx="6.5" ry="9" />
                </g>
              )}
              {on("t_cancros") && (
                <g className="marca" fill="#17100c" stroke="#d2a66c" strokeWidth="2.5">
                  <ellipse cx="180" cy="246" rx="7.5" ry="14" /><ellipse cx="180" cy="204" rx="6.5" ry="10" /><ellipse cx="180" cy="146" rx="6" ry="9" />
                </g>
              )}
              {on("b_lesiones_estrangulan") && (
                <g className="marca">
                  <rect x="172" y="240" width="16" height="26" fill="#17100c" />
                  <path d="M171 244 q9 9 0 18z" fill={CIELO} /><path d="M189 244 q-9 9 0 18z" fill={CIELO} />
                </g>
              )}
              {on("t_base_pudricion_negra") && <path className="marca" d="M180 270 C180 256 180 240 180 222" fill="none" stroke="#17100c" strokeWidth="14" strokeLinecap="round" />}
              {on("t_tuberculos_aereos") && (
                <g className="marca" fill="#b7c268" stroke={TINTA} strokeWidth="1.5">
                  <ellipse cx="162" cy="230" rx="15" ry="10" /><ellipse cx="200" cy="206" rx="14" ry="9.5" /><ellipse cx="164" cy="168" rx="12" ry="8.5" />
                </g>
              )}
              {on("t_barrenado_caida_hojas") && (
                <g className="marca">
                  <circle cx="180" cy="146" r="6.5" fill="#17100c" />
                  <path d="M180 146 C182 164 178 182 180 204" fill="none" stroke="#17100c" strokeWidth="4" strokeDasharray="5 4" />
                  <path d="M190 160 q10 6 2 16" fill="none" stroke="#fff3cf" strokeWidth="6" strokeLinecap="round" /><circle cx="191" cy="160" r="2.4" fill="#5a3a22" />
                </g>
              )}
              {on("x_tumores") && (
                <g className="marca" fill="#a58b6a" stroke={TINTA} strokeWidth="1.2">
                  {[[166, 260, 10], [180, 250, 9], [194, 260, 10.5], [182, 266, 8], [170, 246, 7], [192, 244, 6.5]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
                </g>
              )}
            </g>

            <g {...zona("hojas")}>
              {HOJAS.map((h, i) => {
                const caida = marchita ? (h.x < 180 ? -42 : 42) * (i === 0 ? 0 : 1) : 0;
                const deforme = on("h_deformacion") && (i === 5 || i === 2);
                return (
                  <g key={i} transform={`translate(${h.x} ${h.y + (marchita ? (i === 0 ? 4 : 20) : 0)}) rotate(${h.rot + caida}) scale(1.2)${deforme ? " skewX(28) scale(1 0.62)" : ""}`}
                    style={{ transition: "transform 0.6s ease" }}>
                    <ellipse rx="37" ry="20" fill={colorHoja} stroke={TINTA} strokeWidth="2" style={{ transition: "fill 0.6s ease" }} />
                    <path d="M-34 0 H34 M-14 0 l-8 -11 M-14 0 l-8 11 M6 0 l-8 -13 M6 0 l-8 13 M22 0 l-6 -9 M22 0 l-6 9"
                      fill="none" strokeLinecap="round"
                      stroke={on("h_necrosis_nervaduras") ? NEGRO : "#2e6b4a"} strokeWidth={on("h_necrosis_nervaduras") ? 2.8 : 1.2}
                      opacity={on("h_necrosis_nervaduras") ? 1 : 0.55} />
                    <MarcasHoja i={i} on={on} />
                  </g>
                );
              })}
              {on("c_insectos_vectores") && (
                <g className="marca" fill={TINTA}>
                  {[[60, 100], [76, 176], [150, 30], [214, 78], [296, 160], [282, 86], [42, 150], [206, 236]].map(([x, y], i) => (
                    <g key={i} transform={`translate(${x} ${y}) rotate(${i * 47}) scale(2)`}><ellipse rx="3.4" ry="2" /><path d="M-1 -2 l-4 -4 M1 -2 l4 -4" stroke={TINTA} strokeWidth="1" fill="none" /></g>
                  ))}
                </g>
              )}
              {on("t_barrenado_caida_hojas") && (
                <g className="marca" transform="translate(268 262) rotate(8)">
                  <ellipse rx="34" ry="16" fill="#a98c58" stroke={TINTA} strokeWidth="2" /><path d="M-22 0 H22" stroke="#6b5a34" strokeWidth="1.2" />
                </g>
              )}
            </g>
          </g>
        </g>
      </svg>

      {sel && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {[...ZONAS, "planta"].map((p) => (
            <button key={p} type="button" aria-pressed={marcada(p)} onClick={() => alternar(p)}
              className={`rounded-full border-2 px-4 py-2 text-base font-bold transition-colors ${
                marcada(p) ? "border-pulpa bg-pulpa text-tinta" : "border-white/40 text-white hover:border-pulpa"
              }`}>
              {nombres[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Marcas en coordenadas de la hoja: una elipse horizontal de 37 x 20 centrada en (0, 0).
function MarcasHoja({ i, on }) {
  const m = [];
  const manchas = { 1: [[-12, -2, 10], [16, 4, 7]], 2: [[6, 1, 10]], 4: [[-4, 0, 9.5]] }[i];
  if (on("h_manchas_necroticas") && manchas) {
    m.push(<g key="mn" className="marca" fill={MARRON}>{manchas.map(([x, y, r], k) => (
      <path key={k} d={`M${x - r} ${y} q${r * 0.3} ${-r * 1.2} ${r} ${-r * 0.9} q${r * 1.1} ${r * 0.2} ${r} ${r} q${-r * 0.3} ${r} ${-r} ${r * 0.8} q${-r} 0 ${-r} ${-r * 0.9}z`} />
    ))}</g>);
  }
  if (on("h_pelusilla_enves") && manchas) {
    m.push(<g key="pe" className="marca">
      {manchas.map(([x, y, r], k) => (
        <g key={k}>
          {!on("h_manchas_necroticas") && <circle cx={x} cy={y} r={r * 0.75} fill="#7d6a4a" />}
          <circle cx={x} cy={y} r={r + 2.5} fill="none" stroke="#ffffff" strokeWidth="4.5" strokeDasharray="1.2 3.2" strokeLinecap="round" />
        </g>
      ))}
    </g>);
  }
  if (on("h_anillos_concentricos") && manchas) {
    m.push(<g key="ac" className="marca">
      {manchas.map(([x, y, r], k) => (
        <g key={k} fill="none" stroke="#1a0f08" strokeWidth="1.6">
          <circle cx={x} cy={y} r={r} fill={MARRON} /><circle cx={x} cy={y} r={r * 0.66} /><circle cx={x} cy={y} r={r * 0.33} />
        </g>
      ))}
    </g>);
  }
  if (on("h_manchas_limitadas_nervaduras") && (i === 3 || i === 5)) {
    m.push(<g key="ln" className="marca" fill={MARRON} stroke="#2a1a12" strokeWidth="1"><path d="M-14 -1 l-8 -11 l14 -4 l8 15z" /><path d="M6 1 l-8 13 l16 0 l6 -13z" /><path d="M-30 1 l14 0 l-7 10z" /><path d="M22 -1 l-6 -9 l10 3z" /></g>);
  }
  if (on("h_mosaico") && (i === 0 || i === 4 || i === 1)) {
    m.push(<g key="mo" className="marca" fill="#eee56a"><path d="M-30 -5 l12 -9 l12 9 l-11 10z" /><path d="M-4 3 l15 -3 l6 11 l-15 5z" /><path d="M12 -15 l14 5 l-7 9 l-11 -4z" /><path d="M-14 -16 l10 2 l-4 7z" /></g>);
  }
  if (on("h_moteado") && (i === 5 || i === 2)) {
    m.push(<g key="mt" className="marca">
      {[[-24, -4], [-14, 7], [-4, -9], [6, 6], [16, -5], [24, 4], [-8, 0]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="4" fill={k % 2 ? "#dcec8a" : "#17422b"} />)}
    </g>);
  }
  if (on("h_media_luna") && [1, 2, 4].includes(i)) {
    m.push(<g key="ml" className="marca" fill={CIELO} stroke={TINTA} strokeWidth="1.5">
      <path d="M2 -20 a11 11 0 0 0 22 4.5z" /><path d="M-28 13 a11 11 0 0 1 21 6.5z" />
    </g>);
  }
  if (on("h_minado") && (i === 4 || i === 3)) {
    m.push(<path key="mi" className="marca" d="M-26 4 q6 -12 12 -2 t12 -2 t12 2 t10 -6" fill="none" stroke="#f6f1cf" strokeWidth="4.5" strokeLinecap="round" />);
  }
  if (on("h_manchas_plateadas") && (i === 3 || i === 5 || i === 0)) {
    m.push(<g key="pl" className="marca" fill="#d7dde4" opacity="0.92"><ellipse cx="-12" cy="-5" rx="10" ry="5" /><ellipse cx="12" cy="6" rx="11" ry="5" /></g>);
  }
  if (on("h_insectos_enves") && (i === 3 || i === 1)) {
    m.push(<g key="in" className="marca" fill={TINTA}>
      {[[-18, 8], [-6, -10], [4, 9], [14, -8], [24, 2]].map(([x, y], k) => <ellipse key={k} cx={x} cy={y} rx="4.6" ry="1.8" transform={`rotate(${k * 40} ${x} ${y})`} />)}
    </g>);
  }
  if (on("h_perforaciones")) {
    m.push(<g key="pf" className="marca" fill={CIELO} stroke={TINTA} strokeWidth="0.8">
      {[[-22, -3], [-10, 9], [-2, -8], [10, 3], [20, -7], [24, 6]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="3.3" />)}
    </g>);
  }
  if (on("h_huevos_axilas") && [1, 2, 3, 4].includes(i)) {
    // Huevos de la polilla en la base de la hoja, donde se une al tallo (lado +x).
    m.push(<g key="hv" className="marca" fill="#fff6d6" stroke="#8a7a4a" strokeWidth="0.8">
      {[[27, -3], [31, 2], [26, 4], [33, -4], [29, 7]].map(([x, y], k) => <ellipse key={k} cx={x} cy={y} rx="2.6" ry="1.9" />)}
    </g>);
  }
  if (on("h_tumores_hojas_flores") && (i === 0 || i === 3)) {
    m.push(<g key="tu" className="marca" fill="#9fae6a" stroke={TINTA} strokeWidth="1">
      {[[20, -5, 9], [30, 4, 8], [16, 7, 7.5], [32, -7, 6], [8, -4, 6]].map(([x, y, r], k) => <circle key={k} cx={x} cy={y} r={r} />)}
    </g>);
  }
  return m;
}

// Marcas en coordenadas del tubérculo: elipse de t.rx x t.ry centrada en (0, 0).
function MarcasTuberculo({ i, t, on }) {
  const m = [];
  const s = t.rx / 34;
  const g = (key, hijos, extra = {}) => <g key={key} className="marca" transform={`scale(${s})`} {...extra}>{hijos}</g>;
  if (i === 0) {
    if (on("tu_manchas_marron_rojizo_humedas")) m.push(g("rj", <><path d="M-24 -6 q6 -12 16 -6 q8 6 0 13 q-12 6 -16 -7z" fill="#8a3b2a" opacity="0.9" /><path d="M6 2 q8 -8 16 -2 q4 8 -6 11 q-10 0 -10 -9z" fill="#8a3b2a" opacity="0.9" /></>));
    if (on("tu_pudricion_blanda_crema")) m.push(g("pb", <path d="M-12 -14 q14 -8 24 2 q8 12 -6 20 q-16 6 -24 -6 q-4 -10 6 -16z" fill="#f2e6c4" stroke="#3a2518" strokeWidth="3" />));
    if (on("tu_larvas_blancas")) m.push(g("lb", <g>{[[-14, -2, 0], [12, 4, 140]].map(([x, y, r], k) => (
      <g key={k} transform={`translate(${x} ${y}) rotate(${r})`}>
        <path d="M-7 3 a7 7 0 1 1 9 3" fill="none" stroke="#fffaf0" strokeWidth="5.5" strokeLinecap="round" />
        <circle cx="2.5" cy="6" r="2.6" fill="#8a5a2a" />
      </g>))}</g>));
    if (on("tu_galerias_profundas")) m.push(g("gp", <><path d="M-26 4 C-14 -8 -2 12 10 0 S24 -2 28 4" fill="none" stroke={NEGRO} strokeWidth="4" strokeLinecap="round" /><path d="M-6 -16 C-2 -8 -8 -2 -2 6" fill="none" stroke={NEGRO} strokeWidth="3.5" strokeLinecap="round" /></>));
  }
  if (i === 1) {
    const corte = on("tu_corte_estrias_necroticas") || on("tu_exudado_anillo_vascular");
    if (corte) m.push(g("ct", <><ellipse rx="26" ry="17" fill="#f7efcf" stroke="#b79a3a" strokeWidth="1.5" /><ellipse rx="18" ry="11" fill="none" stroke="#d9c98a" strokeWidth="1.5" /></>));
    if (on("tu_corte_estrias_necroticas")) m.push(g("es", <g stroke={MARRON} strokeWidth="2.6" strokeLinecap="round"><path d="M-25 -3 L-9 -1" /><path d="M-14 -14 L-5 -5" /><path d="M12 -15 L5 -6" /><path d="M25 2 L10 2" /><path d="M-12 14 L-4 6" /><path d="M14 14 L6 6" /></g>));
    if (on("tu_exudado_anillo_vascular")) m.push(g("ex", <g fill="#ffffff" stroke="#9aa3b5" strokeWidth="0.8">{[[-18, 0], [-10, -9], [2, -11], [14, -7], [18, 2], [8, 10], [-6, 10]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="2.8" />)}</g>));
  }
  if (i === 2) {
    if (on("tu_manchas_marron_oscuro_hundidas")) m.push(g("hu", <g fill="#3b2a1e" stroke="#7a5a3a" strokeWidth="1.5"><circle cx="-14" cy="-3" r="6.5" /><circle cx="8" cy="5" r="7.5" /><ellipse cx="20" cy="-8" rx="5" ry="4" /></g>));
    if (on("tu_pudricion_seca")) m.push(g("ps", <path d="M-26 -4 q10 -14 26 -10 q12 6 4 18 q-14 10 -28 2 q-6 -4 -2 -10z" fill="#9c9484" stroke="#5f584c" strokeWidth="1.5" />));
    if (on("tu_arrugado_momificado")) m.push(g("ar", <g fill="none" stroke="#4a443a" strokeWidth="1.6" strokeLinecap="round"><path d="M-22 -2 q8 -6 16 0 t16 0 t14 0" /><path d="M-18 7 q8 -6 16 0 t16 0" /><path d="M-14 -10 q8 -6 16 0 t14 0" /></g>));
    if (on("tu_agujeros_circulares")) m.push(g("ag", <g fill={NEGRO}>{[[-16, 2, 4.5], [2, -7, 4], [16, 5, 4.5], [-2, 9, 3.5]].map(([x, y, r], k) => <circle key={k} cx={x} cy={y} r={r} />)}</g>));
  }
  if (i === 3) {
    if (on("tu_costras")) m.push(g("co", <g fill="#17100c"><path d="M-20 -6 l8 -6 l8 4 l-4 8 l-9 1z" /><path d="M4 -2 l9 -5 l8 5 l-6 8 l-9 -1z" /><path d="M-8 10 l7 -4 l6 5 l-8 4z" /></g>));
    if (on("tu_rajaduras")) m.push(g("ra", <g fill="none" stroke={NEGRO} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M-26 0 l10 -5 l6 7 l10 -6 l8 6 l12 -4" /><path d="M-2 -4 l3 -12" /></g>));
    if (on("tu_necrosis")) m.push(g("ne", <g fill="#3b2a1e"><path d="M-22 4 q4 -10 14 -6 q6 8 -4 12 q-10 2 -10 -6z" /><path d="M8 -12 q10 -4 14 4 q0 8 -10 6 q-8 -2 -4 -10z" /></g>));
    if (on("tu_galerias_irregulares")) m.push(g("gi", <path d="M-24 6 q4 -14 10 -4 q4 10 8 -2 q4 -12 10 0 q4 10 10 -4 l6 4" fill="none" stroke={NEGRO} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />));
  }
  if (i === 4) {
    if (on("tu_pustulas_polvillo")) m.push(g("pu", <>{[[-16, -4], [-2, 6], [12, -6], [20, 6], [-8, -12]].map(([x, y], k) => <g key={k}><circle cx={x} cy={y} r="6.5" fill="none" stroke={MARRON} strokeWidth="1.5" strokeDasharray="1.5 2.5" /><circle cx={x} cy={y} r="3.6" fill={MARRON} /></g>)}</>));
    if (on("tu_exudado_ojos")) m.push(g("eo", <g fill="#ffffff" stroke="#7b869c" strokeWidth="1.2"><circle cx="-14" cy="2" r="2.5" fill="#3b2a1e" stroke="none" /><path d="M-20 6 q6 -14 12 0 q0 9 -6 9 q-6 0 -6 -9z" /><circle cx="12" cy="-8" r="2.5" fill="#3b2a1e" stroke="none" /><path d="M6 -4 q6 -14 12 0 q0 9 -6 9 q-6 0 -6 -9z" /><path d="M32 -4 q6 -14 12 0 q0 9 -6 9 q-6 0 -6 -9z" /></g>));
    if (on("tu_agallas") || on("tu_agallas_interior_negruzco")) m.push(g("ga", <g fill="#d9b24a" stroke={TINTA} strokeWidth="1.5"><circle cx="-24" cy="-18" r="13" /><circle cx="18" cy="-22" r="12" /><circle cx="34" cy="10" r="10" /></g>));
    if (on("tu_agallas_interior_negruzco")) m.push(g("gn", <><circle cx="-24" cy="-18" r="13" fill="#f2e6c4" stroke={TINTA} strokeWidth="1.5" /><g fill="#120c08">{[[-30, -22], [-24, -25], [-18, -22], [-28, -15], [-21, -17], [-25, -11], [-17, -14], [-32, -17]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="2.3" />)}</g></>));
    if (on("x_tumores")) m.push(g("xt", <g fill="#a58b6a" stroke={TINTA} strokeWidth="1.2">{[[-4, -18, 7], [6, -22, 6], [14, -15, 6.5], [4, -13, 5]].map(([x, y, r], k) => <circle key={k} cx={x} cy={y} r={r} />)}</g>));
  }
  return m;
}
