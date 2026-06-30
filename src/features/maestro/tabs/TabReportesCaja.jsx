import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { collectionGroup, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../../config/firebase'
import { listarTodosLosPrestamos } from '../../../services/prestamosService'
import { BotonExportarExcel } from '../../shared/BotonExportarExcel'
import { etiquetaCorte } from '../../../services/comisionService'
import { ESTADO_CUOTA, METODO_PAGO } from '../../../models/prestamo'

const MESES_RIESGO = 4

export default function TabReportesCaja() {
  const [resumen, setResumen] = useState(null)
  const [comisiones, setComisiones] = useState([])
  const [riesgosos, setRiesgosos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)

  async function cargar() {
    setCargando(true)
    setErrorCarga(null)
    try {
      const [prestamos, snapCuotasPagadas, snapComisionistas] = await Promise.all([
        listarTodosLosPrestamos(),
        getDocs(query(collectionGroup(db, 'cuotas'), where('estado', '==', ESTADO_CUOTA.PAGADO))),
        getDocs(query(collection(db, 'usuarios'), where('role', '==', 'collector'))),
      ])

      const cuotasPagadas = snapCuotasPagadas.docs.map((d) => d.data())
      const nombresComisionista = {}
      snapComisionistas.docs.forEach((d) => {
        nombresComisionista[d.id] = d.data().nombre
      })

      // --- Totales globales (ya existian) ---
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

      // --- NUEVO: totales de hoy y del mes ---
      const ahora = new Date()
      const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

      const prestadoHoy = sumarPorFecha(prestamos, 'creadoEn', inicioHoy, 'montoPrestado')
      const prestadoMes = sumarPorFecha(prestamos, 'creadoEn', inicioMes, 'montoPrestado')
      const cobradoHoy = sumarPorFecha(cuotasPagadas, 'fechaAprobacion', inicioHoy, 'monto')
      const cobradoMes = sumarPorFecha(cuotasPagadas, 'fechaAprobacion', inicioMes, 'monto')

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
        prestadoHoy,
        prestadoMes,
        cobradoHoy,
        cobradoMes,
      })

      // --- NUEVO: comisiones por comisionista, agrupadas por corte ---
      const mapaComisiones = {}
      prestamos
        .filter((p) => p.comisionGanada)
        .forEach((p) => {
          const key = `${p.comisionistaId}-${p.cortePago}`
          if (!mapaComisiones[key]) {
            mapaComisiones[key] = {
              comisionistaId: p.comisionistaId,
              comisionistaNombre: nombresComisionista[p.comisionistaId] || 'Comisionista',
              corte: p.cortePago,
              fechaPago: p.fechaPagoComision,
              total: 0,
              cantidad: 0,
            }
          }
          mapaComisiones[key].total += p.comisionGanada
          mapaComisiones[key].cantidad += 1
        })
      setComisiones(Object.values(mapaComisiones))

      // --- NUEVO: clientes riesgosos (>4 meses de retraso) ---
      const limiteRiesgo = new Date(ahora)
      limiteRiesgo.setMonth(limiteRiesgo.getMonth() - MESES_RIESGO)

      const snapPendientes = await getDocs(
        query(collectionGroup(db, 'cuotas'), where('estado', '==', ESTADO_CUOTA.PENDIENTE))
      )
      const masAntiguaPorCliente = {}
      snapPendientes.docs.forEach((d) => {
        const cuota = d.data()
        const fechaVenc = aFechaJS(cuota.fechaVencimiento)
        if (!fechaVenc || fechaVenc > limiteRiesgo) return
        if (
          !masAntiguaPorCliente[cuota.clienteId] ||
          fechaVenc < masAntiguaPorCliente[cuota.clienteId].fechaVencimiento
        ) {
          masAntiguaPorCliente[cuota.clienteId] = {
            clienteId: cuota.clienteId,
            comisionistaId: cuota.comisionistaId,
            fechaVencimiento: fechaVenc,
          }
        }
      })

      const clienteIdsRiesgo = Object.keys(masAntiguaPorCliente)
      const datosClientes = {}
      await Promise.all(
        clienteIdsRiesgo.map(async (id) => {
          const snap = await getDoc(doc(db, 'clientes', id))
          if (snap.exists()) datosClientes[id] = snap.data()
        })
      )

      const listaRiesgosos = clienteIdsRiesgo.map((id) => {
        const info = masAntiguaPorCliente[id]
        const meses = Math.floor((ahora - info.fechaVencimiento) / (1000 * 60 * 60 * 24 * 30))
        return {
          clienteId: id,
          nombre: datosClientes[id]?.nombre || 'Cliente',
          dni: datosClientes[id]?.dni || '',
          comisionistaNombre: nombresComisionista[info.comisionistaId] || 'Comisionista',
          mesesRetraso: meses,
          fechaVencimiento: info.fechaVencimiento,
        }
      }).sort((a, b) => b.mesesRetraso - a.mesesRetraso)

      setRiesgosos(listaRiesgosos)
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
    <div className="space-y-6">
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

      {/* Totales de hoy / mes */}
      <section>
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
          <span>💰</span> Prestamos otorgados
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Tarjeta label="Hoy" valor={resumen.prestadoHoy} color="text-brand" bg="bg-brand-soft border-brand/20" />
          <Tarjeta label="Acumulado del mes" valor={resumen.prestadoMes} color="text-brand" bg="bg-brand-soft border-brand/20" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
          <span>💵</span> Cobros recibidos
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Tarjeta label="Hoy" valor={resumen.cobradoHoy} color="text-success" bg="bg-success-soft border-success/20" />
          <Tarjeta label="Acumulado del mes" valor={resumen.cobradoMes} color="text-success" bg="bg-success-soft border-success/20" />
        </div>
      </section>

      {/* Totales globales */}
      <section>
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
          <span>📊</span> Totales globales
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Tarjeta label="Total prestado" valor={resumen.totalPrestado} color="text-brand" bg="bg-brand-soft border-brand/20" emoji="📈" />
          <Tarjeta label="Total cobrado" valor={resumen.totalCobrado} color="text-success" bg="bg-success-soft border-success/20" emoji="✅" />
          <Tarjeta label="Pendiente de cobro" valor={resumen.totalPendienteCobro} color="text-warning" bg="bg-warning-soft border-warning/20" emoji="⏳" />
          <Tarjeta label="Seguro acumulado" valor={resumen.totalSeguro} color="text-gold" bg="bg-gold-soft border-gold/20" emoji="🛡️" />
        </div>
      </section>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
          <span>💳</span> Cobrado por metodo de pago
        </h2>
        <div className="space-y-2">
          <FilaMetodo emoji="📱" label="Yape" valor={resumen.cobradoYape} />
          <FilaMetodo emoji="💵" label="Efectivo" valor={resumen.cobradoEfectivo} />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
          <span>🧾</span> Cuotas
        </h2>
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

      {/* Comisiones por comisionista */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <span>🤝</span> Pago a comisionistas (5% al completar deuda)
          </h2>
          <BotonExportarExcel
            nombreArchivo="comisiones_comisionistas"
            nombreHoja="Comisiones"
            label="Excel"
            columnas={[
              { header: 'Comisionista', key: 'comisionistaNombre', width: 25 },
              { header: 'Corte', key: 'corteTexto', width: 28 },
              { header: 'Prestamos completados', key: 'cantidad', width: 18 },
              { header: 'Comision total (S/)', key: 'total', width: 18 },
              { header: 'Fecha de pago', key: 'fechaPagoTexto', width: 16 },
            ]}
            filas={comisiones.map((c) => ({
              ...c,
              corteTexto: etiquetaCorte(c.corte),
              fechaPagoTexto: formatFecha(c.fechaPago),
            }))}
          />
        </div>

        {comisiones.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            Todavia no hay prestamos completados con comision contabilizada.
          </div>
        )}

        <ul className="space-y-2">
          {comisiones.map((c) => (
            <li
              key={`${c.comisionistaId}-${c.corte}`}
              className="rounded-2xl border border-l-4 border-line border-l-success bg-surface p-4"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{c.comisionistaNombre}</p>
                <p className="money font-bold text-success">S/ {c.total.toFixed(2)}</p>
              </div>
              <p className="text-xs text-ink-soft mt-1">
                {c.cantidad} prestamo{c.cantidad > 1 ? 's' : ''} completado{c.cantidad > 1 ? 's' : ''} ·{' '}
                {etiquetaCorte(c.corte)} · Pago: {formatFecha(c.fechaPago)}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-soft mt-2">
          Esta informacion es visible solo para el Usuario Maestro.
        </p>
      </section>

      {/* Clientes riesgosos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <span>⚠️</span> Clientes riesgosos (+{MESES_RIESGO} meses de retraso)
          </h2>
          <BotonExportarExcel
            nombreArchivo="clientes_riesgosos"
            nombreHoja="Riesgosos"
            label="Excel"
            columnas={[
              { header: 'Cliente', key: 'nombre', width: 25 },
              { header: 'DNI', key: 'dni', width: 14 },
              { header: 'Comisionista', key: 'comisionistaNombre', width: 25 },
              { header: 'Meses de retraso', key: 'mesesRetraso', width: 16 },
              { header: 'Cuota vencida desde', key: 'fechaTexto', width: 18 },
            ]}
            filas={riesgosos.map((r) => ({ ...r, fechaTexto: formatFecha(r.fechaVencimiento) }))}
          />
        </div>

        {riesgosos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
            No hay clientes con mas de {MESES_RIESGO} meses de retraso.
          </div>
        )}

        <ul className="space-y-2">
          {riesgosos.map((r) => (
            <li
              key={r.clienteId}
              className="rounded-2xl border border-danger/30 bg-danger-soft p-4"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{r.nombre}</p>
                <span className="text-xs font-semibold text-danger">
                  {r.mesesRetraso} meses
                </span>
              </div>
              <p className="text-xs text-ink-soft mt-1">
                DNI {r.dni} · Comisionista: {r.comisionistaNombre}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function sumarPorFecha(items, campoFecha, desde, campoMonto) {
  return items.reduce((acc, item) => {
    const fecha = aFechaJS(item[campoFecha])
    if (fecha && fecha >= desde) {
      return acc + (item[campoMonto] || 0)
    }
    return acc
  }, 0)
}

function aFechaJS(valor) {
  if (!valor) return null
  return valor.toDate ? valor.toDate() : new Date(valor)
}

function Tarjeta({ label, valor, color, bg = 'bg-surface border-line', emoji }) {
  return (
    <div className={`rounded-2xl border p-4 ${bg}`}>
      <p className="text-xs text-ink-soft flex items-center gap-1">
        {emoji && <span>{emoji}</span>} {label}
      </p>
      <p className={`money mt-1 text-xl font-bold ${color}`}>S/ {valor.toFixed(2)}</p>
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

function formatFecha(fecha) {
  const d = aFechaJS(fecha)
  if (!d) return '—'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}
