import { doc, getDoc, runTransaction, writeBatch, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { ESTADO_CUOTA } from '../models/prestamo'
import { recalcularEstadoCliente } from './clienteEstadoService'
import { calcularComisionComisionista, calcularCortePago } from './comisionService'

/**
 * Aprueba UNA cuota que estaba "por_verificar": confirma que el dinero
 * efectivamente llego a caja. Recien aqui se incrementa cuotasPagadas
 * del prestamo — antes de esto, el dinero esta "en la calle", todavia
 * no confirmado por el Maestro.
 *
 * Si esta aprobacion COMPLETA el prestamo (todas las cuotas pagadas),
 * tambien se contabiliza automaticamente la comision del comisionista
 * (5% del capital) y el corte de pago correspondiente.
 */
export async function aprobarCuota({ prestamoId, cuotaId, clienteId }) {
  const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)
  const prestamoRef = doc(db, 'prestamos', prestamoId)

  await runTransaction(db, async (transaction) => {
    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) throw new Error('La cuota no existe.')
    if (cuotaSnap.data().estado !== ESTADO_CUOTA.POR_VERIFICAR) {
      throw new Error('Esta cuota no esta pendiente de verificacion.')
    }

    const prestamoSnap = await transaction.get(prestamoRef)
    const datosPrestamo = prestamoSnap.data() || {}
    const cuotasPagadasAntes = datosPrestamo.cuotasPagadas || 0
    const totalCuotas = datosPrestamo.totalCuotas || 0
    const seCompleta = totalCuotas > 0 && cuotasPagadasAntes + 1 === totalCuotas

    transaction.update(cuotaRef, {
      estado: ESTADO_CUOTA.PAGADO,
      fechaAprobacion: serverTimestamp(),
    })

    const actualizacionPrestamo = { cuotasPagadas: increment(1) }

    // Comision del comisionista: solo se contabiliza una vez, justo
    // cuando la ULTIMA cuota queda aprobada.
    if (seCompleta && !datosPrestamo.comisionGanada) {
      const ahora = new Date()
      const corte = calcularCortePago(ahora)
      actualizacionPrestamo.comisionGanada = calcularComisionComisionista(
        datosPrestamo.montoPrestado || 0
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
 * transaccion con lectura previa), aqui usamos un batch simple sin
 * verificar el estado actual de cada cuota antes de escribir. Es un
 * trade-off aceptado: esta es una accion exclusiva del Maestro desde
 * una pantalla controlada (no hay comisionistas concurrentes
 * escribiendo sobre las mismas cuotas en este punto del flujo), asi que
 * el riesgo de condicion de carrera es minimo y no justifica la
 * complejidad de N transacciones individuales.
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

  const cuotasPorPrestamoEnLote = {}
  items.forEach(({ prestamoId }) => {
    cuotasPorPrestamoEnLote[prestamoId] = (cuotasPorPrestamoEnLote[prestamoId] || 0) + 1
  })

  const batch = writeBatch(db)
  const clientesAfectados = new Set()

  items.forEach(({ prestamoId, cuotaId, clienteId }) => {
    const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)
    const prestamoRef = doc(db, 'prestamos', prestamoId)

    batch.update(cuotaRef, {
      estado: ESTADO_CUOTA.PAGADO,
      fechaAprobacion: serverTimestamp(),
    })
    batch.update(prestamoRef, {
      cuotasPagadas: increment(1),
    })
    clientesAfectados.add(clienteId)
  })

  // Comision: revisamos cada prestamo unico una sola vez (no por cada
  // cuota), y solo si esta aprobacion en lote lo deja 100% completo.
  prestamoIdsUnicos.forEach((prestamoId) => {
    const datos = datosPrestamos[prestamoId]
    if (!datos || datos.comisionGanada) return

    const cuotasPagadasAntes = datos.cuotasPagadas || 0
    const totalCuotas = datos.totalCuotas || 0
    const cuotasEnEsteLote = cuotasPorPrestamoEnLote[prestamoId] || 0
    const seCompleta = totalCuotas > 0 && cuotasPagadasAntes + cuotasEnEsteLote === totalCuotas

    if (seCompleta) {
      const ahora = new Date()
      const corte = calcularCortePago(ahora)
      batch.update(doc(db, 'prestamos', prestamoId), {
        comisionGanada: calcularComisionComisionista(datos.montoPrestado || 0),
        fechaCompletado: serverTimestamp(),
        cortePago: corte.corte,
        fechaPagoComision: corte.fechaPago,
      })
    }
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
