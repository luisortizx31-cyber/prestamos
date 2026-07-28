// Reglas de comision del comisionista (Prestamos Jairo):
// - Cuando un prestamo queda 100% pagado (todas las cuotas aprobadas
//   por el Maestro), el comisionista gana un porcentaje del monto
//   PRESTADO (capital, no del interes), sin importar la tasa de
//   interes pactada con el cliente.
// - El porcentaje baja segun cuantos prestamos YA completo ese MISMO
//   cliente (no el comisionista en general, ni el total de prestamos
//   del comisionista) - el conteo es por cliente y arranca de nuevo en
//   0 con cada cliente nuevo:
//     - Prestamos 1ro al 3ro del cliente: 5%
//     - Prestamos 4to al 6to del cliente: 4%
//     - Prestamo 7mo del cliente en adelante: 3%
//   Ejemplo: el 2do prestamo completado de un cliente, por S/1000 al
//   20% de interes (S/200) -> al terminar de pagarse, el comisionista
//   gana 5% de 1000 = S/50. El 5to prestamo de ese mismo cliente
//   ganaria 4% en cambio.
const ESCALONES_COMISION_POR_CLIENTE = [
  { hasta: 3, porcentaje: 5 },
  { hasta: 6, porcentaje: 4 },
  { hasta: Infinity, porcentaje: 3 },
]

/**
 * @param {number} montoPrestado
 * @param {number} numeroPrestamoDelCliente  posicion de este prestamo
 *   entre los de ESTE cliente (1 = su primer prestamo completado, 2 = el
 *   segundo, etc.) - ver contarPrestamosCompletadosDeCliente() en
 *   prestamosService.js.
 */
export function calcularComisionComisionista(montoPrestado, numeroPrestamoDelCliente) {
  const escalon = ESCALONES_COMISION_POR_CLIENTE.find((e) => numeroPrestamoDelCliente <= e.hasta)
  return Math.round(montoPrestado * (escalon.porcentaje / 100) * 100) / 100
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
