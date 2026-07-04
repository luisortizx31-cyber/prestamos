// Tipo de cuota del préstamo. Determina cómo se genera el cronograma
// (ver utils/calcularCronograma.js).
export const TIPO_CUOTA = {
  SEMANAL: 'semanal',
  QUINCENAL: 'quincenal',
  MENSUAL: 'mensual',
  FECHA_ESPECIFICA: 'fecha_especifica',
}

export const TIPO_CUOTA_LABELS = {
  [TIPO_CUOTA.SEMANAL]: 'Semanal',
  [TIPO_CUOTA.QUINCENAL]: 'Quincenal',
  [TIPO_CUOTA.MENSUAL]: 'Mensual',
  [TIPO_CUOTA.FECHA_ESPECIFICA]: 'Fecha específica',
}

// Estados estrictos del cliente (enum cerrado, no texto libre).
export const ESTADO_CLIENTE = {
  BUEN_PAGADOR: 'buen_pagador',
  CON_RETRASOS: 'con_retrasos',
  MOROSO: 'moroso',
}

export const ESTADO_CLIENTE_LABELS = {
  [ESTADO_CLIENTE.BUEN_PAGADOR]: 'Buen pagador',
  [ESTADO_CLIENTE.CON_RETRASOS]: 'Con retrasos',
  [ESTADO_CLIENTE.MOROSO]: 'Moroso',
}

// Mapa de color (tokens definidos en index.css como @theme) para la
// etiqueta visual. Los nombres `bg-success-soft`, `text-success`, etc.
// son utilidades de Tailwind generadas automáticamente a partir de las
// variables --color-* definidas en index.css.
// "border" se usa para pintar un borde/franja de color en las filas de
// listas de clientes (Tab Clientes, Mi Cartera, etc.) — asi se puede
// escanear el estado de un vistazo sin tener que leer la etiqueta.
export const ESTADO_CLIENTE_STYLES = {
  [ESTADO_CLIENTE.BUEN_PAGADOR]: {
    bg: 'bg-success-soft',
    text: 'text-success',
    border: 'border-l-success',
  },
  [ESTADO_CLIENTE.CON_RETRASOS]: {
    bg: 'bg-warning-soft',
    text: 'text-warning',
    border: 'border-l-warning',
  },
  [ESTADO_CLIENTE.MOROSO]: {
    bg: 'bg-danger-soft',
    text: 'text-danger',
    border: 'border-l-danger',
  },
}

// Estados de una cuota. El flujo es SIEMPRE en dos pasos:
// pendiente -> por_verificar (el comisionista registra el cobro en la
// calle) -> pagado (el Maestro confirma que el dinero llego a caja).
// El comisionista NUNCA puede pasar una cuota directo a "pagado" — eso
// se aplica tanto en la UI como en las Security Rules.
export const ESTADO_CUOTA = {
  PENDIENTE: 'pendiente',
  POR_VERIFICAR: 'por_verificar',
  PAGADO: 'pagado',
}

export const ESTADO_CUOTA_LABELS = {
  [ESTADO_CUOTA.PENDIENTE]: 'Pendiente',
  [ESTADO_CUOTA.POR_VERIFICAR]: 'Por verificar',
  [ESTADO_CUOTA.PAGADO]: 'Pagado',
}

export const ESTADO_CUOTA_STYLES = {
  [ESTADO_CUOTA.POR_VERIFICAR]: {
    bg: 'bg-gold-soft',
    text: 'text-gold',
  },
  [ESTADO_CUOTA.PAGADO]: {
    bg: 'bg-success-soft',
    text: 'text-success',
  },
}

export const METODO_PAGO = {
  YAPE: 'yape',
  EFECTIVO: 'efectivo',
}

// Estado de aprobacion del PRESTAMO (no de la cuota). El comisionista
// registra la solicitud con las condiciones del credito, pero NO puede
// soltar el dinero ni cobrar cuotas hasta que el Maestro la apruebe.
// Los prestamos creados ANTES de este flujo no tienen este campo
// (undefined) — se tratan como "aprobado" por compatibilidad, ya que
// ese dinero ya se habia desembolsado en la vida real.
export const ESTADO_SOLICITUD = {
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
}

export const ESTADO_SOLICITUD_LABELS = {
  [ESTADO_SOLICITUD.PENDIENTE]: 'Pendiente de aprobacion',
  [ESTADO_SOLICITUD.APROBADO]: 'Aprobado',
  [ESTADO_SOLICITUD.RECHAZADO]: 'Rechazado',
}

/**
 * Un prestamo se considera habilitado para desembolsar/cobrar si fue
 * aprobado explicitamente, O si no tiene el campo (prestamos antiguos,
 * de antes de este flujo, que ya estaban en curso en la vida real).
 */
export function solicitudEstaAprobada(prestamo) {
  if (!prestamo) return false
  return (
    prestamo.estadoSolicitud === ESTADO_SOLICITUD.APROBADO ||
    prestamo.estadoSolicitud === undefined ||
    prestamo.estadoSolicitud === null
  )
}
