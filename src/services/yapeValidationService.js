import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'

export class CodigoYapeDuplicadoError extends Error {
  constructor(codigoYape) {
    super(`El código de Yape "${codigoYape}" ya fue registrado anteriormente.`)
    this.name = 'CodigoYapeDuplicadoError'
    this.codigoYape = codigoYape
  }
}

/**
 * Chequeo RÁPIDO, no atómico — solo para feedback inmediato en el
 * formulario mientras el comisionista escribe el código (UX). NO debe
 * usarse como única validación antes de cobrar: dos comisionistas
 * podrían pasar este chequeo casi al mismo tiempo con el mismo código.
 * La garantía real está en `registrarPagoConValidacionYape`.
 */
export async function existeCodigoYape(codigoYape) {
  const ref = doc(db, 'codigos_yape_registrados', codigoYape.trim())
  const snap = await getDoc(ref)
  return snap.exists()
}

/**
 * Marca una cuota como pagada y registra el código de Yape de forma
 * ATÓMICA: ambas escrituras (la cuota y el código) ocurren dentro de
 * una misma transacción de Firestore.
 *
 * Por qué esto evita el fraude de duplicados con garantía real (no solo
 * "casi siempre"):
 *  - El ID del documento en `codigos_yape_registrados` ES el propio
 *    código de Yape, así que dos códigos iguales son, literalmente, el
 *    mismo documento.
 *  - `runTransaction` lee ese documento y, si en el momento de
 *    confirmar la escritura alguien más ya lo creó, Firestore reintenta
 *    la transacción automáticamente leyendo el estado más reciente. La
 *    segunda vez la lectura encontrará el documento ya existente y la
 *    función lanzará `CodigoYapeDuplicadoError` en vez de cobrar dos
 *    veces el mismo comprobante.
 *  - No hace falta Cloud Functions para esta garantía: la atomicidad la
 *    da el propio SDK de cliente de Firestore.
 *
 * @param {object} params
 * @param {string} params.codigoYape
 * @param {string} params.prestamoId
 * @param {string} params.cuotaId
 * @param {string} params.comisionistaId
 * @param {number} params.monto
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
    if (yapeSnap.exists()) {
      throw new CodigoYapeDuplicadoError(codigo)
    }

    const cuotaSnap = await transaction.get(cuotaRef)
    if (!cuotaSnap.exists()) {
      throw new Error(`La cuota ${cuotaId} no existe.`)
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
      codigoYape: codigo,
      fechaPago: serverTimestamp(),
    })
  })
}
