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
export const ESTADO_CLIENTE_STYLES = {
  [ESTADO_CLIENTE.BUEN_PAGADOR]: {
    bg: 'bg-success-soft',
    text: 'text-success',
  },
  [ESTADO_CLIENTE.CON_RETRASOS]: {
    bg: 'bg-warning-soft',
    text: 'text-warning',
  },
  [ESTADO_CLIENTE.MOROSO]: {
    bg: 'bg-danger-soft',
    text: 'text-danger',
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
