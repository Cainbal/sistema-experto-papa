import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { leerRed } from "./api.js";

export default function Qr({ alCerrar }) {
  const [red, setRed] = useState(null);
  const [imagen, setImagen] = useState(null);
  const [error, setError] = useState(null);
  const dialogo = useRef(null);

  useEffect(() => {
    dialogo.current?.showModal();
    leerRed()
      .then(async (r) => {
        setRed(r);
        setImagen(await QRCode.toDataURL(r.url, { margin: 1, width: 360, color: { dark: "#1c1230", light: "#ffffff" } }));
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <dialog ref={dialogo} onClose={alCerrar} onClick={(e) => { if (e.target === dialogo.current) dialogo.current.close(); }}
      className="m-auto w-[min(92vw,30rem)] rounded-3xl bg-[#2a1d45] p-0 text-white backdrop:bg-black/70">
      <div className="p-6">
        <h2 className="text-3xl font-bold">Ábrelo en el celular</h2>
        {error && <p className="mt-3">No se pudo leer la dirección del servidor: {error}</p>}
        {imagen && <img src={imagen} alt={`Código QR de ${red.url}`} className="mx-auto mt-5 w-64 rounded-xl" />}
        {red && <p className="mt-3 break-all text-center font-titulo text-xl font-bold text-pulpa">{red.url}</p>}
        {red?.es_local && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-base text-white/85">
            <li>El celular tiene que estar en la misma red WiFi que esta computadora (o en el hotspot de tu celular).</li>
            <li>El servidor debe haberse iniciado con <code>--host 0.0.0.0</code> (así lo hace <code>iniciar.bat</code>).</li>
            <li>Si no abre, permite Python en el firewall de Windows (ver el manual).</li>
          </ul>
        )}
        <form method="dialog" className="mt-6 text-right">
          <button className="rounded-full bg-pulpa px-6 py-2.5 font-bold text-tinta">Cerrar</button>
        </form>
      </div>
    </dialog>
  );
}
