import {
  doc,
  getDoc,
  runTransaction,
  increment,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { recalcularEstadoCliente } from './clienteEstadoService'
import { METODO_PAGO } from '../models/prestamo'

export class CodigoYapeDuplicadoError extends Error {
  constructor(codigoYape) {
    super(`El codigo de Yape "${codigoYape}" ya fue registrado anteriormente.`)
    this.name = 'CodigoYapeDuplicadoError'
    this.codigoYape = codigoYape
  }
}

export { METODO_PAGO }

// Verificacion rapida para feedback en el formulario (no es la garantia real)
export async function existeCodigoYape(codigoYape) {
  const ref = doc(db, 'codigos_yape_registrados', codigoYape.trim())
  const snap = await getDoc(ref)
  return snap.exists()
}

/**
 * Pago con Yape: atomico, con validacion anti-duplicado, incrementa el
 * contador de cuotas pagadas del prestamo, y al final recalcula el
 * estado del cliente (buen pagador / con retrasos / moroso).
 */
export async function registrarPagoConValidacionYape({
  codigoYape,
  prestamoId,
  cuotaId,
  comisionistaId,
  clienteId,
  monto,
}) {
  const codigo = codigoYape.trim()
  const yapeRef = doc(db, 'codigos_yape_registrados', codigo)
  const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)
  const prestamoRef = doc(db, 'prestamos', prestamoId)

  await runTransaction(db, async (transaction) => {
    const yapeSnap = await transaction.get(yapeRef)
    if (yapeSnap.exists()) throw new CodigoYapeDuplicadoError(codigo)

    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) throw new Error(`La cuota ${cuotaId} no existe.`)
    if (cuotaSnap.data().estado === 'pagado') {
      // Evita doble conteo si el usuario llega a tocar "Confirmar" dos veces
      throw new Error('Esta cuota ya fue registrada como pagada.')
    }

    transaction.set(yapeRef, {
      codigoYape: codigo,
      prestamoId,
      cuotaId,
      comisionistaId,
      monto,
      fechaRegistro: serverTimestamp(),
    })

    transaction.update(cuotaRef, {
      estado: 'pagado',
      metodoPago: METODO_PAGO.YAPE,
      codigoYape: codigo,
      fechaPago: serverTimestamp(),
    })

    transaction.update(prestamoRef, {
      cuotasPagadas: increment(1),
    })
  })

  // Fuera de la transaccion: el pago ya quedo guardado, esto solo
  // actualiza la etiqueta visual del cliente. Si falla, no revierte el
  // pago — simplemente la etiqueta se actualizara la proxima vez que
  // alguien vea el perfil del cliente.
  try {
    await recalcularEstadoCliente(clienteId)
  } catch (err) {
    console.error('[registrarPagoConValidacionYape] No se pudo recalcular estado:', err)
  }
}

/**
 * Pago en efectivo: tambien transaccional (lee la cuota antes de
 * marcarla, para evitar doble conteo si se toca "Confirmar" dos veces),
 * incrementa cuotasPagadas y recalcula el estado del cliente.
 */
export async function registrarPagoEfectivo({
  prestamoId,
  cuotaId,
  comisionistaId,
  clienteId,
  monto,
}) {
  const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)
  const prestamoRef = doc(db, 'prestamos', prestamoId)

  await runTransaction(db, async (transaction) => {
    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) throw new Error(`La cuota ${cuotaId} no existe.`)
    if (cuotaSnap.data().estado === 'pagado') {
      throw new Error('Esta cuota ya fue registrada como pagada.')
    }

    transaction.update(cuotaRef, {
      estado: 'pagado',
      metodoPago: METODO_PAGO.EFECTIVO,
      codigoYape: null,
      montoEfectivo: monto,
      comisionistaId,
      fechaPago: serverTimestamp(),
    })

    transaction.update(prestamoRef, {
      cuotasPagadas: increment(1),
    })
  })

  try {
    await recalcularEstadoCliente(clienteId)
  } catch (err) {
    console.error('[registrarPagoEfectivo] No se pudo recalcular estado:', err)
  }
}
