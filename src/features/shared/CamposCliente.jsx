// Campos de formulario compartidos entre RegistroCliente.jsx y
// EditarCliente.jsx, para no duplicar la logica de camara/galeria en
// dos lugares.

export function Campo({ label, value, onChange, required = true }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-ink">{label}</label>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus-visible:border-brand"
      />
    </div>
  )
}

// Dos botones en vez de un solo selector: en varios celulares (sobre
// todo con la app instalada como PWA) el selector nativo de un solo
// <input type="file"> sin "capture" no ofrece la opcion de camara, solo
// galeria — con "capture" en un input aparte, ese SI abre la camara
// directo, y el otro input (sin capture) mantiene la opcion de elegir
// una foto ya existente.
export function CampoFoto({ label, foto, cargando, onSeleccionar }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      <div className="mt-1 flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-paper text-center">
        {foto ? (
          <img src={foto.previewUrl} alt={label} className="h-full w-full object-cover" />
        ) : cargando ? (
          <span className="text-xs text-ink-soft">Comprimiendo…</span>
        ) : (
          <span className="px-2 text-xs text-ink-soft">Elegí una opción abajo</span>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-surface py-1.5 text-[11px] font-medium text-ink active:scale-95 transition-transform">
          📷 Cámara
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onSeleccionar(e.target.files?.[0])}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-surface py-1.5 text-[11px] font-medium text-ink active:scale-95 transition-transform">
          🖼️ Galería
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onSeleccionar(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  )
}
