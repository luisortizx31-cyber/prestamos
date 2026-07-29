import { useState, useCallback } from 'react'
import {
  registrarPagoConValidacionYape,
  registrarPagoEfectivo,
  existeCodigoYape,
  CodigoYapeDuplicadoError,
  METODO_PAGO,
} from '../../services/yapeValidationService'

/**
 * @param {object} props
 * @param {object} props.cuota          { id, numero, monto, montoPagado, fechaVencimiento, ... }
 * @param {string} props.prestamoId
 * @param {string} props.comisionistaId
 * @param {string} props.clienteId      necesario para recalcular el estado del cliente tras el pago
 * @param {Function} props.onCerrar     se llama al cancelar O al pagar con exito
 */
export function ModalCobro({ cuota, prestamoId, comisionistaId, clienteId, onCerrar }) {
  // Saldo real que le queda a la cuota: si ya tuvo un abono parcial
  // antes (cuota.montoPagado), solo falta la diferencia — el cliente
  // puede pagar eso de a poco, no necesariamente todo junto.
  const montoPendiente = Math.round((cuota.monto - (cuota.montoPagado || 0)) * 100) / 100

  const [metodo, setMetodo] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [montoTexto, setMontoTexto] = useState(String(montoPendiente))
  const [verificando, setVerificando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [advertencia, setAdvertencia] = useState(null)
  const [error, setError] = useState(null)

  const montoIngresado = Number(montoTexto)
  const montoValido =
    montoTexto.trim() !== '' && montoIngresado > 0 && montoIngresado <= montoPendiente + 0.01
  const esAbonoParcial = montoValido && montoIngresado < montoPendiente - 0.01
  const saldoRestante = Math.max(0, Math.round((montoPendiente - montoIngresado) * 100) / 100)

  const fechaVenc = cuota.fechaVencimiento?.toDate
    ? cuota.fechaVencimiento.toDate()
    : new Date(cuota.fechaVencimiento)

  const verificarRapido = useCallback(async (val) => {
    if (val.length < 4) { setAdvertencia(null); return }
    setVerificando(true)
    try {
      const existe = await existeCodigoYape(val)
      setAdvertencia(existe ? 'Este codigo Yape ya fue registrado anteriormente.' : null)
    } catch {
      // silencioso — la garantia real esta en la transaccion al confirmar
    } finally {
      setVerificando(false)
    }
  }, [])

  function handleCodigo(val) {
    setCodigo(val)
    setError(null)
    verificarRapido(val.trim())
  }

  async function confirmar() {
    if (!montoValido) return
    setError(null)
    setEnviando(true)
    try {
      if (metodo === METODO_PAGO.YAPE) {
        await registrarPagoConValidacionYape({
          codigoYape: codigo.trim(),
          prestamoId,
          cuotaId: cuota.id,
          comisionistaId,
          clienteId,
          monto: montoIngresado,
        })
      } else {
        await registrarPagoEfectivo({
          prestamoId,
          cuotaId: cuota.id,
          comisionistaId,
          clienteId,
          monto: montoIngresado,
        })
      }
      onCerrar()
    } catch (err) {
      if (err instanceof CodigoYapeDuplicadoError) {
        setError('Codigo Yape duplicado: este comprobante ya fue registrado.')
      } else {
        console.error('[ModalCobro]', err)
        setError('No se pudo registrar el pago. Intenta de nuevo.')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl bg-surface p-6 pb-10 shadow-xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs text-ink-soft uppercase tracking-wide">Registrar cobro</p>
            <p className="money text-xl font-bold text-ink">
              Cuota {cuota.numero} · S/ {montoPendiente.toFixed(2)}
            </p>
            {cuota.montoPagado > 0 && (
              <p className="text-xs text-brand">
                Ya abono S/ {cuota.montoPagado.toFixed(2)} de S/ {cuota.monto.toFixed(2)}
              </p>
            )}
            <p className="text-sm text-ink-soft">{formatFecha(fechaVenc)}</p>
          </div>
          <button onClick={onCerrar} className="text-2xl leading-none text-ink-soft px-1">×</button>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-ink mb-1">Monto a cobrar ahora</label>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-4 py-3 focus-within:border-brand">
            <span className="text-ink-soft">S/</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={montoTexto}
              onChange={(e) => setMontoTexto(e.target.value)}
              className="money w-full bg-transparent text-lg font-semibold text-ink outline-none"
            />
          </div>
          {!montoValido && (
            <p className="mt-1.5 text-xs text-danger">
              Ingresa un monto mayor a 0 y hasta S/ {montoPendiente.toFixed(2)}.
            </p>
          )}
          {esAbonoParcial && (
            <p className="mt-1.5 text-xs text-brand">
              Es un abono parcial: quedara un saldo de S/ {saldoRestante.toFixed(2)} pendiente
              — la cuota no se marca como cobrada todavia, pero tampoco aparecera como morosa.
            </p>
          )}
        </div>

        {!metodo && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink mb-1">¿Como pago el cliente?</p>
            <button
              onClick={() => setMetodo(METODO_PAGO.YAPE)}
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-line bg-paper p-4 text-left active:border-brand transition-colors"
            >
              <span className="text-2xl">📱</span>
              <div>
                <p className="font-semibold text-ink">Yape</p>
                <p className="text-xs text-ink-soft">Requiere codigo de operacion</p>
              </div>
            </button>
            <button
              onClick={() => setMetodo(METODO_PAGO.EFECTIVO)}
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-line bg-paper p-4 text-left active:border-brand transition-colors"
            >
              <span className="text-2xl">💵</span>
              <div>
                <p className="font-semibold text-ink">Efectivo</p>
                <p className="text-xs text-ink-soft">Sin codigo, confirmacion directa</p>
              </div>
            </button>
          </div>
        )}

        {metodo === METODO_PAGO.YAPE && (
          <div>
            <button
              onClick={() => { setMetodo(null); setCodigo(''); setError(null); setAdvertencia(null) }}
              className="mb-4 text-sm text-ink-soft flex items-center gap-1"
            >
              ← Cambiar metodo
            </button>
            <label className="block text-sm font-medium text-ink mb-1">
              Codigo de operacion Yape
            </label>
            <input
              type="text"
              autoFocus
              value={codigo}
              onChange={(e) => handleCodigo(e.target.value)}
              placeholder="Ingresa el codigo del comprobante"
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 font-mono text-ink outline-none focus-visible:border-brand text-base"
            />
            {verificando && <p className="mt-2 text-xs text-ink-soft">Verificando...</p>}
            {advertencia && !verificando && (
              <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                ⚠ {advertencia}
              </p>
            )}
            {error && (
              <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <p className="mt-3 text-xs text-ink-soft">
              El cobro quedara "por verificar" hasta que el administrador
              confirme que el dinero llego a caja.
            </p>
            <button
              onClick={confirmar}
              disabled={!codigo.trim() || !!advertencia || verificando || enviando || !montoValido}
              className="mt-3 w-full rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {enviando ? 'Registrando...' : 'Registrar cobro Yape'}
            </button>
          </div>
        )}

        {metodo === METODO_PAGO.EFECTIVO && (
          <div>
            <button
              onClick={() => { setMetodo(null); setError(null) }}
              className="mb-4 text-sm text-ink-soft flex items-center gap-1"
            >
              ← Cambiar metodo
            </button>
            {error && (
              <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <p className="mb-3 text-xs text-ink-soft">
              El cobro quedara "por verificar" hasta que entregues el
              efectivo y el administrador lo confirme en caja.
            </p>
            <button
              onClick={confirmar}
              disabled={enviando || !montoValido}
              className="w-full rounded-xl bg-brand py-3.5 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
            >
              {enviando ? 'Registrando...' : 'Registrar cobro en efectivo'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatFecha(fecha) {
  if (!fecha) return '—'
  return new Date(fecha).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
