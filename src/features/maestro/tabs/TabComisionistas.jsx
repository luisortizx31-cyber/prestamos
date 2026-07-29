import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarComisionistas } from '../../../services/comisionistasService'
import { listarPrestamosPorComisionista } from '../../../services/prestamosService'
import { BotonExportarExcel } from '../../shared/BotonExportarExcel'
import { construirLinkWhatsapp } from '../../../utils/whatsapp'
import { WhatsappIcon } from '../../shared/WhatsappIcon'
import RegistroComisionista from '../RegistroComisionista'

export default function TabComisionistas() {
  const [filas, setFilas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [modalNuevoComisionista, setModalNuevoComisionista] = useState(false)

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
        <button
          type="button"
          onClick={() => setModalNuevoComisionista(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          + Nuevo comisionista
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-brand p-4 text-white">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Cartera total</p>
          <p className="text-2xl font-bold">
            {filas.length} comisionista{filas.length !== 1 ? 's' : ''}
          </p>
          <p className="money text-xs text-white/70">
            S/ {formatMonto(granTotal)} prestado en total
          </p>
        </div>
        <span className="text-3xl">🧑‍💼</span>
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

      <ul className="space-y-2.5">
        {filasFiltradas.map((f) => (
          <li key={f.uid ?? f.id}>
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <Link
                  to={`/comisionistas/${f.uid ?? f.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70 transition-opacity"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                    {iniciales(f.nombre)}
                  </div>
                  <p className="min-w-0 flex-1 truncate font-semibold text-ink">{f.nombre}</p>
                </Link>
                <Link
                  to={`/comisionistas/${f.uid ?? f.id}`}
                  className="shrink-0 text-lg text-ink-soft/60"
                >
                  ›
                </Link>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 pl-[52px]">
                <p className="text-xs text-ink-soft">
                  {f.cantidadPrestamos} préstamo{f.cantidadPrestamos === 1 ? '' : 's'}
                  <span className="mx-1 text-line">·</span>
                  seguro <span className="money">S/ {formatMonto(f.totalSeguro)}</span>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {construirLinkWhatsapp(f.telefono) && (
                    <a
                      href={construirLinkWhatsapp(f.telefono)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Escribir a ${f.nombre} por WhatsApp`}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-success/30 bg-success-soft text-success active:scale-95 transition-transform"
                    >
                      <WhatsappIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <Link
                    to={`/comisionistas/${f.uid ?? f.id}`}
                    className="money text-sm font-bold text-ink whitespace-nowrap"
                  >
                    S/ {formatMonto(f.totalPrestado)}
                  </Link>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {modalNuevoComisionista && (
        <RegistroComisionista
          onCerrar={() => setModalNuevoComisionista(false)}
          onGuardado={() => {
            setModalNuevoComisionista(false)
            cargarDatos()
          }}
        />
      )}
    </div>
  )
}

function iniciales(nombre) {
  if (!nombre) return '?'
  const palabras = nombre.trim().split(/\s+/)
  const primeras = palabras.length > 1 ? [palabras[0], palabras[1]] : [palabras[0]]
  return primeras.map((p) => p[0]).join('').toUpperCase()
}

function formatMonto(monto) {
  return (monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
