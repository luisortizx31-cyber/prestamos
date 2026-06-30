import { collection, doc, getDocs, query, updateDoc, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { ESTADO_CLIENTE, ESTADO_CUOTA } from '../models/prestamo'

// Umbrales del negocio: cantidad de cuotas vencidas SIN PAGAR que
// determinan cada etiqueta. Ajustables aqui sin tocar el resto del
// codigo si el cliente quiere cambiar el criterio mas adelante.
const UMBRAL_CON_RETRASOS = 1 // 1-2 cuotas vencidas
const UMBRAL_MOROSO = 3 // 3+ cuotas vencidas

/**
 * Recorre TODOS los prestamos de un cliente y cuenta cuantas cuotas
 * estan vencidas (fecha de vencimiento ya pasada) y siguen pendientes.
 * Con ese conteo decide la etiqueta y la guarda en /clientes/{clienteId}.
 *
 * No usa Cloud Functions ni triggers automaticos (recordemos que el
 * proyecto corre en plan Spark): se llama explicitamente despues de
 * cada pago, y tambien al abrir el perfil del cliente, para que la
 * etiqueta nunca quede desactualizada por mucho tiempo.
 *
 * @param {string} clienteId
 * @param {string} [comisionistaId]  IMPORTANTE: cuando quien llama es
 *   un comisionista (no el Maestro), este parametro es obligatorio en
 *   la practica. La regla de seguridad de /cuotas para comisionista
 *   exige resource.data.comisionistaId == uid, y Firestore necesita
 *   el where() en la propia consulta para autorizar el list() — sin
 *   el, rechaza la consulta COMPLETA con "permission denied" (mismo
 *   patron que cuotasService.js). El Maestro no lo necesita: su rama
 *   de la regla no depende de ningun campo del documento.
 */
export async function recalcularEstadoCliente(clienteId, comisionistaId) {
  if (!clienteId) return null

  const prestamosSnap = await getDocs(
    query(collection(db, 'prestamos'), where('clienteId', '==', clienteId))
  )

  const ahora = new Date()
  let cuotasVencidasSinPagar = 0

  await Promise.all(
    prestamosSnap.docs.map(async (prestamoDoc) => {
      const cuotasRef = collection(db, 'prestamos', prestamoDoc.id, 'cuotas')
      const cuotasSnap = await getDocs(
        comisionistaId
          ? query(cuotasRef, where('comisionistaId', '==', comisionistaId))
          : cuotasRef
      )
      cuotasSnap.docs.forEach((cuotaDoc) => {
        const cuota = cuotaDoc.data()
        if (cuota.estado !== ESTADO_CUOTA.PENDIENTE) return

        const fechaVencimiento = cuota.fechaVencimiento?.toDate
          ? cuota.fechaVencimiento.toDate()
          : new Date(cuota.fechaVencimiento)

        if (fechaVencimiento < ahora) {
          cuotasVencidasSinPagar += 1
        }
      })
    })
  )

  let nuevoEstado = ESTADO_CLIENTE.BUEN_PAGADOR
  if (cuotasVencidasSinPagar >= UMBRAL_MOROSO) {
    nuevoEstado = ESTADO_CLIENTE.MOROSO
  } else if (cuotasVencidasSinPagar >= UMBRAL_CON_RETRASOS) {
    nuevoEstado = ESTADO_CLIENTE.CON_RETRASOS
  }

  await updateDoc(doc(db, 'clientes', clienteId), {
    estado: nuevoEstado,
    cuotasVencidas: cuotasVencidasSinPagar,
    estadoActualizadoEn: serverTimestamp(),
  })

  return nuevoEstado
}
