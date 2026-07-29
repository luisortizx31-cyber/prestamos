import { doc, getDoc, runTransaction, writeBatch, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { ESTADO_CUOTA } from '../models/prestamo'
import { recalcularEstadoCliente } from './clienteEstadoService'
import { calcularComisionComisionista, calcularCortePago } from './comisionService'
import { contarPrestamosCompletadosDeCliente } from './prestamosService'

// Tolerancia por redondeo de decimales al comparar el monto acumulado
// contra el monto total de la cuota.
const TOLERANCIA_DECIMAL = 0.01

/**
 * Aprueba UNA cuota que estaba "por_verificar": confirma que el dinero
 * efectivamente llego a caja. Recien aqui se incrementa cuotasPagadas
 * del prestamo — antes de esto, el dinero esta "en la calle", todavia
 * no confirmado por el Maestro.
 *
 * El abono verificado (cuota.montoAbono) puede ser PARCIAL — si sumado
 * a lo que ya se habia abonado antes (cuota.montoPagado) todavia no
 * cubre el monto total de la cuota, esta NO pasa a "pagado": vuelve a
 * "pendiente" con el saldo actualizado, para que el cliente pague la
 * diferencia despues (al dia siguiente, entre semana, etc.) sin que
 * cuente como mora (ver clienteEstadoService.js).
 *
 * Si esta aprobacion COMPLETA la cuota Y con eso se completa el
 * prestamo (todas las cuotas pagadas), tambien se contabiliza
 * automaticamente la comision del comisionista (un porcentaje del
 * capital segun cuantos prestamos de este cliente ya completo antes,
 * ver comisionService.js) y el corte de pago correspondiente.
 */
export async function aprobarCuota({ prestamoId, cuotaId, clienteId }) {
  const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)
  const prestamoRef = doc(db, 'prestamos', prestamoId)

  await runTransaction(db, async (transaction) => {
    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) throw new Error('La cuota no existe.')
    const datosCuota = cuotaSnap.data()
    if (datosCuota.estado !== ESTADO_CUOTA.POR_VERIFICAR) {
      throw new Error('Esta cuota no esta pendiente de verificacion.')
    }

    const montoAbono = datosCuota.montoAbono ?? datosCuota.monto
    const montoPagadoNuevo = (datosCuota.montoPagado || 0) + montoAbono
    const cuotaQuedaCompleta = montoPagadoNuevo >= datosCuota.monto - TOLERANCIA_DECIMAL

    if (!cuotaQuedaCompleta) {
      // Abono parcial confirmado: la cuota vuelve a "pendiente" (no
      // "moroso" ni nada raro) mostrando el saldo restante, en vez de
      // quedar marcada como cobrada.
      transaction.update(cuotaRef, {
        estado: ESTADO_CUOTA.PENDIENTE,
        montoPagado: montoPagadoNuevo,
        montoAbono: null,
        metodoPago: null,
        codigoYape: null,
        montoEfectivo: null,
        fechaPago: null,
        fechaUltimoAbono: serverTimestamp(),
      })
      return
    }

    const prestamoSnap = await transaction.get(prestamoRef)
    const datosPrestamo = prestamoSnap.data() || {}
    const cuotasPagadasAntes = datosPrestamo.cuotasPagadas || 0
    const totalCuotas = datosPrestamo.totalCuotas || 0
    const seCompletaPrestamo = totalCuotas > 0 && cuotasPagadasAntes + 1 === totalCuotas

    transaction.update(cuotaRef, {
      estado: ESTADO_CUOTA.PAGADO,
      montoPagado: datosCuota.monto,
      montoAbono: null,
      fechaAprobacion: serverTimestamp(),
    })

    const actualizacionPrestamo = { cuotasPagadas: increment(1) }

    // Comision del comisionista: solo se contabiliza una vez, justo
    // cuando la ULTIMA cuota queda aprobada. El porcentaje depende de
    // cuantos prestamos de ESTE cliente ya se completaron antes (ver
    // calcularComisionComisionista en comisionService.js).
    if (seCompletaPrestamo && !datosPrestamo.comisionGanada) {
      const numeroPrestamoDelCliente = (await contarPrestamosCompletadosDeCliente(clienteId)) + 1
      const ahora = new Date()
      const corte = calcularCortePago(ahora)
      actualizacionPrestamo.comisionGanada = calcularComisionComisionista(
        datosPrestamo.montoPrestado || 0,
        numeroPrestamoDelCliente
      )
      actualizacionPrestamo.fechaCompletado = serverTimestamp()
      actualizacionPrestamo.cortePago = corte.corte
      actualizacionPrestamo.fechaPagoComision = corte.fechaPago
    }

    transaction.update(prestamoRef, actualizacionPrestamo)
  })

  try {
    await recalcularEstadoCliente(clienteId)
  } catch (err) {
    console.error('[aprobarCuota] No se pudo recalcular estado:', err)
  }
}

/**
 * Rechaza una cuota "por_verificar" (ej. el codigo Yape no coincide con
 * el monto, o el comisionista se equivoco de cuota). Vuelve la cuota a
 * "pendiente" para que se pueda corregir, y libera el codigo de Yape
 * registrado (si tenia uno) para que se pueda usar de nuevo si el
 * codigo en si era valido.
 */
export async function rechazarCuota({ prestamoId, cuotaId, motivo }) {
  const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)

  await runTransaction(db, async (transaction) => {
    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) throw new Error('La cuota no existe.')
    const datosActuales = cuotaSnap.data()
    if (datosActuales.estado !== ESTADO_CUOTA.POR_VERIFICAR) {
      throw new Error('Esta cuota no esta pendiente de verificacion.')
    }

    transaction.update(cuotaRef, {
      estado: ESTADO_CUOTA.PENDIENTE,
      metodoPago: null,
      codigoYape: null,
      montoEfectivo: null,
      montoAbono: null,
      fechaPago: null,
      motivoRechazo: motivo || 'No especificado',
      fechaRechazo: serverTimestamp(),
    })

    if (datosActuales.codigoYape) {
      const yapeRef = doc(db, 'codigos_yape_registrados', datosActuales.codigoYape)
      transaction.delete(yapeRef)
    }
  })
}

/**
 * Liquidacion parcial: aprueba VARIAS cuotas "por_verificar" de una
 * sola vez. Caso de uso tipico: el comisionista rinde cuentas de la
 * semana (4 clientes), 3 pagaron correctamente y 1 no — el Maestro
 * selecciona esas 3 y las aprueba juntas; la cuarta se deja pendiente o
 * se rechaza por separado con rechazarCuota().
 *
 * Tambien contabiliza la comision del comisionista para cualquier
 * prestamo que esta aprobacion en lote termine de completar.
 *
 * Nota de diseño: a diferencia de aprobarCuota() (que usa una
 * transaccion con lectura previa), aqui usamos un batch simple. Es un
 * trade-off aceptado: esta es una accion exclusiva del Maestro desde
 * una pantalla controlada (no hay comisionistas concurrentes
 * escribiendo sobre las mismas cuotas en este punto del flujo), asi que
 * el riesgo de condicion de carrera es minimo y no justifica la
 * complejidad de N transacciones individuales. Si necesitamos leer cada
 * cuota antes de escribir (a diferencia de la version anterior) es para
 * saber si su abono es parcial: si no cubre el saldo completo, esa
 * cuota en particular no pasa a "pagado" ni cuenta para completar el
 * prestamo (ver aprobarCuota(), misma logica).
 *
 * @param {Array<{prestamoId: string, cuotaId: string, clienteId: string}>} items
 */
export async function aprobarCuotasEnLote(items) {
  if (!items.length) return

  // Pre-cargamos el estado actual de cada prestamo unico involucrado,
  // para saber si esta aprobacion en lote lo completa y hay que
  // contabilizar la comision.
  const prestamoIdsUnicos = [...new Set(items.map((i) => i.prestamoId))]
  const datosPrestamos = {}
  await Promise.all(
    prestamoIdsUnicos.map(async (id) => {
      const snap = await getDoc(doc(db, 'prestamos', id))
      if (snap.exists()) datosPrestamos[id] = snap.data()
    })
  )

  // Y el estado actual de cada cuota, para saber su abono (montoAbono)
  // y cuanto llevaba pagado antes (montoPagado) — necesario para decidir
  // si este abono la completa o la deja parcial.
  const datosCuotasPorId = {}
  await Promise.all(
    items.map(async ({ prestamoId, cuotaId }) => {
      const snap = await getDoc(doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId))
      if (snap.exists()) datosCuotasPorId[cuotaId] = snap.data()
    })
  )

  const batch = writeBatch(db)
  const clientesAfectados = new Set()
  const cuotasCompletadasPorPrestamo = {}

  items.forEach(({ prestamoId, cuotaId, clienteId }) => {
    clientesAfectados.add(clienteId)
    const datosCuota = datosCuotasPorId[cuotaId]
    if (!datosCuota) return

    const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)
    const montoAbono = datosCuota.montoAbono ?? datosCuota.monto
    const montoPagadoNuevo = (datosCuota.montoPagado || 0) + montoAbono
    const cuotaQuedaCompleta = montoPagadoNuevo >= datosCuota.monto - TOLERANCIA_DECIMAL

    if (!cuotaQuedaCompleta) {
      batch.update(cuotaRef, {
        estado: ESTADO_CUOTA.PENDIENTE,
        montoPagado: montoPagadoNuevo,
        montoAbono: null,
        metodoPago: null,
        codigoYape: null,
        montoEfectivo: null,
        fechaPago: null,
        fechaUltimoAbono: serverTimestamp(),
      })
      return
    }

    batch.update(cuotaRef, {
      estado: ESTADO_CUOTA.PAGADO,
      montoPagado: datosCuota.monto,
      montoAbono: null,
      fechaAprobacion: serverTimestamp(),
    })
    batch.update(doc(db, 'prestamos', prestamoId), {
      cuotasPagadas: increment(1),
    })
    cuotasCompletadasPorPrestamo[prestamoId] = (cuotasCompletadasPorPrestamo[prestamoId] || 0) + 1
  })

  // Comision: revisamos cada prestamo unico una sola vez (no por cada
  // cuota), y solo si las cuotas que SI quedaron completas en este lote
  // (no las parciales) lo dejan 100% completo. El porcentaje depende de
  // cuantos prestamos de ESE cliente ya se completaron antes (ver
  // comisionService.js) - se cuenta antes del lote y se va incrementando
  // a mano por si dos prestamos del MISMO cliente se completan juntos
  // en esta misma aprobacion.
  const prestamosQueCompletan = Object.keys(cuotasCompletadasPorPrestamo).filter((prestamoId) => {
    const datos = datosPrestamos[prestamoId]
    if (!datos || datos.comisionGanada) return false
    const cuotasPagadasAntes = datos.cuotasPagadas || 0
    const totalCuotas = datos.totalCuotas || 0
    const cuotasEnEsteLote = cuotasCompletadasPorPrestamo[prestamoId] || 0
    return totalCuotas > 0 && cuotasPagadasAntes + cuotasEnEsteLote === totalCuotas
  })

  const clientesQueCompletan = [
    ...new Set(prestamosQueCompletan.map((id) => datosPrestamos[id].clienteId)),
  ]
  const contadoresPorCliente = {}
  await Promise.all(
    clientesQueCompletan.map(async (clienteId) => {
      contadoresPorCliente[clienteId] = await contarPrestamosCompletadosDeCliente(clienteId)
    })
  )

  prestamosQueCompletan.forEach((prestamoId) => {
    const datos = datosPrestamos[prestamoId]
    contadoresPorCliente[datos.clienteId] += 1
    const ahora = new Date()
    const corte = calcularCortePago(ahora)
    batch.update(doc(db, 'prestamos', prestamoId), {
      comisionGanada: calcularComisionComisionista(
        datos.montoPrestado || 0,
        contadoresPorCliente[datos.clienteId]
      ),
      fechaCompletado: serverTimestamp(),
      cortePago: corte.corte,
      fechaPagoComision: corte.fechaPago,
    })
  })

  await batch.commit()

  await Promise.all(
    [...clientesAfectados].map((clienteId) =>
      recalcularEstadoCliente(clienteId).catch((err) =>
        console.error('[aprobarCuotasEnLote] No se pudo recalcular estado:', err)
      )
    )
  )
}
