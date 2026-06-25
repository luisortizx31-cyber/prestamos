import {
  collection,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { calcularMontos, generarCronograma } from '../utils/calcularCronograma'
import { ESTADO_SOLICITUD } from '../models/prestamo'

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
 * @param {string} params.tipoCuota           ver TIPO_CUOTA
 * @param {number} [params.numeroCuotas]
 * @param {Date}   params.fechaInicio
 * @param {Date}   [params.fechaEspecifica]
 * @param {string} [params.prestamoOrigenId]  si este prestamo nace de
 *                  una renovacion, el id del prestamo anterior (trazabilidad)
 */
export async function crearPrestamoConCronograma(params) {
  const {
    clienteId,
    comisionistaId,
    montoPrestado,
    tasaInteres,
    tipoCuota,
    numeroCuotas,
    fechaInicio,
    fechaEspecifica,
    prestamoOrigenId,
  } = params

  // El seguro ya no se ingresa a mano: se calcula con la regla fija del
  // negocio (3% si el prestamo es menor a S/330, tarifa plana de S/10
  // si es mayor) dentro de calcularMontos().
  const montos = calcularMontos(montoPrestado, tasaInteres)
  const cronograma = generarCronograma({
    montoTotalAPagar: montos.montoTotalAPagar,
    montoSeguro: montos.montoSeguro,
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
    tipoCuota,
    fechaInicio,
    ...montos,
    totalCuotas: cronograma.length,
    cuotasPagadas: 0,
    prestamoOrigenId: prestamoOrigenId || null,
    // Solicitud de credito: el comisionista NO puede cobrar ninguna
    // cuota hasta que el Maestro apruebe (ver Tab "Solicitudes de
    // Credito" / solicitudesCreditoService.js). Se aplica tanto en la
    // UI como en las Security Rules.
    estadoSolicitud: ESTADO_SOLICITUD.PENDIENTE,
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
      clienteId,
      prestamoId: prestamoRef.id,
    })
  })

  await batch.commit()
  return prestamoRef.id
}

export async function obtenerPrestamo(prestamoId) {
  const snap = await getDoc(doc(db, 'prestamos', prestamoId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Marca un préstamo como renovado y lo enlaza con el préstamo nuevo
 * que lo reemplaza (para trazabilidad y para que
 * debeOfrecerRenovacion() no lo vuelva a ofrecer).
 */
export async function marcarPrestamoRenovado(prestamoOrigenId, prestamoNuevoId) {
  await updateDoc(doc(db, 'prestamos', prestamoOrigenId), {
    renovado: true,
    renovadoEn: serverTimestamp(),
    prestamoRenovacionId: prestamoNuevoId,
  })
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

/**
 * Lista TODOS los préstamos del sistema (uso exclusivo del Maestro:
 * Tab "Reportes y Caja" y Tab "Solicitudes de Crédito"). La regla de
 * seguridad de /prestamos ya autoriza esto vía esMaestro().
 */
export async function listarTodosLosPrestamos() {
  const snap = await getDocs(collection(db, 'prestamos'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
