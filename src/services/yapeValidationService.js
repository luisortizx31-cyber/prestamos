import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { recalcularEstadoCliente } from './clienteEstadoService'
import { METODO_PAGO, ESTADO_CUOTA } from '../models/prestamo'

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
 * IMPORTANTE - Flujo en dos pasos (conciliacion de caja):
 * Estas funciones las usa el COMISIONISTA desde la calle. NUNCA marcan
 * la cuota como "pagado" directamente — la dejan en "por_verificar".
 * Solo el Maestro, desde conciliacionService.js, puede confirmar que el
 * dinero llego a caja y mover la cuota a "pagado" (y ahi recien se
 * incrementa el contador cuotasPagadas del prestamo). Esto esta
 * reforzado tambien en las Security Rules, no solo aqui en el cliente.
 */

/**
 * Pago con Yape: atomico, con validacion anti-duplicado. Deja la cuota
 * en estado "por_verificar", a la espera de que el Maestro la apruebe.
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

  await runTransaction(db, async (transaction) => {
    const yapeSnap = await transaction.get(yapeRef)
    if (yapeSnap.exists()) throw new CodigoYapeDuplicadoError(codigo)

    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) throw new Error(`La cuota ${cuotaId} no existe.`)
    if (cuotaSnap.data().estado !== ESTADO_CUOTA.PENDIENTE) {
      throw new Error('Esta cuota ya tiene un cobro registrado.')
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
      estado: ESTADO_CUOTA.POR_VERIFICAR,
      metodoPago: METODO_PAGO.YAPE,
      codigoYape: codigo,
      fechaPago: serverTimestamp(),
    })
  })

  // Fuera de la transaccion: si falla, no revierte el registro del
  // cobro — la etiqueta del cliente se autocorrige en la proxima visita
  // a su perfil (ver DetalleCliente.jsx).
  try {
    await recalcularEstadoCliente(clienteId)
  } catch (err) {
    console.error('[registrarPagoConValidacionYape] No se pudo recalcular estado:', err)
  }
}

/**
 * Pago en efectivo: tambien transaccional. Igual que con Yape, deja la
 * cuota en "por_verificar" — el Maestro confirma cuando reciba el
 * efectivo en caja.
 */
export async function registrarPagoEfectivo({
  prestamoId,
  cuotaId,
  comisionistaId,
  clienteId,
  monto,
}) {
  const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)

  await runTransaction(db, async (transaction) => {
    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) throw new Error(`La cuota ${cuotaId} no existe.`)
    if (cuotaSnap.data().estado !== ESTADO_CUOTA.PENDIENTE) {
      throw new Error('Esta cuota ya tiene un cobro registrado.')
    }

    transaction.update(cuotaRef, {
      estado: ESTADO_CUOTA.POR_VERIFICAR,
      metodoPago: METODO_PAGO.EFECTIVO,
      codigoYape: null,
      montoEfectivo: monto,
      comisionistaId,
      fechaPago: serverTimestamp(),
    })
  })

  try {
    await recalcularEstadoCliente(clienteId)
  } catch (err) {
    console.error('[registrarPagoEfectivo] No se pudo recalcular estado:', err)
  }
}
