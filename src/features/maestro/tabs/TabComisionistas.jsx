import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarComisionistas } from '../../../services/comisionistasService'
import { listarPrestamosPorComisionista } from '../../../services/prestamosService'
import { BotonExportarExcel } from '../../shared/BotonExportarExcel'

export default function TabComisionistas() {
  const [filas, setFilas] = useState([])
  const [busqueda, setBusqueda] = useState('')
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

  const filasFiltradas = filas.filter((f) => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return (
      f.nombre?.toLowerCase().includes(q) ||
      f.dni?.includes(q)
    )
  })

  const granTotal = filas.reduce((acc, f) => acc + f.totalPrestado, 0)

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <BotonExportarExcel
          nombreArchivo="comisionistas"
          nombreHoja="Comisionistas"
          label="Excel"
          columnas={[
            { header: 'Nombre', key: 'nombre', width: 25 },
            { header: 'DNI', key: 'dni', width: 14 },
            { header: 'Telefono', key: 'telefono', width: 16 },
            { header: 'Cantidad prestamos', key: 'cantidadPrestamos', width: 18 },
            { header: 'Total prestado (S/)', key: 'totalPrestado', width: 18 },
            { header: 'Seguro acumulado (S/)', key: 'totalSeguro', width: 20 },
          ]}
          filas={filas}
        />
        <Link
          to="/comisionistas/nuevo"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          + Nuevo comisionista
        </Link>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-soft">Total prestado (todos los comisionistas)</p>
        <p className="money mt-1 text-3xl font-semibold text-brand">
          S/ {granTotal.toFixed(2)}
        </p>
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o DNI…"
        className="mb-4 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 outline-none focus-visible:border-brand"
      />

      {cargando && <p className="text-ink-soft">Cargando…</p>}
      {error && <p className="text-danger">{error}</p>}

      {!cargando && !error && filas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-soft">
          Todavia no hay comisionistas registrados.
        </div>
      )}

      {!cargando && !error && filas.length > 0 && filasFiltradas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-soft">
          No se encontro ningun comisionista con "{busqueda}".
        </div>
      )}

      <ul className="space-y-3">
        {filasFiltradas.map((f) => (
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
