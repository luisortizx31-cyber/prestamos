import { doc, getDoc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'

export class CodigoYapeDuplicadoError extends Error {
  constructor(codigoYape) {
    super(`El codigo de Yape "${codigoYape}" ya fue registrado anteriormente.`)
    this.name = 'CodigoYapeDuplicadoError'
    this.codigoYape = codigoYape
  }
}

export const METODO_PAGO = {
  YAPE: 'yape',
  EFECTIVO: 'efectivo',
}

// Verificacion rapida para feedback en el formulario (no es la garantia real)
export async function existeCodigoYape(codigoYape) {
  const ref = doc(db, 'codigos_yape_registrados', codigoYape.trim())
  const snap = await getDoc(ref)
  return snap.exists()
}

/**
 * Pago con Yape: atomico y con validacion anti-duplicado.
 */
export async function registrarPagoConValidacionYape({
  codigoYape,
  prestamoId,
  cuotaId,
  comisionistaId,
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
  })
}

/**
 * Pago en efectivo: no requiere codigo Yape ni transaccion especial,
 * solo marca la cuota como pagada con el metodo "efectivo".
 */
export async function registrarPagoEfectivo({
  prestamoId,
  cuotaId,
  comisionistaId,
  monto,
}) {
  const cuotaRef = doc(db, 'prestamos', prestamoId, 'cuotas', cuotaId)
  await updateDoc(cuotaRef, {
    estado: 'pagado',
    metodoPago: METODO_PAGO.EFECTIVO,
    codigoYape: null,
    montoEfectivo: monto,
    comisionistaId,
    fechaPago: serverTimestamp(),
  })
}
