import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  crearPrestamoConCronograma,
  obtenerPrestamo,
  marcarPrestamoRenovado,
  listarPrestamosPorCliente,
} from '../../services/prestamosService'
import { listarCuotasDePrestamo } from '../../services/cuotasService'
import { calcularMontos, generarCronograma, descripcionSeguro } from '../../utils/calcularCronograma'
import { debeOfrecerRenovacion, obtenerPrestamoVigente } from '../../utils/renovacion'
import { TIPO_CUOTA, TIPO_CUOTA_LABELS, ESTADO_CUOTA } from '../../models/prestamo'

const HOY = new Date().toISOString().split('T')[0]

export default function RegistroPrestamo() {
  const { clienteId } = useParams()
  const [searchParams] = useSearchParams()
  const prestamoOrigenId = searchParams.get('renovarDe')
  const { usuarioAuth } = useAuth()
  const navigate = useNavigate()

  const [prestamoOrigen, setPrestamoOrigen] = useState(null)
  const [saldoPendienteAnterior, setSaldoPendienteAnterior] = useState(0)
  const [validando, setValidando] = useState(true)
  const [bloqueo, setBloqueo] = useState(null) // null | { motivo, prestamo }

  // Regla de negocio: un cliente solo puede tener UN prestamo vigente.
  // - Si pide un prestamo "nuevo" (sin renovarDe) y ya tiene uno vigente,
  //   se bloquea por completo (defensa ante quien escriba la URL a mano,
  //   ya que el boton ya esta oculto en DetalleCliente.jsx).
  // - Si viene a renovar (renovarDe), se valida que ese prestamo siga
  //   siendo elegible (sigue vigente, ya pago la 1ra cuota, no renovado).
  useEffect(() => {
    let activo = true
    async function validar() {
      setValidando(true)
      setBloqueo(null)
      try {
        if (prestamoOrigenId) {
          const origen = await obtenerPrestamo(prestamoOrigenId)
          if (!activo) return
          if (!debeOfrecerRenovacion(origen)) {
            setBloqueo({ motivo: 'renovacion_invalida' })
            return
          }
          const cuotas = await listarCuotasDePrestamo(prestamoOrigenId, usuarioAuth.uid)
          if (!activo) return
          // Solo se suma lo que el cliente AUN no pago. Las cuotas "por
          // verificar" ya fueron cobradas en la calle (solo falta que el
          // Maestro las confirme) — no deben volver a cobrarse de nuevo.
          const saldo = cuotas
            .filter((c) => c.estado === ESTADO_CUOTA.PENDIENTE)
            .reduce((acc, c) => acc + (c.monto || 0), 0)
          setPrestamoOrigen(origen)
          setSaldoPendienteAnterior(saldo)
        } else {
          const prestamos = await listarPrestamosPorCliente(clienteId)
          if (!activo) return
          const vigente = obtenerPrestamoVigente(prestamos)
          if (vigente) {
            setBloqueo({ motivo: 'ya_tiene_activo', prestamo: vigente })
          }
        }
      } catch (err) {
        console.error('[RegistroPrestamo] Validacion:', err)
        if (activo) setBloqueo({ motivo: 'error_validacion' })
      } finally {
        if (activo) setValidando(false)
      }
    }
    validar()
    return () => { activo = false }
  }, [prestamoOrigenId, clienteId])

  // Valores por defecto del negocio: la gran mayoria de prestamos son
  // semanales, 20% de interes, 4 cuotas — asi el comisionista solo
  // tipea el monto y registra, sin llenar todo a mano cada vez.
  const [form, setForm] = useState({
    montoPrestado: '',
    tasaInteres: '20',
    tipoCuota: TIPO_CUOTA.SEMANAL,
    numeroCuotas: '4',
    fechaInicio: HOY,
    fechaEspecifica: '',
  })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  // Preview en vivo: recalcula cada vez que cambia el formulario.
  // El seguro ya NO se ingresa a mano: calcularMontos() lo determina
  // solo segun la regla fija del negocio (3% o tarifa plana S/10).
  //
  // Si es una renovacion, el monto base para calcular interes y seguro
  // NO es solo lo que se ingresa en el campo: es ese dinero nuevo MAS
  // el saldo que el cliente todavia debia del prestamo anterior — asi
  // ambas deudas se funden en un solo prestamo nuevo.
  const preview = useMemo(() => {
    const montoNuevo = parseFloat(form.montoPrestado)
    const tasa = parseFloat(form.tasaInteres)
    const cuotas = parseInt(form.numeroCuotas)

    if (!montoNuevo || !tasa) return null

    const monto = montoNuevo + saldoPendienteAnterior

    try {
      const montos = calcularMontos(monto, tasa)

      const esFechaEspecifica = form.tipoCuota === TIPO_CUOTA.FECHA_ESPECIFICA
      if (!esFechaEspecifica && (!cuotas || cuotas < 1)) return { montos, cronograma: null }

      const cronograma = generarCronograma({
        montoTotalAPagar: montos.montoTotalAPagar,
        montoSeguro: montos.montoSeguro,
        tipoCuota: form.tipoCuota,
        numeroCuotas: esFechaEspecifica ? 1 : cuotas,
        fechaInicio: new Date(form.fechaInicio),
        fechaEspecifica: form.fechaEspecifica ? new Date(form.fechaEspecifica) : null,
      })
      return { montos, cronograma }
    } catch {
      return null
    }
  }, [form, saldoPendienteAnterior])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!preview?.cronograma) return
    setError(null)
    setEnviando(true)
    try {
      const montoNuevo = parseFloat(form.montoPrestado)
      const prestamoId = await crearPrestamoConCronograma({
        clienteId,
        comisionistaId: usuarioAuth.uid,
        // Si es renovacion, montoPrestado del prestamo NUEVO ya incluye
        // la deuda anterior pendiente — quedan fusionados en uno solo.
        montoPrestado: montoNuevo + saldoPendienteAnterior,
        tasaInteres: parseFloat(form.tasaInteres),
        tipoCuota: form.tipoCuota,
        numeroCuotas: parseInt(form.numeroCuotas) || 1,
        fechaInicio: new Date(form.fechaInicio),
        fechaEspecifica: form.fechaEspecifica ? new Date(form.fechaEspecifica) : null,
        prestamoOrigenId: prestamoOrigenId || null,
        montoEntregadoNuevo: prestamoOrigenId ? montoNuevo : null,
        saldoConsolidadoAnterior: prestamoOrigenId ? saldoPendienteAnterior : null,
      })

      // Si esto es una renovacion, cerramos el ciclo marcando el
      // prestamo anterior como renovado (no vuelve a ofrecerse, y queda
      // trazabilidad de cual prestamo nuevo lo reemplazo).
      if (prestamoOrigenId) {
        await marcarPrestamoRenovado(prestamoOrigenId, prestamoId)
      }

      navigate(`/prestamos/${prestamoId}/cuotas`)
    } catch (err) {
      console.error('[RegistroPrestamo]', err)
      setError('No se pudo registrar el prestamo. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const esFechaEspecifica = form.tipoCuota === TIPO_CUOTA.FECHA_ESPECIFICA
  const montoNuevoIngresado = parseFloat(form.montoPrestado) || 0
  // El seguro y el interes se calculan sobre el capital TOTAL (dinero
  // nuevo + deuda anterior fusionada), no solo sobre lo que se ingresa.
  const monto = montoNuevoIngresado + saldoPendienteAnterior

  if (validando) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft">
        Verificando...
      </div>
    )
  }

  if (bloqueo) {
    return (
      <PantallaBloqueo
        bloqueo={bloqueo}
        clienteId={clienteId}
        onVolver={() => navigate(-1)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <button
          onClick={() => navigate(-1)}
          className="text-ink-soft text-xl leading-none"
        >
          ←
        </button>
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase">
            {prestamoOrigenId ? 'Renovacion' : 'Nuevo prestamo'}
          </p>
          <h1 className="text-lg font-semibold text-ink">
            {prestamoOrigenId ? 'Renovar prestamo' : 'Registrar prestamo'}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
        {prestamoOrigen && (
          <div className="rounded-2xl border-2 border-gold bg-gold-soft p-4">
            <p className="text-sm font-semibold text-gold mb-1">⭐ Renovando prestamo anterior</p>
            <div className="text-sm text-gold/90 space-y-0.5">
              <p>
                Cuotas pagadas: {prestamoOrigen.cuotasPagadas || 0} de {prestamoOrigen.totalCuotas || 0}
              </p>
              <p className="money">
                Deuda pendiente que se suma: S/ {saldoPendienteAnterior.toFixed(2)}
              </p>
            </div>
            <p className="text-xs text-gold/70 mt-2">
              Esa deuda se sumara al dinero nuevo que ingreses abajo: se
              convertiran en un solo prestamo. El anterior quedara marcado
              como renovado y cerrado (ya no se podra cobrar de el).
            </p>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
              Condiciones del prestamo
            </h2>

            <Campo label={prestamoOrigenId ? 'Dinero nuevo a entregar (S/)' : 'Monto prestado (S/)'}>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={form.montoPrestado}
                onChange={(e) => set('montoPrestado', e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </Campo>

            {prestamoOrigenId && montoNuevoIngresado > 0 && (
              <p className="text-xs text-ink-soft -mt-2">
                Capital total del nuevo prestamo:{' '}
                <span className="money font-medium text-ink">S/ {monto.toFixed(2)}</span>
                {' '}(S/ {montoNuevoIngresado.toFixed(2)} nuevo + S/ {saldoPendienteAnterior.toFixed(2)} de deuda anterior)
              </p>
            )}

            {monto > 0 && (
              <p className="text-xs text-ink-soft -mt-2">
                Seguro automatico: <span className="font-medium text-ink">{descripcionSeguro(monto)}</span>
                {' '}(prestamos menores a S/ 330 pagan 3%; S/ 330 a mas, tarifa fija de S/ 10)
              </p>
            )}

            <Campo label="Tasa de interes %">
              <input
                type="number"
                min="0"
                step="0.1"
                required
                value={form.tasaInteres}
                onChange={(e) => set('tasaInteres', e.target.value)}
                placeholder="10"
                className={inputClass}
              />
            </Campo>

            <Campo label="Tipo de cuota">
              <select
                value={form.tipoCuota}
                onChange={(e) => set('tipoCuota', e.target.value)}
                className={inputClass}
              >
                {Object.entries(TIPO_CUOTA_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </Campo>

            {!esFechaEspecifica && (
              <Campo label="Numero de cuotas">
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={form.numeroCuotas}
                  onChange={(e) => set('numeroCuotas', e.target.value)}
                  placeholder="4"
                  className={inputClass}
                />
              </Campo>
            )}

            <Campo label="Fecha de inicio">
              <input
                type="date"
                required
                value={form.fechaInicio}
                onChange={(e) => set('fechaInicio', e.target.value)}
                className={inputClass}
              />
            </Campo>

            {esFechaEspecifica && (
              <Campo label="Fecha de pago unico">
                <input
                  type="date"
                  required
                  value={form.fechaEspecifica}
                  onChange={(e) => set('fechaEspecifica', e.target.value)}
                  className={inputClass}
                />
              </Campo>
            )}
          </section>

          {/* Preview en vivo */}
          {preview?.montos && (
            <section className="rounded-2xl border border-brand/30 bg-brand-soft p-5 space-y-3">
              <h2 className="text-sm font-semibold text-brand uppercase tracking-wide">
                Resumen del prestamo
              </h2>
              <div className="space-y-2 text-sm">
                <FilaResumen
                  label="Capital prestado"
                  valor={preview.montos.montoPrestado}
                  nota={prestamoOrigenId ? 'incluye deuda anterior fusionada' : undefined}
                />
                <FilaResumen
                  label={`Interes (${form.tasaInteres}%)`}
                  valor={preview.montos.montoInteres}
                />
                <FilaResumen
                  label={`Seguro (${descripcionSeguro(monto)})`}
                  valor={preview.montos.montoSeguro}
                  nota="incluido en la 1ra cuota"
                />
                <div className="border-t border-brand/20 pt-2">
                  <FilaResumen
                    label="Total a cobrar"
                    valor={preview.montos.montoTotalAPagar}
                    grande
                  />
                </div>
              </div>
            </section>
          )}

          {/* Cronograma preview */}
          {preview?.cronograma && (
            <section className="rounded-2xl border border-line bg-surface overflow-hidden">
              <div className="px-5 py-3 border-b border-line">
                <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
                  Cronograma de pagos
                </h2>
              </div>
              <ul className="divide-y divide-line">
                {preview.cronograma.map((c) => (
                  <li key={c.numero} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <span className="text-xs text-ink-soft mr-2">Cuota {c.numero}</span>
                      <span className="text-sm text-ink">
                        {formatFecha(c.fechaVencimiento)}
                      </span>
                      {c.numero === 1 && preview.montos.montoSeguro > 0 && (
                        <span className="ml-2 text-xs text-gold">+ seguro</span>
                      )}
                    </div>
                    <span className="money text-sm font-medium text-ink">
                      S/ {c.monto.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
          )}

          <p className="text-xs text-ink-soft text-center">
            El credito quedara "pendiente de aprobacion". No podras cobrar
            ninguna cuota hasta que el administrador lo apruebe.
          </p>

          <button
            type="submit"
            disabled={enviando || !preview?.cronograma}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {enviando ? 'Enviando...' : 'Enviar solicitud al administrador'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PantallaBloqueo({ bloqueo, clienteId, onVolver }) {
  const { motivo, prestamo } = bloqueo

  let titulo = 'No se puede registrar este prestamo'
  let detalle = 'Ocurrio un error al validar. Intenta de nuevo.'
  let accion = null

  if (motivo === 'ya_tiene_activo') {
    titulo = 'Este cliente ya tiene un prestamo activo'
    detalle =
      'Solo se puede tener un prestamo a la vez. Para prestarle mas dinero, ' +
      'hay que renovar el prestamo que ya tiene, no crear uno nuevo aparte.'
    if (debeOfrecerRenovacion(prestamo)) {
      accion = (
        <Link
          to={`/clientes/${clienteId}/prestamos/nuevo?renovarDe=${prestamo.id}`}
          className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-white"
        >
          ⭐ Renovar ese prestamo
        </Link>
      )
    } else {
      detalle += ' Podra renovarlo recien cuando pague (y se confirme) la primera cuota.'
    }
  } else if (motivo === 'renovacion_invalida') {
    titulo = 'Esta renovacion ya no es valida'
    detalle =
      'El prestamo que intentas renovar ya no esta disponible (puede que ' +
      'ya se renovo, ya se termino de pagar, o aun no tiene ninguna cuota confirmada).'
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-semibold text-ink">{titulo}</p>
      <p className="max-w-sm text-sm text-ink-soft">{detalle}</p>
      <div className="flex gap-3">
        <button
          onClick={onVolver}
          className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft"
        >
          ← Volver
        </button>
        {accion}
      </div>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      {children}
    </div>
  )
}

function FilaResumen({ label, valor, nota, grande }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className={grande ? 'font-semibold text-brand' : 'text-ink-soft'}>{label}</span>
        {nota && <span className="ml-2 text-xs text-ink-soft">({nota})</span>}
      </div>
      <span className={`money ${grande ? 'text-lg font-bold text-brand' : 'text-ink'}`}>
        S/ {valor.toFixed(2)}
      </span>
    </div>
  )
}

function formatFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink outline-none focus-visible:border-brand'
