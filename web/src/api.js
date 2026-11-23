async function pedir(ruta, opciones) {
  const r = await fetch(ruta, opciones);
  if (!r.ok) {
    let detalle = "";
    try { detalle = (await r.json()).detail; } catch { /* la respuesta no era JSON */ }
    throw new Error(detalle ? String(detalle) : `El servidor respondió ${r.status} en ${ruta}`);
  }
  return r.json();
}

const JSON_POST = (cuerpo) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

export const cargarBase = () => pedir("/api/base");
export const consultar = (hechos, partes) => pedir("/api/consulta", JSON_POST({ hechos, partes }));
export const leerClima = ({ lat, lon, nombre } = {}) => {
  const p = new URLSearchParams();
  if (lat != null) p.set("lat", lat);
  if (lon != null) p.set("lon", lon);
  if (nombre) p.set("nombre", nombre);
  return pedir(`/api/clima?${p}`);
};
export const buscarLugar = (nombre) => pedir(`/api/clima/buscar?nombre=${encodeURIComponent(nombre)}`);
export const analizarFoto = (archivo) => {
  const datos = new FormData();
  datos.append("foto", archivo);
  return pedir("/api/camara", { method: "POST", body: datos });
};
export const leerRed = () => pedir("/api/red");
export const leerEvaluacion = () => pedir("/evaluacion.json");
