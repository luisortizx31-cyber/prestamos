// Reglas de comision del comisionista (Prestamos Jairo):
// - Cuando un prestamo queda 100% pagado (todas las cuotas aprobadas
//   por el Maestro), el comisionista gana un porcentaje fijo del monto
//   PRESTADO (capital, no del interes), sin importar la tasa de
//   interes pactada con el cliente.
//   Ejemplo: prestamo S/1000 al 20% de interes (S/200) -> al terminar
//   de pagarse, el comisionista gana 5% de 1000 = S/50.
const PORCENTAJE_COMISION_COMISIONISTA = 5

export function calcularComisionComisionista(montoPrestado) {
  return Math.round(montoPrestado * (PORCENTAJE_COMISION_COMISIONISTA / 100) * 100) / 100
}

// Cortes de pago a comisionistas (regla fija del negocio):
// - Corte 1: si la deuda de un cliente se completa entre el 1 y el 15
//   del mes, se le deposita al comisionista el dia 16 del MISMO mes.
// - Corte 2: si se completa entre el 16 y el ultimo dia del mes, se le
//   deposita el dia 1 del mes SIGUIENTE.
export function calcularCortePago(fechaCompletado) {
  const fecha = new Date(fechaCompletado)
  const dia = fecha.getDate()
  const anio = fecha.getFullYear()
  const mes = fecha.getMonth() // 0-indexado

  if (dia <= 15) {
    return {
      corte: 1,
      fechaPago: new Date(anio, mes, 16),
    }
  }
  return {
    corte: 2,
    fechaPago: new Date(anio, mes + 1, 1),
  }
}

export function etiquetaCorte(corte) {
  return corte === 1 ? '1er corte (se paga el 16)' : '2do corte (se paga el 1ro del sig. mes)'
}
