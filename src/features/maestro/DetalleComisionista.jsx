import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { listarClientesPorComisionista } from '../../services/clientesService'
import { listarPrestamosPorComisionista } from '../../services/prestamosService'
import { EtiquetaEstadoCliente } from '../shared/EtiquetaEstadoCliente'
import { TIPO_CUOTA_LABELS } from '../../models/prestamo'

export default function DetalleComisionista() {
  const { comisionistaId } = useParams()
  const navigate = useNavigate()
  const [comisionista, setComisionista] = useState(null)
  const [clientes, setClientes] = useState([])
  const [prestamos, setPrestamos] = useState([])
  const [totales, setTotales] = useState({ prestado: 0, seguro: 0 })
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [vista, setVista] = useState('clientes') // 'clientes' | 'prestamos'

  async function cargar() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const [snapComisionista, listaClientes, listaPrestamos] = await Promise.all([
        getDoc(doc(db, 'usuarios', comisionistaId)),
        listarClientesPorComisionista(comisionistaId),
        listarPrestamosPorComisionista(comisionistaId),
      ])

      if (snapComisionista.exists()) {
        setComisionista({ id: snapComisionista.id, ...snapComisionista.data() })
      }
      setClientes(listaClientes)
      setPrestamos(listaPrestamos)
      setTotales({
        prestado: listaPrestamos.reduce((acc, p) => acc + (p.montoPrestado || 0), 0),
        seguro: listaPrestamos.reduce((acc, p) => acc + (p.montoSeguro || 0), 0),
      })
    } catch (err) {
      console.error('[DetalleComisionista]', err)
      setErrorCarga(
        err.code === 'permission-denied'
          ? 'No tienes permiso para ver este comisionista.'
          : 'Ocurrio un error al cargar los datos.'
      )
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comisionistaId])

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Cargando...
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-danger font-medium">{errorCarga}</p>
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft"
        >
          ← Volver
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper pb-10">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <button onClick={() => navigate(-1)} className="text-xl leading-none text-ink-soft">
          ←
        </button>
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            Comisionista
          </p>
          <h1 className="text-lg font-semibold text-ink">
            {comisionista?.nombre || 'Sin nombre'}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs text-ink-soft">Total prestado</p>
            <p className="money mt-1 text-xl font-semibold text-brand">
              S/ {totales.prestado.toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs text-ink-soft">Seguro acumulado</p>
            <p className="money mt-1 text-xl font-semibold text-gold">
              S/ {totales.seguro.toFixed(2)}
            </p>
          </div>
        </div>

        <p className="mb-3 text-sm font-semibold text-ink">
          {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} ·{' '}
          {prestamos.length} prestamo{prestamos.length !== 1 ? 's' : ''}
        </p>

        {/* Toggle de vista */}
        <div className="mb-4 flex gap-2 rounded-xl bg-line/40 p-1">
          <button
            onClick={() => setVista('clientes')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              vista === 'clientes' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            Clientes
          </button>
          <button
            onClick={() => setVista('prestamos')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              vista === 'prestamos' ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            Prestamos
          </button>
        </div>

        {vista === 'clientes' && (
          <>
            {clientes.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
                Este comisionista todavia no tiene clientes registrados.
              </div>
            )}

            <ul className="space-y-3">
              {clientes.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/clientes/${c.id}`}
                    className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 active:bg-paper transition-colors"
                  >
                    <div>
                      <p className="font-medium text-ink">{c.nombre}</p>
                      <p className="text-sm text-ink-soft">DNI {c.dni}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <EtiquetaEstadoCliente estado={c.estado} />
                      <span className="text-ink-soft text-lg">›</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {vista === 'prestamos' && (
          <PrestamosDelComisionista prestamos={prestamos} clientes={clientes} />
        )}
      </main>
    </div>
  )
}

function PrestamosDelComisionista({ prestamos, clientes }) {
  // Mapa clienteId -> nombre, construido a partir de los clientes ya
  // cargados (evita hacer una lectura extra por cada prestamo).
  const nombrePorCliente = clientes.reduce((acc, c) => {
    acc[c.id] = c.nombre
    return acc
  }, {})

  if (prestamos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-ink-soft">
        Este comisionista todavia no tiene prestamos registrados.
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {prestamos.map((p) => {
        const pagadas = p.cuotasPagadas || 0
        const total = p.totalCuotas || 0
        const progreso = total > 0 ? Math.round((pagadas / total) * 100) : 0
        const cancelado = pagadas === total && total > 0

        return (
          <li key={p.id}>
            <Link
              to={`/prestamos/${p.id}/cuotas`}
              className="block rounded-2xl border border-line bg-surface p-4 active:bg-paper transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-ink">
                    {nombrePorCliente[p.clienteId] || 'Cliente'}
                  </p>
                  <p className="money text-lg font-bold text-ink">
                    S/ {(p.montoPrestado || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {TIPO_CUOTA_LABELS[p.tipoCuota]} · {p.tasaInteres}% interes
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    cancelado ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                  }`}
                >
                  {cancelado ? 'Cancelado' : 'Activo'}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-ink-soft">
                  <span>{pagadas}/{total} cuotas pagadas</span>
                  <span>{progreso}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
