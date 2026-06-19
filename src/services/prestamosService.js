import {
  collection,
  doc,
  writeBatch,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { calcularMontos, generarCronograma } from '../utils/calcularCronograma'

/**
 * Crea un préstamo y su cronograma de cuotas en una sola escritura por
 * lotes (batch). Un batch no es lo mismo que una transacción (no lee
 * datos para decidir), pero sí garantiza que todas las escrituras se
 * confirman juntas o ninguna lo hace — útil aquí porque un préstamo sin
 * sus cuotas generadas quedaría en un estado inconsistente.
 *
 * @param {object} params
 * @param {string} params.clienteId
 * @param {string} params.comisionistaId
 * @param {number} params.montoPrestado
 * @param {number} params.tasaInteres        porcentaje
 * @param {number} params.porcentajeSeguro    porcentaje
 * @param {string} params.tipoCuota           ver TIPO_CUOTA
 * @param {number} [params.numeroCuotas]
 * @param {Date}   params.fechaInicio
 * @param {Date}   [params.fechaEspecifica]
 */
export async function crearPrestamoConCronograma(params) {
  const {
    clienteId,
    comisionistaId,
    montoPrestado,
    tasaInteres,
    porcentajeSeguro,
    tipoCuota,
    numeroCuotas,
    fechaInicio,
    fechaEspecifica,
  } = params

  const montos = calcularMontos(montoPrestado, tasaInteres, porcentajeSeguro)
  const cronograma = generarCronograma({
    montoTotalAPagar: montos.montoTotalAPagar,
    tipoCuota,
    numeroCuotas,
    fechaInicio,
    fechaEspecifica,
  })

  const prestamoRef = doc(collection(db, 'prestamos'))
  const batch = writeBatch(db)

  batch.set(prestamoRef, {
    clienteId,
    comisionistaId,
    tasaInteres,
    porcentajeSeguro,
    tipoCuota,
    fechaInicio,
    ...montos,
    totalCuotas: cronograma.length,
    cuotasPagadas: 0,
    creadoEn: serverTimestamp(),
  })

  cronograma.forEach((cuota) => {
    const cuotaRef = doc(collection(prestamoRef, 'cuotas'))
    // comisionistaId se guarda en cada cuota para que la Security Rule
    // pueda validarlo con request.resource.data.comisionistaId sin tener
    // que hacer get() al documento padre. Esto es necesario porque en un
    // batch todas las escrituras ocurren al mismo tiempo: cuando Firestore
    // evalúa la regla de la cuota, el documento padre del préstamo todavía
    // no existe en la base de datos, así que un get() al padre devolvería
    // null y bloquearía la escritura aunque todo sea correcto.
    batch.set(cuotaRef, {
      ...cuota,
      comisionistaId,
      prestamoId: prestamoRef.id,
    })
  })

  await batch.commit()
  return prestamoRef.id
}

export async function listarPrestamosPorComisionista(comisionistaId) {
  const q = query(collection(db, 'prestamos'), where('comisionistaId', '==', comisionistaId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function listarPrestamosPorCliente(clienteId) {
  const q = query(collection(db, 'prestamos'), where('clienteId', '==', clienteId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
