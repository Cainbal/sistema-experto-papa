import { useCallback, useEffect, useState } from "react";
import { cargarBase } from "./api.js";
import Consulta from "./Consulta.jsx";
import Alerta from "./Alerta.jsx";
import Camara from "./Camara.jsx";
import Conocimiento from "./Conocimiento.jsx";
import Evaluacion from "./Evaluacion.jsx";
import Qr from "./Qr.jsx";

const SECCIONES = [["consulta", "Consulta"], ["alerta", "Alerta de rancha"], ["camara", "Cámara"],
  ["conocimiento", "Conocimiento"], ["evaluacion", "Evaluación"]];

function leerModo() {
  try { return localStorage.getItem("modo") === "tecnico" ? "tecnico" : "agricultor"; } catch { return "agricultor"; }
}

export default function App() {
  const [base, setBase] = useState(null);
  const [error, setError] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [vista, setVista] = useState("consulta");
  const [modo, setModo] = useState(leerModo);
  const [semilla, setSemilla] = useState(null);
  const [qr, setQr] = useState(false);

  useEffect(() => { cargarBase().then(setBase).catch((e) => setErrorCarga(e.message)); }, []);
  useEffect(() => { try { localStorage.setItem("modo", modo); } catch { /* sin almacenamiento */ } }, [modo]);
  useEffect(() => { window.scrollTo({ top: 0 }); setError(null); }, [vista]);

  const alError = useCallback((mensaje) => setError(mensaje), []);
  const usarEnConsulta = useCallback((datos) => { setSemilla(datos); setVista("consulta"); }, []);

  if (errorCarga) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-3xl font-bold">No se pudo conectar con el servidor</h1>
        <p className="mt-3">{errorCarga}. Inicia la API con <code>uvicorn api.main:app</code> (o con iniciar.bat) y recarga la página.</p>
      </main>
    );
  }
  if (!base) return <main className="p-8 text-xl">Cargando la base de conocimiento…</main>;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <p className="flex items-center gap-2 font-titulo text-xl font-bold">
          <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
            <ellipse cx="16" cy="17" rx="13" ry="10" fill="var(--color-pulpa)" stroke="#1c1230" strokeWidth="2" />
            <circle cx="11" cy="15" r="1.4" fill="#1c1230" /><circle cx="19" cy="20" r="1.4" fill="#1c1230" /><circle cx="21" cy="13" r="1.4" fill="#1c1230" />
          </svg>
          Sanidad de la papa
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-white/10 p-1" role="group" aria-label="Modo de uso">
            {[["agricultor", "Agricultor"], ["tecnico", "Técnico"]].map(([id, texto]) => (
              <button key={id} type="button" onClick={() => setModo(id)} aria-pressed={modo === id}
                className={`rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${modo === id ? "bg-lila text-tinta" : "text-white hover:bg-white/15"}`}>
                {texto}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setQr(true)} className="rounded-full bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/20">
            Abrir en el celular
          </button>
        </div>
        <nav className="flex w-full gap-1 overflow-x-auto rounded-full bg-white/10 p-1 sm:w-auto" aria-label="Secciones">
          {SECCIONES.map(([id, texto]) => (
            <button key={id} type="button" onClick={() => setVista(id)} aria-current={vista === id ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 font-bold transition-colors ${vista === id ? "bg-pulpa text-tinta" : "text-white hover:bg-white/15"}`}>
              {texto}
            </button>
          ))}
        </nav>
      </header>

      {error && <p role="alert" className="mb-4 rounded-lg bg-pulpa p-4 font-bold text-tinta">{error}</p>}

      <div hidden={vista !== "consulta"}>
        <Consulta base={base} modo={modo} semilla={semilla} alConsumirSemilla={() => setSemilla(null)} alError={alError} />
      </div>
      {vista === "alerta" && <Alerta base={base} alUsarEnConsulta={usarEnConsulta} alError={alError} />}
      {vista === "camara" && <Camara base={base} modo={modo} alUsarEnConsulta={usarEnConsulta} />}
      {vista === "conocimiento" && <Conocimiento base={base} />}
      {vista === "evaluacion" && <Evaluacion />}

      <footer className="mt-12 border-t border-white/15 pt-5 text-sm text-white/65">
        Sistema experto difuso · Sistemas Inteligentes, Ingeniería de Sistemas, UNHEVAL · Conocimiento: guía del CIP
        (Pérez y Forbes, 2011), entrevista a Crispín Reyes Jesús, agricultor de Huánuco, y modelo de Wallin (1962). Orienta; no reemplaza a un agrónomo.
        <br />Integrantes: Esther Jhadira León Flores, Cristina Reyes Lino y Jack Roller Torres Caldas.
      </footer>
      {qr && <Qr alCerrar={() => setQr(false)} />}
    </div>
  );
}
