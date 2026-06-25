import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarComisionistas } from '../../../services/comisionistasService'
import { listarPrestamosPorComisionista } from '../../../services/prestamosService'

export default function TabComisionistas() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  async function cargarDatos() {
    setCargando(true)
    setError(null)
    try {
      const comisionistas = await listarComisionistas()

      const conTotales = await Promise.all(
        comisionistas.map(async (c) => {
          const prestamos = await listarPrestamosPorComisionista(c.uid ?? c.id)
          const totalPrestado = prestamos.reduce((acc, p) => acc + (p.montoPrestado || 0), 0)
          const totalSeguro = prestamos.reduce((acc, p) => acc + (p.montoSeguro || 0), 0)
          return { ...c, cantidadPrestamos: prestamos.length, totalPrestado, totalSeguro }
        })
      )

      setFilas(conTotales)
    } catch (err) {
      console.error('[TabComisionistas]', err)
      setError('No se pudieron cargar los comisionistas.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  const granTotal = filas.reduce((acc, f) => acc + f.totalPrestado, 0)

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Link
          to="/comisionistas/nuevo"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          + Nuevo comisionista
        </Link>
      </div>

      <div className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-soft">Total prestado (todos los comisionistas)</p>
        <p className="money mt-1 text-3xl font-semibold text-brand">
          S/ {granTotal.toFixed(2)}
        </p>
      </div>

      {cargando && <p className="text-ink-soft">Cargando…</p>}
      {error && <p className="text-danger">{error}</p>}

      {!cargando && !error && filas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-soft">
          Todavia no hay comisionistas registrados.
        </div>
      )}

      <ul className="space-y-3">
        {filas.map((f) => (
          <li key={f.uid ?? f.id}>
            <Link
              to={`/comisionistas/${f.uid ?? f.id}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 active:bg-paper transition-colors"
            >
              <div>
                <p className="font-medium text-ink">{f.nombre}</p>
                <p className="text-sm text-ink-soft">
                  {f.cantidadPrestamos} préstamo{f.cantidadPrestamos === 1 ? '' : 's'} ·
                  seguro acumulado{' '}
                  <span className="money">S/ {f.totalSeguro.toFixed(2)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="money text-lg font-semibold text-ink">
                  S/ {f.totalPrestado.toFixed(2)}
                </p>
                <span className="text-ink-soft text-lg">›</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
