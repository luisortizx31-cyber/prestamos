import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collectionGroup, collection, getDocs, query, where } from 'firebase/firestore'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../config/firebase'
import {
  listarTodosLosPrestamos,
  marcarComisionesComoPagadas,
  deshacerPagoComision,
} from '../../../services/prestamosService'
import { BotonExportarExcel } from '../../shared/BotonExportarExcel'
import { etiquetaCorte } from '../../../services/comisionService'
import { ESTADO_CUOTA, METODO_PAGO } from '../../../models/prestamo'

const MESES_RIESGO = 4

export default function TabReportesCaja() {
  const [resumen, setResumen] = useState(null)
  const [comisiones, setComisiones] = useState([])
  const [comisionesPagadas, setComisionesPagadas] = useState([])
  const [verHistorialComisiones, setVerHistorialComisiones] = useState(false)
  const [procesandoComision, setProcesandoComision] = useState(null) // key del grupo en proceso
  const [riesgosos, setRiesgosos] = useState([])
  const [rawData, setRawData] = useState({ prestamos: [], cuotasPagadas: [] })
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [vista, setVista] = useState('resumen')

  const hoy = new Date()
  const [mesSeleccionado, setMesSeleccionado] = useState({
    year: hoy.getFullYear(),
    month: hoy.getMonth(),
  })

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

      setRawData({ prestamos, cuotasPagadas })

      // Totales globales
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

      // Totales de hoy
      const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
      const prestadoHoy = sumarEnRango(prestamos, 'creadoEn', inicioHoy, null, 'montoPrestado')
      const cobradoHoy = sumarEnRango(cuotasPagadas, 'fechaAprobacion', inicioHoy, null, 'monto')
      const prestamosHoy = contarEnRango(prestamos, 'creadoEn', inicioHoy, null)
      const cuotasHoy = contarEnRango(cuotasPagadas, 'fechaAprobacion', inicioHoy, null)

      setResumen({
        totalPrestado, totalSeguro, totalCobrado,
        cobradoYape, cobradoEfectivo,
        totalPendienteCobro, totalCuotasEsperadas,
        totalCuotasPagadasCount, cantidadPrestamos: prestamos.length,
        prestadoHoy, cobradoHoy, prestamosHoy, cuotasHoy,
      })

      // Comisiones por comisionista, agrupadas por corte Y por el mes/año
      // real de ese corte (no solo "corte 1 o 2" — eso mezclaria para
      // siempre el corte 1 de enero con el de marzo). Separadas en
      // pendientes de pago / ya pagadas segun comisionPagada, para que
      // el Maestro pueda marcar un grupo como pagado y que deje de
      // aparecer como pendiente (ver marcarComisionesComoPagadas).
      function agruparComisiones(lista) {
        const mapa = {}
        lista.forEach((p) => {
          const fechaPago = aFechaJS(p.fechaPagoComision)
          const periodo = fechaPago
            ? `${fechaPago.getFullYear()}-${fechaPago.getMonth()}`
            : 'sin-fecha'
          const key = `${p.comisionistaId}-${p.cortePago}-${periodo}`
          if (!mapa[key]) {
            mapa[key] = {
              key,
              comisionistaId: p.comisionistaId,
              comisionistaNombre: nombresComisionista[p.comisionistaId] || 'Comisionista',
              corte: p.cortePago,
              fechaPago: p.fechaPagoComision,
              total: 0,
              cantidad: 0,
              prestamoIds: [],
            }
          }
          mapa[key].total += p.comisionGanada
          mapa[key].cantidad += 1
          mapa[key].prestamoIds.push(p.id)
        })
        return Object.values(mapa)
      }

      const prestamosConComision = prestamos.filter((p) => p.comisionGanada)
      setComisiones(agruparComisiones(prestamosConComision.filter((p) => !p.comisionPagada)))
      setComisionesPagadas(agruparComisiones(prestamosConComision.filter((p) => p.comisionPagada)))

      // Clientes riesgosos (>4 meses de retraso)
      const limiteRiesgo = new Date(hoy)
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

      setRiesgosos(
        clienteIdsRiesgo.map((id) => {
          const info = masAntiguaPorCliente[id]
          const meses = Math.floor((hoy - info.fechaVencimiento) / (1000 * 60 * 60 * 24 * 30))
          return {
            clienteId: id,
            nombre: datosClientes[id]?.nombre || 'Cliente',
            dni: datosClientes[id]?.dni || '',
            comisionistaNombre: nombresComisionista[info.comisionistaId] || 'Comisionista',
            mesesRetraso: meses,
            fechaVencimiento: info.fechaVencimiento,
          }
        }).sort((a, b) => b.mesesRetraso - a.mesesRetraso)
      )
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

  useEffect(() => { cargar() }, [])

  async function handleMarcarPagada(grupo) {
    setProcesandoComision(grupo.key)
    try {
      await marcarComisionesComoPagadas(grupo.prestamoIds)
      await cargar()
    } catch (err) {
      console.error('[TabReportesCaja] Error al marcar comision pagada:', err)
    } finally {
      setProcesandoComision(null)
    }
  }

  async function handleDeshacerPago(grupo) {
    setProcesandoComision(grupo.key)
    try {
      await deshacerPagoComision(grupo.prestamoIds)
      await cargar()
    } catch (err) {
      console.error('[TabReportesCaja] Error al deshacer pago de comision:', err)
    } finally {
      setProcesandoComision(null)
    }
  }

  // Estadísticas del mes seleccionado, calculadas sobre los datos ya cargados
  const statsMes = calcularMes(
    rawData.prestamos,
    rawData.cuotasPagadas,
    mesSeleccionado.year,
    mesSeleccionado.month
  )

  const esMesActual =
    mesSeleccionado.year === hoy.getFullYear() &&
    mesSeleccionado.month === hoy.getMonth()

  function irMesAnterior() {
    setMesSeleccionado(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    )
  }

  function irMesSiguiente() {
    if (esMesActual) return
    setMesSeleccionado(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    )
  }

  if (cargando) return <p className="text-center text-ink-soft py-10">Cargando...</p>

  if (errorCarga) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger-soft p-5 text-center">
        <p className="text-danger font-medium">{errorCarga}</p>
      </div>
    )
  }

  const labelMes = new Date(mesSeleccionado.year, mesSeleccionado.month, 1)
    .toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
  const labelMesMayus = labelMes.charAt(0).toUpperCase() + labelMes.slice(1)

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

      {/* Sub-pestañas */}
      <div className="flex gap-2 rounded-xl bg-line/40 p-1">
        {[
          { id: 'resumen', label: 'Resumen' },
          { id: 'comision', label: 'Comision' },
          { id: 'riesgosos', label: 'Riesgosos' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setVista(t.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              vista === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vista === 'resumen' && (
        <>
          {/* HOY */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Hoy</h2>
            <div className="grid grid-cols-2 gap-3">
              <Tarjeta
                label="Prestado"
                valor={resumen.prestadoHoy}
                sub={`${resumen.prestamosHoy} préstamo${resumen.prestamosHoy !== 1 ? 's' : ''}`}
                color="text-brand"
                bg="bg-brand-soft border-brand/20"
              />
              <Tarjeta
                label="Cobrado"
                valor={resumen.cobradoHoy}
                sub={`${resumen.cuotasHoy} cuota${resumen.cuotasHoy !== 1 ? 's' : ''}`}
                color="text-success"
                bg="bg-success-soft border-success/20"
              />
            </div>
          </section>

          {/* SELECTOR DE MES */}
          <section>
            <div className="mb-3 flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2">
              <button
                onClick={irMesAnterior}
                className="px-2 py-1 text-lg text-ink-soft active:text-ink"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-ink">{labelMesMayus}</span>
              <button
                onClick={irMesSiguiente}
                disabled={esMesActual}
                className="px-2 py-1 text-lg text-ink-soft disabled:opacity-25 active:text-ink"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Tarjeta
                label="Prestado"
                valor={statsMes.prestadoMes}
                sub={`${statsMes.prestamosNuevos} préstamo${statsMes.prestamosNuevos !== 1 ? 's' : ''}`}
                color="text-brand"
                bg="bg-brand-soft border-brand/20"
              />
              <Tarjeta
                label="Cobrado"
                valor={statsMes.cobradoMes}
                sub={`${statsMes.cuotasCobradas} cuota${statsMes.cuotasCobradas !== 1 ? 's' : ''}`}
                color="text-success"
                bg="bg-success-soft border-success/20"
              />
            </div>
          </section>

          {/* TOTALES GLOBALES */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Totales globales</h2>
            <div className="grid grid-cols-2 gap-3">
              <Tarjeta label="Total prestado" valor={resumen.totalPrestado} color="text-brand" bg="bg-brand-soft border-brand/20" />
              <Tarjeta label="Total cobrado" valor={resumen.totalCobrado} color="text-success" bg="bg-success-soft border-success/20" />
              <Tarjeta label="Pendiente de cobro" valor={resumen.totalPendienteCobro} color="text-warning" bg="bg-warning-soft border-warning/20" />
              <Tarjeta label="Seguro acumulado" valor={resumen.totalSeguro} color="text-gold" bg="bg-gold-soft border-gold/20" />
            </div>
          </section>

          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">Cobrado por metodo de pago</h2>
            <div className="space-y-2">
              <FilaMetodo emoji="📱" label="Yape" valor={resumen.cobradoYape} />
              <FilaMetodo emoji="💵" label="Efectivo" valor={resumen.cobradoEfectivo} />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">Cuotas</h2>
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Pagadas / esperadas</span>
              <span className="font-medium text-ink">
                {resumen.totalCuotasPagadasCount} / {resumen.totalCuotasEsperadas}
              </span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-ink-soft">Prestamos totales</span>
              <span className="font-medium text-ink">{resumen.cantidadPrestamos}</span>
            </div>
          </div>
        </>
      )}

      {vista === 'comision' && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">
              Pago a comisionistas (5% al completar deuda)
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

          {comisiones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
              No hay comisiones pendientes de pago.
            </div>
          ) : (
            <ul className="space-y-2">
              {comisiones.map((c) => (
                <li
                  key={c.key}
                  className="rounded-2xl border border-l-4 border-line border-l-success bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">{c.comisionistaNombre}</p>
                    <p className="money font-bold text-success">S/ {c.total.toFixed(2)}</p>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {c.cantidad} prestamo{c.cantidad > 1 ? 's' : ''} completado{c.cantidad > 1 ? 's' : ''} ·{' '}
                    {etiquetaCorte(c.corte)} · Pago: {formatFecha(c.fechaPago)}
                  </p>
                  <button
                    onClick={() => handleMarcarPagada(c)}
                    disabled={procesandoComision === c.key}
                    className="mt-3 w-full rounded-lg bg-success py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {procesandoComision === c.key ? 'Marcando...' : '✓ Marcar como pagada'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => setVerHistorialComisiones((v) => !v)}
            className="mt-4 text-xs font-medium text-ink-soft underline"
          >
            {verHistorialComisiones ? 'Ocultar' : 'Ver'} historial de comisiones pagadas (
            {comisionesPagadas.length})
          </button>

          {verHistorialComisiones && (
            <div className="mt-2">
              {comisionesPagadas.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
                  Todavia no marcaste ninguna comision como pagada.
                </div>
              ) : (
                <ul className="space-y-2">
                  {comisionesPagadas.map((c) => (
                    <li
                      key={c.key}
                      className="rounded-2xl border border-line bg-paper p-4 opacity-80"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-ink">{c.comisionistaNombre}</p>
                        <p className="money font-bold text-ink-soft">S/ {c.total.toFixed(2)}</p>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        {c.cantidad} prestamo{c.cantidad > 1 ? 's' : ''} · {etiquetaCorte(c.corte)} ·{' '}
                        Pago: {formatFecha(c.fechaPago)}
                      </p>
                      <button
                        onClick={() => handleDeshacerPago(c)}
                        disabled={procesandoComision === c.key}
                        className="mt-3 w-full rounded-lg border border-line py-2 text-xs text-ink-soft disabled:opacity-50"
                      >
                        {procesandoComision === c.key ? 'Deshaciendo...' : 'Deshacer (me equivoque)'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="mt-2 text-xs text-ink-soft">
            Esta informacion es visible solo para el Usuario Maestro.
          </p>
        </section>
      )}

      {vista === 'riesgosos' && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">
              Clientes riesgosos (+{MESES_RIESGO} meses de retraso)
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

          {riesgosos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
              No hay clientes con mas de {MESES_RIESGO} meses de retraso.
            </div>
          ) : (
            <ul className="space-y-2">
              {riesgosos.map((r) => (
                <li key={r.clienteId} className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">{r.nombre}</p>
                    <span className="text-xs font-semibold text-danger">{r.mesesRetraso} meses</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    DNI {r.dni} · Comisionista: {r.comisionistaNombre}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// ── Helpers de cálculo ──────────────────────────────────────────────

function calcularMes(prestamos, cuotasPagadas, year, month) {
  const inicio = new Date(year, month, 1)
  const fin = new Date(year, month + 1, 1)

  const prestamosDelMes = prestamos.filter((p) => {
    const f = aFechaJS(p.creadoEn)
    return f && f >= inicio && f < fin
  })
  const cuotasDelMes = cuotasPagadas.filter((c) => {
    const f = aFechaJS(c.fechaAprobacion)
    return f && f >= inicio && f < fin
  })

  return {
    prestadoMes: prestamosDelMes.reduce((acc, p) => acc + (p.montoPrestado || 0), 0),
    prestamosNuevos: prestamosDelMes.length,
    cobradoMes: cuotasDelMes.reduce((acc, c) => acc + (c.monto || 0), 0),
    cuotasCobradas: cuotasDelMes.length,
  }
}

function sumarEnRango(items, campoFecha, desde, hasta, campoMonto) {
  return items.reduce((acc, item) => {
    const f = aFechaJS(item[campoFecha])
    if (!f) return acc
    if (f < desde) return acc
    if (hasta && f >= hasta) return acc
    return acc + (item[campoMonto] || 0)
  }, 0)
}

function contarEnRango(items, campoFecha, desde, hasta) {
  return items.filter((item) => {
    const f = aFechaJS(item[campoFecha])
    if (!f) return false
    if (f < desde) return false
    if (hasta && f >= hasta) return false
    return true
  }).length
}

function aFechaJS(valor) {
  if (!valor) return null
  return valor.toDate ? valor.toDate() : new Date(valor)
}

function formatFecha(fecha) {
  const d = aFechaJS(fecha)
  if (!d) return '—'
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Componentes visuales ────────────────────────────────────────────

function Tarjeta({ label, valor, sub, color, bg = 'bg-surface border-line' }) {
  return (
    <div className={`rounded-2xl border p-4 ${bg}`}>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`money mt-1 text-xl font-bold ${color}`}>S/ {valor.toFixed(2)}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
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
