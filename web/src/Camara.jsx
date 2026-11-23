import { useEffect, useRef, useState } from "react";
import { analizarFoto } from "./api.js";

const COLOR_CLASE = { rancha: "#f08a6c", alternaria: "#ebc044", sana: "#86d6a6" };

export default function Camara({ base, modo, alUsarEnConsulta }) {
  const [archivo, setArchivo] = useState(null);
  const [vista, setVista] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [verMapa, setVerMapa] = useState(true);
  const entrada = useRef(null);
  const tecnico = modo === "tecnico";

  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  async function elegir(f) {
    if (!f) return;
    setArchivo(f);
    setVista(URL.createObjectURL(f));
    setResultado(null);
    setError(null);
    setCargando(true);
    try {
      setResultado(await analizarFoto(f));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  if (!base.camara.disponible) {
    return (
      <section className="panel-flor rounded-3xl p-6 sm:p-10">
        <h1 className="text-4xl font-bold">La cámara no está activada</h1>
        <p className="mt-4 max-w-[60ch] text-lg">
          El resto del sistema funciona igual. Para activarla, instala los paquetes de la cámara y reinicia el servidor:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-noche/60 p-4 text-base">pip install -r requirements-camara.txt</pre>
        <p className="mt-3 text-white/80">Motivo: {base.camara.motivo}</p>
      </section>
    );
  }

  const ok = resultado?.estado === "ok";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <section className="panel-flor rounded-3xl p-5 sm:p-8">
        <h1 className="text-4xl font-bold sm:text-5xl">Foto de la hoja</h1>
        <p className="mt-3 max-w-[56ch] text-lg text-white/90">
          Una sola hoja, de cerca, sobre un papel claro y con buena luz. Así se parece a las fotos con las
          que aprendió el modelo, y acierta mucho más.
        </p>
        <input ref={entrada} type="file" accept="image/*" capture="environment" className="sr-only" id="foto"
          onChange={(e) => elegir(e.target.files?.[0])} />
        <label htmlFor="foto" className="mt-6 inline-block cursor-pointer rounded-full bg-pulpa px-7 py-4 text-xl font-bold text-tinta transition hover:brightness-110">
          {archivo ? "Tomar otra foto" : "Tomar o elegir una foto"}
        </label>

        <div className="mt-6"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files?.[0]); }}>
          {vista ? (
            <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-noche/50">
              <img src={vista} alt="Foto elegida" className="absolute inset-0 h-full w-full object-fill" />
              {verMapa && resultado?.mapa_calor && (
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${resultado.mapa_calor.length}, 1fr)` }} aria-hidden="true">
                  {resultado.mapa_calor.flat().map((v, i) => (
                    <div key={i} style={{ background: `rgba(240, 138, 108, ${v * 0.6})`, boxShadow: v > 0.6 ? "inset 0 0 0 2px rgba(255,255,255,0.5)" : "none" }} />
                  ))}
                </div>
              )}
              {cargando && <div className="absolute inset-0 grid place-items-center bg-noche/60 text-xl font-bold">Analizando…</div>}
            </div>
          ) : (
            <div className="grid aspect-[4/3] max-w-md place-items-center rounded-2xl border-2 border-dashed border-white/40 p-6 text-center text-white/80">
              También puedes arrastrar una foto aquí.
            </div>
          )}
          {resultado?.mapa_calor && (
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={verMapa} onChange={(e) => setVerMapa(e.target.checked)} className="h-5 w-5 accent-[var(--color-pulpa)]" />
              Mostrar dónde miró el modelo
            </label>
          )}
        </div>
      </section>

      <aside className="panel-noche rounded-2xl p-5 sm:p-6" aria-live="polite">
        {error && <p role="alert" className="rounded-lg bg-[#f08a6c] p-4 font-bold text-tinta">{error}</p>}
        {!resultado && !error && (
          <>
            <h2 className="text-2xl font-bold">Qué hace la cámara</h2>
            <p className="mt-2 text-white/85">
              Distingue tres casos: hoja con rancha, hoja con alternariosis y hoja sana. No diagnostica sola: su
              resultado entra a la consulta como un hecho más, y el sistema lo combina con tus respuestas.
            </p>
            <p className="mt-3 text-sm text-white/70">
              Precisión medida: 97,7 % con fotos de laboratorio y 56 % con fotos de campo de internet. Detalles en Evaluación.
            </p>
          </>
        )}
        {resultado && (
          <>
            <p className="text-white/80">{resultado.estado === "ok" ? "Resultado" : resultado.estado === "no_seguro" ? "No está seguro" : "No parece una hoja de papa"}</p>
            <h2 className="mt-1 text-3xl font-bold">{ok ? resultado.nombre : resultado.estado === "no_seguro" ? "Mejor responde las preguntas" : "Prueba con otra foto"}</h2>
            <p className="mt-2 text-white/90">{resultado.mensaje}</p>
            <ul className="mt-5 space-y-3">
              {Object.entries(resultado.probabilidades).map(([c, p]) => (
                <li key={c}>
                  <div className="flex justify-between text-base"><span>{resultado.nombres[c]}</span><b className="tabular-nums">{Math.round(p * 100)} %</b></div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: COLOR_CLASE[c], transition: "width 0.6s ease-out" }} />
                  </div>
                </li>
              ))}
            </ul>
            {tecnico && (
              <dl className="mt-5 space-y-2 text-sm tabular-nums">
                <div><dt className="text-white/70">Parecido a hojas de papa (similitud coseno)</dt><dd>{resultado.similitud_hoja} (mínimo {resultado.umbral_hoja})</dd></div>
                <div><dt className="text-white/70">Confianza mínima para aceptar</dt><dd>{resultado.umbral_confianza}</dd></div>
                <div><dt className="text-white/70">Hechos para el motor</dt><dd className="break-words">{ok ? Object.entries(resultado.hechos).map(([k, v]) => `${k} = ${v}`).join(", ") : "ninguno"}</dd></div>
              </dl>
            )}
            {ok && (
              <button type="button" onClick={() => alUsarEnConsulta({ origen: "camara", hechos: resultado.hechos, partes: ["hojas"] })}
                className="mt-6 rounded-full bg-pulpa px-6 py-3 font-bold text-tinta transition hover:brightness-110">
                Usar en la consulta
              </button>
            )}
            <p className="mt-5 text-sm text-white/70">{resultado.aviso}</p>
          </>
        )}
      </aside>
    </div>
  );
}
