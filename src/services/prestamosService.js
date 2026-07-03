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
 * @param {number} [params.montoEntregadoNuevo]    solo en renovaciones:
 *                  dinero nuevo entregado al cliente (sin contar la deuda
 *                  anterior consolidada). Es solo trazabilidad/auditoria
 *                  — montoPrestado YA viene con la suma hecha.
 * @param {number} [params.saldoConsolidadoAnterior] solo en renovaciones:
 *                  saldo pendiente del prestamo anterior que se sumo a
 *                  este. Trazabilidad/auditoria.
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
    montoEntregadoNuevo,
    saldoConsolidadoAnterior,
    autoAprobar,
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
    montoEntregadoNuevo: montoEntregadoNuevo ?? null,
    saldoConsolidadoAnterior: saldoConsolidadoAnterior ?? null,
    // Solicitud de credito: el comisionista NO puede cobrar ninguna
    // cuota hasta que el Maestro apruebe (ver Tab "Solicitudes de
    // Credito" / solicitudesCreditoService.js). Se aplica tanto en la
    // UI como en las Security Rules.
    //
    // autoAprobar: cuando el propio Maestro registra el prestamo desde
    // "Mi Cartera" (actuando como su propio comisionista), no tiene
    // sentido que se apruebe a si mismo — queda aprobado de una vez.
    estadoSolicitud: autoAprobar ? ESTADO_SOLICITUD.APROBADO : ESTADO_SOLICITUD.PENDIENTE,
    ...(autoAprobar ? { fechaAprobacionCredito: serverTimestamp() } : {}),
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

/**
 * Reemplaza las condiciones y el cronograma de un préstamo YA EXISTENTE.
 * Solo se usa para editar una solicitud mientras sigue "pendiente" (ver
 * RegistroPrestamo.jsx, modo edicion) — en ese estado ninguna cuota
 * pudo haberse cobrado todavia (creditoAprobado() lo bloquea en las
 * Security Rules), asi que borrar y regenerar todas las cuotas es
 * seguro y no pierde ningun pago real.
 *
 * @param {string} prestamoId
 * @param {object} params  mismos campos que crearPrestamoConCronograma,
 *                 sin los campos de renovacion (un prestamo editado no
 *                 cambia de comisionista/cliente ni su origen).
 */
export async function actualizarPrestamoConCronograma(prestamoId, params) {
  const {
    clienteId,
    comisionistaId,
    montoPrestado,
    tasaInteres,
    tipoCuota,
    numeroCuotas,
    fechaInicio,
    fechaEspecifica,
  } = params

  const montos = calcularMontos(montoPrestado, tasaInteres)
  const cronograma = generarCronograma({
    montoTotalAPagar: montos.montoTotalAPagar,
    montoSeguro: montos.montoSeguro,
    tipoCuota,
    numeroCuotas,
    fechaInicio,
    fechaEspecifica,
  })

  const prestamoRef = doc(db, 'prestamos', prestamoId)
  const cuotasRef = collection(prestamoRef, 'cuotas')
  const cuotasExistentes = await getDocs(cuotasRef)

  const batch = writeBatch(db)

  batch.update(prestamoRef, {
    tasaInteres,
    tipoCuota,
    fechaInicio,
    ...montos,
    totalCuotas: cronograma.length,
  })

  cuotasExistentes.docs.forEach((d) => batch.delete(d.ref))

  cronograma.forEach((cuota) => {
    const cuotaRef = doc(cuotasRef)
    batch.set(cuotaRef, {
      ...cuota,
      comisionistaId,
      clienteId,
      prestamoId,
    })
  })

  await batch.commit()
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

/**
 * Marca la comision (5% al comisionista) de un grupo de prestamos ya
 * completados como pagada — asi el Tab "Reportes y Caja" > Comision
 * puede dejar de mostrarla como pendiente. Se usa cuando el Maestro le
 * deposita/entrega el corte a un comisionista.
 */
export async function marcarComisionesComoPagadas(prestamoIds) {
  const batch = writeBatch(db)
  prestamoIds.forEach((id) => {
    batch.update(doc(db, 'prestamos', id), {
      comisionPagada: true,
      comisionPagadaEn: serverTimestamp(),
    })
  })
  await batch.commit()
}

/** Revierte marcarComisionesComoPagadas, por si el Maestro se equivoco. */
export async function deshacerPagoComision(prestamoIds) {
  const batch = writeBatch(db)
  prestamoIds.forEach((id) => {
    batch.update(doc(db, 'prestamos', id), {
      comisionPagada: false,
      comisionPagadaEn: null,
    })
  })
  await batch.commit()
}
