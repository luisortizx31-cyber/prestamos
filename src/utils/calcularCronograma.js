import { TIPO_CUOTA } from '../models/prestamo'

/**
 * Calcula el monto total a pagar (capital + interés) y separa el monto
 * de seguro de forma independiente, tal como exige el negocio: el
 * seguro NUNCA se mezcla dentro del monto del préstamo.
 *
 * @param {number} montoPrestado
 * @param {number} tasaInteres   porcentaje, ej. 10 => 10%
 * @param {number} porcentajeSeguro porcentaje, ej. 3 => 3%
 */
export function calcularMontos(montoPrestado, tasaInteres, porcentajeSeguro) {
  const montoInteres = round2(montoPrestado * (tasaInteres / 100))
  const montoSeguro = round2(montoPrestado * (porcentajeSeguro / 100))
  const montoTotalAPagar = round2(montoPrestado + montoInteres)

  return {
    montoPrestado: round2(montoPrestado),
    montoInteres,
    montoSeguro,
    montoTotalAPagar,
  }
}

/**
 * Genera el arreglo de cuotas (fecha de vencimiento + monto) según el
 * tipo de cuota elegido.
 *
 * @param {object} params
 * @param {number} params.montoTotalAPagar  resultado de calcularMontos()
 * @param {string} params.tipoCuota         uno de TIPO_CUOTA
 * @param {number} [params.numeroCuotas]    requerido si no es FECHA_ESPECIFICA
 * @param {Date}   params.fechaInicio       fecha del desembolso
 * @param {Date}   [params.fechaEspecifica] requerido si tipoCuota es FECHA_ESPECIFICA
 * @returns {Array<{numero: number, fechaVencimiento: Date, monto: number, estado: 'pendiente'}>}
 */
export function generarCronograma({
  montoTotalAPagar,
  tipoCuota,
  numeroCuotas,
  fechaInicio,
  fechaEspecifica,
}) {
  if (tipoCuota === TIPO_CUOTA.FECHA_ESPECIFICA) {
    if (!fechaEspecifica) {
      throw new Error('fechaEspecifica es obligatoria para este tipo de cuota')
    }
    return [
      {
        numero: 1,
        fechaVencimiento: new Date(fechaEspecifica),
        monto: round2(montoTotalAPagar),
        estado: 'pendiente',
      },
    ]
  }

  if (!numeroCuotas || numeroCuotas < 1) {
    throw new Error('numeroCuotas debe ser mayor a 0 para cuotas periódicas')
  }

  const diasEntreCuotas = {
    [TIPO_CUOTA.SEMANAL]: 7,
    [TIPO_CUOTA.QUINCENAL]: 15,
    [TIPO_CUOTA.MENSUAL]: 30,
  }[tipoCuota]

  if (!diasEntreCuotas) {
    throw new Error(`tipoCuota desconocido: ${tipoCuota}`)
  }

  const montoBase = Math.floor((montoTotalAPagar / numeroCuotas) * 100) / 100
  const cuotas = []
  let acumulado = 0

  for (let i = 1; i <= numeroCuotas; i++) {
    const fechaVencimiento = new Date(fechaInicio)
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasEntreCuotas * i)

    // La última cuota absorbe el residuo de redondeo para que la suma
    // exacta de cuotas siempre calce con montoTotalAPagar.
    const esUltima = i === numeroCuotas
    const monto = esUltima ? round2(montoTotalAPagar - acumulado) : montoBase
    acumulado = round2(acumulado + monto)

    cuotas.push({
      numero: i,
      fechaVencimiento,
      monto,
      estado: 'pendiente',
    })
  }

  return cuotas
}

function round2(value) {
  return Math.round(value * 100) / 100
}
