import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../config/firebase'
import { listarTodosLosPrestamos } from '../../../services/prestamosService'
import {
  aprobarSolicitudCredito,
  rechazarSolicitudCredito,
} from '../../../services/solicitudesCreditoService'
import { ESTADO_SOLICITUD, TIPO_CUOTA_LABELS } from '../../../models/prestamo'
import { BotonExportarExcel } from '../../shared/BotonExportarExcel'

export default function TabSolicitudesCredito() {
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [rechazando, setRechazando] = useState(null)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const todos = await listarTodosLosPrestamos()
      const pendientes = todos.filter((p) => p.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE)

      const clienteIds = [...new Set(pendientes.map((p) => p.clienteId).filter(Boolean))]
      const comisionistaIds = [...new Set(pendientes.map((p) => p.comisionistaId).filter(Boolean))]

      const [nombresCliente, nombresComisionista] = await Promise.all([
        cargarNombres('clientes', clienteIds),
        cargarNombres('usuarios', comisionistaIds),
      ])

      const conNombres = pendientes
        .map((p) => ({
          ...p,
          clienteNombre: nombresCliente[p.clienteId] || 'Cliente',
          comisionistaNombre: nombresComisionista[p.comisionistaId] || 'Comisionista',
        }))
        .sort((a, b) => {
          const fa = a.creadoEn?.toDate ? a.creadoEn.toDate() : new Date(a.creadoEn || 0)
          const fb = b.creadoEn?.toDate ? b.creadoEn.toDate() : new Date(b.creadoEn || 0)
          return fa - fb
        })

      setSolicitudes(conNombres)
    } catch (err) {
      console.error('[TabSolicitudesCredito]', err)
      setErrorCarga(
        err.code === 'permission-denied'
          ? 'No tienes permiso para ver las solicitudes.'
          : 'Ocurrio un error al cargar las solicitudes.'
      )
    } finally {
      setCargando(false)
    }
  }

  async function cargarNombres(coleccion, ids) {
    const mapa = {}
    await Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, coleccion, id))
        if (snap.exists()) mapa[id] = snap.data().nombre
      })
    )
    return mapa
  }

  async function handleAprobar(solicitud) {
    setProcesando(true)
    try {
      await aprobarSolicitudCredito(solicitud.id)
      await cargar()
    } catch (err) {
      console.error('[TabSolicitudesCredito] aprobar', err)
    } finally {
      setProcesando(false)
    }
  }

  async function confirmarRechazo(solicitud) {
    setProcesando(true)
    try {
      await rechazarSolicitudCredito(solicitud.id, motivo.trim())
      setRechazando(null)
      setMotivo('')
      await cargar()
    } catch (err) {
      console.error('[TabSolicitudesCredito] rechazar', err)
    } finally {
      setProcesando(false)
    }
  }

  if (cargando) {
    return <p className="text-center text-ink-soft py-10">Cargando...</p>
  }

  if (errorCarga) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger-soft p-5 text-center">
        <p className="text-danger font-medium">{errorCarga}</p>
      </div>
    )
  }

  if (solicitudes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center">
        <p className="text-2xl mb-2">📭</p>
        <p className="text-ink font-medium">No hay solicitudes de credito pendientes</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-gold p-4 text-white">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Por aprobar</p>
          <p className="text-2xl font-bold">
            {solicitudes.length} solicitud{solicitudes.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <span className="text-3xl">📝</span>
      </div>

      <div className="flex justify-end mb-3">
        <BotonExportarExcel
          nombreArchivo="solicitudes_credito_pendientes"
          nombreHoja="Solicitudes"
          label="Excel"
          columnas={[
            { header: 'Cliente', key: 'clienteNombre', width: 25 },
            { header: 'Comisionista', key: 'comisionistaNombre', width: 25 },
            { header: 'Monto (S/)', key: 'montoPrestado', width: 14 },
            { header: 'Interes %', key: 'tasaInteres', width: 12 },
            { header: 'Tipo de cuota', key: 'tipoCuotaTexto', width: 16 },
            { header: 'Cuotas', key: 'totalCuotas', width: 10 },
          ]}
          filas={solicitudes.map((s) => ({
            ...s,
            tipoCuotaTexto: TIPO_CUOTA_LABELS[s.tipoCuota] || s.tipoCuota,
          }))}
        />
      </div>
      <ul className="space-y-3">
      {solicitudes.map((s) => (
        <li key={s.id} className="rounded-2xl border-2 border-gold bg-gold-soft p-4 shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-semibold text-ink flex items-center gap-1.5">
                <span>⏳</span> {s.clienteNombre}
              </p>
              <p className="text-xs text-ink-soft">
                Comisionista: {s.comisionistaNombre}
              </p>
            </div>
            <p className="money text-xl font-bold text-gold">
              S/ {(s.montoPrestado || 0).toFixed(2)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft mb-3">
            <p>Interes: {s.tasaInteres}%</p>
            <p>Seguro: S/ {(s.montoSeguro || 0).toFixed(2)}</p>
            <p>{TIPO_CUOTA_LABELS[s.tipoCuota]}</p>
            <p>{s.totalCuotas} cuota{s.totalCuotas !== 1 ? 's' : ''}</p>
          </div>

          {rechazando === s.id ? (
            <div className="space-y-2">
              <input
                type="text"
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo del rechazo (opcional)"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-brand"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setRechazando(null); setMotivo('') }}
                  className="flex-1 rounded-lg border border-line bg-surface py-2 text-sm text-ink-soft"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => confirmarRechazo(s)}
                  disabled={procesando}
                  className="flex-1 rounded-lg bg-danger py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Confirmar rechazo
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setRechazando(s.id)}
                disabled={procesando}
                className="flex-1 rounded-lg border border-danger/30 bg-surface py-2 text-sm font-medium text-danger disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                onClick={() => handleAprobar(s)}
                disabled={procesando}
                className="flex-1 rounded-lg bg-success py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Aprobar
              </button>
              <Link
                to={`/prestamos/${s.id}/cuotas`}
                className="flex items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm text-ink-soft"
              >
                Ver
              </Link>
            </div>
          )}
        </li>
      ))}
      </ul>
    </div>
  )
}
