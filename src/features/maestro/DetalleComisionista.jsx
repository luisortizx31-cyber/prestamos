import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { listarClientesPorComisionista } from '../../services/clientesService'
import { listarPrestamosPorComisionista } from '../../services/prestamosService'
import { EtiquetaEstadoCliente } from '../shared/EtiquetaEstadoCliente'

export default function DetalleComisionista() {
  const { comisionistaId } = useParams()
  const navigate = useNavigate()
  const [comisionista, setComisionista] = useState(null)
  const [clientes, setClientes] = useState([])
  const [totales, setTotales] = useState({ prestado: 0, seguro: 0 })
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)

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
          {clientes.length} cliente{clientes.length !== 1 ? 's' : ''}
        </p>

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
      </main>
    </div>
  )
}
