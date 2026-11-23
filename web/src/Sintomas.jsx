import Planta from "./Planta.jsx";

// Galería: cada síntoma de la base de conocimiento con el dibujo que usa la planta.
const CON_DIBUJO = new Set(["c_templado_humedo", "c_clima_calido", "c_seco_sin_lluvias", "c_calor_lluvia_alternada", "c_suelo_muy_humedo", "c_insectos_vectores"]);
const SIN_DIBUJO = new Set(["p_rigidez"]);
// Cada dibujo se encuadra en la parte de la planta donde aparece el síntoma.
const ENCUADRE = { hojas: "24 0 312 250", tallos: "70 56 220 228", raices: "40 250 280 205", tuberculos: "10 262 340 198" };

export default function Sintomas({ base }) {
  const grupos = Object.entries({ ...base.partes, condiciones: "Clima y suelo" }).map(([parte, nombre]) => ({
    nombre,
    hechos: Object.values(base.hechos).filter((h) =>
      h.partes[0] === parte && !SIN_DIBUJO.has(h.id) &&
      (["sintoma", "signo", "dano"].includes(h.tipo) || CON_DIBUJO.has(h.id))),
  }));
  return (
    <section>
      <h2 className="text-2xl font-bold">Cómo se dibuja cada síntoma</h2>
      <p className="mt-2 max-w-[70ch] text-white/80">
        Son esquemas propios para orientar durante la consulta. Para identificar en campo, usa las
        fotos de la guía del CIP.
      </p>
      {grupos.map((g) => (
        <div key={g.nombre}>
          <h3 className="mt-8 text-2xl font-bold text-pulpa">{g.nombre}</h3>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {g.hechos.map((h) => (
              <li key={h.id}>
                <Planta hechos={{ [h.id]: 1 }} quieta encuadre={ENCUADRE[h.partes[0]]} />
                <p className="mt-2 font-bold">{h.corto}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
