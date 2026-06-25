import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collectionGroup, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../../config/firebase'
import { listarTodosLosPrestamos } from '../../../services/prestamosService'
import { ESTADO_CUOTA, METODO_PAGO } from '../../../models/prestamo'

export default function TabReportesCaja() {
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)

  async function cargar() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const [prestamos, snapCuotasPagadas] = await Promise.all([
        listarTodosLosPrestamos(),
        getDocs(query(collectionGroup(db, 'cuotas'), where('estado', '==', ESTADO_CUOTA.PAGADO))),
      ])

      const cuotasPagadas = snapCuotasPagadas.docs.map((d) => d.data())

      const totalPrestado = prestamos.reduce((acc, p) => acc + (p.montoPrestado || 0), 0)
      const totalSeguro = prestamos.reduce((acc, p) => acc + (p.montoSeguro || 0), 0)
      const totalCobrado = cuotasPagadas.reduce((acc, c) => acc + (c.monto || 0), 0)
      const cobradoYape = cuotasPagadas
        .filter((c) => c.metodoPago === METODO_PAGO.YAPE)
        .reduce((acc, c) => acc + (c.monto || 0), 0)
      const cobradoEfectivo = cuotasPagadas
        .filter((c) => c.metodoPago === METODO_PAGO.EFECTIVO)
        .reduce((acc, c) => acc + (c.monto || 0), 0)

      const totalCuotasEsperadas = prestamos.reduce((acc, p) => acc + (p.totalCuotas || 0), 0)
      const totalCuotasPagadasCount = prestamos.reduce((acc, p) => acc + (p.cuotasPagadas || 0), 0)
      const montoTotalAPagar = prestamos.reduce((acc, p) => acc + (p.montoTotalAPagar || 0), 0)
      const totalPendienteCobro = Math.max(montoTotalAPagar - totalCobrado, 0)

      setResumen({
        totalPrestado,
        totalSeguro,
        totalCobrado,
        cobradoYape,
        cobradoEfectivo,
        totalPendienteCobro,
        totalCuotasEsperadas,
        totalCuotasPagadasCount,
        cantidadPrestamos: prestamos.length,
      })
    } catch (err) {
      console.error('[TabReportesCaja]', err)
      setErrorCarga(
        err.code === 'permission-denied'
          ? 'No tienes permiso para ver los reportes.'
          : 'Ocurrio un error al cargar el resumen.'
      )
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  return (
    <div className="space-y-5">
      <Link
        to="/conciliacion"
        className="flex items-center justify-between rounded-2xl bg-gold p-4 text-white active:scale-[0.99] transition-transform"
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Caja</p>
          <p className="font-semibold">Conciliacion de cobros por verificar</p>
        </div>
        <span className="text-xl">→</span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Tarjeta label="Total prestado" valor={resumen.totalPrestado} color="text-brand" />
        <Tarjeta label="Total cobrado" valor={resumen.totalCobrado} color="text-success" />
        <Tarjeta label="Pendiente de cobro" valor={resumen.totalPendienteCobro} color="text-warning" />
        <Tarjeta label="Seguro acumulado" valor={resumen.totalSeguro} color="text-gold" />
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Cobrado por metodo de pago</h2>
        <div className="space-y-2">
          <FilaMetodo emoji="📱" label="Yape" valor={resumen.cobradoYape} />
          <FilaMetodo emoji="💵" label="Efectivo" valor={resumen.cobradoEfectivo} />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Cuotas</h2>
        <div className="flex justify-between text-sm">
          <span className="text-ink-soft">Pagadas / esperadas</span>
          <span className="font-medium text-ink">
            {resumen.totalCuotasPagadasCount} / {resumen.totalCuotasEsperadas}
          </span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-ink-soft">Prestamos totales</span>
          <span className="font-medium text-ink">{resumen.cantidadPrestamos}</span>
        </div>
      </div>
    </div>
  )
}

function Tarjeta({ label, valor, color }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`money mt-1 text-xl font-semibold ${color}`}>S/ {valor.toFixed(2)}</p>
    </div>
  )
}

function FilaMetodo({ emoji, label, valor }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-soft">{emoji} {label}</span>
      <span className="money text-sm font-semibold text-ink">S/ {valor.toFixed(2)}</span>
    </div>
  )
}
