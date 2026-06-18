import { ESTADO_CLIENTE_LABELS, ESTADO_CLIENTE_STYLES } from '../../models/prestamo'

export function EtiquetaEstadoCliente({ estado }) {
  const estilo = ESTADO_CLIENTE_STYLES[estado]
  const label = ESTADO_CLIENTE_LABELS[estado]

  if (!estilo) return null

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${estilo.bg} ${estilo.text}`}
    >
      {label}
    </span>
  )
}
