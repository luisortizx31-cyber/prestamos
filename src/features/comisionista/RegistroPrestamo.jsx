import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import {
  crearPrestamoConCronograma,
  actualizarPrestamoConCronograma,
  obtenerPrestamo,
  marcarPrestamoRenovado,
  listarPrestamosPorCliente,
} from '../../services/prestamosService'
import { listarCuotasDePrestamo } from '../../services/cuotasService'
import { calcularMontos, generarCronograma, descripcionSeguro } from '../../utils/calcularCronograma'
import {
  debeOfrecerRenovacion,
  obtenerPrestamosVigentes,
  MAX_PRESTAMOS_VIGENTES,
} from '../../utils/renovacion'
import { TIPO_CUOTA, TIPO_CUOTA_LABELS, ESTADO_CUOTA, ESTADO_SOLICITUD } from '../../models/prestamo'

const HOY = new Date().toISOString().split('T')[0]

export default function RegistroPrestamo() {
  const { clienteId, prestamoId } = useParams()
  const esEdicion = Boolean(prestamoId)
  const [searchParams] = useSearchParams()
  const prestamoOrigenId = searchParams.get('renovarDe')
  const { usuarioAuth } = useAuth()
  const { esMaestro } = useRole()
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
        if (esEdicion) {
          const existente = await obtenerPrestamo(prestamoId)
          if (!activo) return
          if (!existente || existente.comisionistaId !== usuarioAuth.uid) {
            setBloqueo({ motivo: 'no_encontrado' })
            return
          }
          const cuotas = await listarCuotasDePrestamo(prestamoId, usuarioAuth.uid)
          if (!activo) return

          // El comisionista solo puede editar mientras sigue "pendiente"
          // (ahi nunca se pudo cobrar nada). El Maestro, en cambio, se
          // aprueba a si mismo al crear (autoAprobar) — para el, la
          // condicion real es que ninguna cuota tenga todavia un cobro
          // registrado (ni pagado ni por_verificar), sin importar el
          // estadoSolicitud.
          const sinCobros = cuotas.every((c) => c.estado === ESTADO_CUOTA.PENDIENTE)
          const puedeEditar = esMaestro
            ? sinCobros
            : existente.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE
          if (!puedeEditar) {
            setBloqueo({ motivo: 'no_editable' })
            return
          }

          const fecha = existente.fechaInicio?.toDate
            ? existente.fechaInicio.toDate()
            : new Date(existente.fechaInicio)
          const esFechaEspecificaExistente = existente.tipoCuota === TIPO_CUOTA.FECHA_ESPECIFICA
          const primeraCuota = cuotas.sort((a, b) => a.numero - b.numero)[0]
          const fechaEspecificaExistente =
            esFechaEspecificaExistente && primeraCuota
              ? primeraCuota.fechaVencimiento?.toDate
                ? primeraCuota.fechaVencimiento.toDate()
                : new Date(primeraCuota.fechaVencimiento)
              : null

          setForm({
            montoPrestado: String(existente.montoPrestado ?? ''),
            tasaInteres: String(existente.tasaInteres ?? ''),
            tipoCuota: existente.tipoCuota,
            numeroCuotas: String(existente.totalCuotas ?? ''),
            fechaInicio: fecha.toISOString().split('T')[0],
            fechaEspecifica: fechaEspecificaExistente
              ? fechaEspecificaExistente.toISOString().split('T')[0]
              : '',
            // calcularSeguro() nunca da 0 de forma natural (siempre cobra
            // algo, aunque sea la tarifa minima) — que el prestamo
            // guardado tenga montoSeguro 0 solo puede significar que se
            // eligio "sin seguro" al crearlo.
            sinSeguro: (existente.montoSeguro || 0) === 0,
          })
        } else if (prestamoOrigenId) {
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
          const vigentes = obtenerPrestamosVigentes(prestamos)
          // Mientras haya una solicitud pendiente de aprobacion, no se
          // puede registrar otra encima (sin importar cuantas vigentes
          // tenga en total).
          const pendiente = vigentes.find((p) => p.estadoSolicitud === ESTADO_SOLICITUD.PENDIENTE)
          if (pendiente) {
            setBloqueo({ motivo: 'tiene_pendiente', prestamos: vigentes })
          } else if (vigentes.length >= MAX_PRESTAMOS_VIGENTES) {
            setBloqueo({ motivo: 'ya_tiene_activo', prestamos: vigentes })
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
  }, [prestamoOrigenId, clienteId, esEdicion, prestamoId, esMaestro])

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
    sinSeguro: false,
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
      const montos = calcularMontos(monto, tasa, form.sinSeguro)

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
      if (esEdicion) {
        await actualizarPrestamoConCronograma(prestamoId, {
          clienteId,
          comisionistaId: usuarioAuth.uid,
          montoPrestado: parseFloat(form.montoPrestado),
          tasaInteres: parseFloat(form.tasaInteres),
          tipoCuota: form.tipoCuota,
          numeroCuotas: parseInt(form.numeroCuotas) || 1,
          fechaInicio: new Date(form.fechaInicio),
          fechaEspecifica: form.fechaEspecifica ? new Date(form.fechaEspecifica) : null,
          sinSeguro: form.sinSeguro,
        })
        navigate(`/prestamos/${prestamoId}/cuotas`)
        return
      }

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
        autoAprobar: esMaestro,
        sinSeguro: form.sinSeguro,
      })

      // Si esto es una renovacion, cerramos el ciclo marcando el
      // prestamo anterior como renovado (no vuelve a ofrecerse, y queda
      // trazabilidad de cual prestamo nuevo lo reemplazo).
      if (prestamoOrigenId) {
        await marcarPrestamoRenovado(prestamoOrigenId, prestamoId)
      }

      // replace + volverAlPanel: si tocan "atras" desde la pantalla de
      // cuotas, no tiene sentido volver a este formulario ya vacio (el
      // prestamo ya quedo creado) — que vuelvan directo a su panel.
      navigate(`/prestamos/${prestamoId}/cuotas`, {
        replace: true,
        state: { volverAlPanel: true },
      })
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
            {esEdicion ? 'Editar solicitud' : prestamoOrigenId ? 'Renovacion' : 'Nuevo prestamo'}
          </p>
          <h1 className="text-lg font-semibold text-ink">
            {esEdicion ? 'Editar prestamo' : prestamoOrigenId ? 'Renovar prestamo' : 'Registrar prestamo'}
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
          <section className="rounded-2xl border-2 border-line bg-surface p-5 space-y-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink uppercase tracking-wide">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-base">
                📋
              </span>
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
              <div className="-mt-2 space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={form.sinSeguro}
                    onChange={(e) => set('sinSeguro', e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                  Sin seguro para este prestamo
                </label>
                <p className="text-xs text-ink-soft">
                  {form.sinSeguro ? (
                    'Sin seguro (S/ 0.00)'
                  ) : (
                    <>
                      Seguro automatico:{' '}
                      <span className="font-medium text-ink">{descripcionSeguro(monto)}</span>
                      {' '}(prestamos menores a S/ 330 pagan 3%; S/ 330 a mas, tarifa fija de S/ 10)
                    </>
                  )}
                </p>
              </div>
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
            <section className="rounded-2xl border-2 border-brand bg-brand-soft p-5 space-y-3 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold text-brand uppercase tracking-wide">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/60 text-base">
                  💰
                </span>
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
                  label={form.sinSeguro ? 'Seguro (desactivado)' : `Seguro (${descripcionSeguro(monto)})`}
                  valor={preview.montos.montoSeguro}
                  nota={form.sinSeguro ? undefined : 'incluido en la 1ra cuota'}
                />
                <div className="rounded-xl border-2 border-brand bg-surface px-3 py-2.5 mt-1">
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
            <section className="rounded-2xl border-2 border-line bg-surface overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 bg-brand px-5 py-3">
                <span className="text-base">📅</span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                  Cronograma de pagos
                </h2>
              </div>
              <ul className="divide-y divide-line">
                {preview.cronograma.map((c) => (
                  <li
                    key={c.numero}
                    className="flex items-center justify-between px-5 py-3 odd:bg-paper/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
                        {c.numero}
                      </span>
                      <span className="text-sm text-ink">
                        {formatFecha(c.fechaVencimiento)}
                      </span>
                      {c.numero === 1 && preview.montos.montoSeguro > 0 && (
                        <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
                          + seguro
                        </span>
                      )}
                    </div>
                    <span className="money text-sm font-bold text-ink">
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
            {esEdicion
              ? esMaestro
                ? 'Los cambios se guardaran de inmediato.'
                : 'Los cambios se guardaran y la solicitud seguira pendiente de aprobacion del administrador.'
              : esMaestro
              ? 'Como sos el administrador, este credito queda aprobado automaticamente — no pasa por "Solicitudes".'
              : 'El credito quedara "pendiente de aprobacion". No podras cobrar ninguna cuota hasta que el administrador lo apruebe.'}
          </p>

          <button
            type="submit"
            disabled={enviando || !preview?.cronograma}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {enviando
              ? esEdicion ? 'Guardando...' : 'Enviando...'
              : esEdicion
              ? 'Guardar cambios'
              : esMaestro
              ? 'Registrar prestamo'
              : 'Enviar solicitud al administrador'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PantallaBloqueo({ bloqueo, clienteId, onVolver }) {
  const { motivo, prestamos } = bloqueo

  let titulo = 'No se puede registrar este prestamo'
  let detalle = 'Ocurrio un error al validar. Intenta de nuevo.'
  let accion = null

  if (motivo === 'tiene_pendiente') {
    titulo = 'Este cliente tiene una solicitud pendiente'
    detalle =
      'Ya tiene un prestamo esperando aprobacion del administrador. No se ' +
      'puede registrar otro hasta que esa solicitud se apruebe o se rechace.'
  } else if (motivo === 'ya_tiene_activo') {
    titulo = `Este cliente ya tiene ${prestamos.length} prestamos activos`
    detalle =
      `Como maximo puede tener ${MAX_PRESTAMOS_VIGENTES} prestamos a la vez. ` +
      'Para prestarle mas, hay que renovar alguno de los que ya tiene, no crear uno nuevo aparte.'
    const renovables = prestamos.filter(debeOfrecerRenovacion)
    if (renovables.length > 0) {
      accion = (
        <div className="flex flex-col gap-2">
          {renovables.map((p) => (
            <Link
              key={p.id}
              to={`/clientes/${clienteId}/prestamos/nuevo?renovarDe=${p.id}`}
              className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-white"
            >
              ⭐ Renovar S/ {(p.montoPrestado || 0).toFixed(2)}
            </Link>
          ))}
        </div>
      )
    } else {
      detalle += ' Podra renovar alguno recien cuando pague (y se confirme) su primera cuota.'
    }
  } else if (motivo === 'renovacion_invalida') {
    titulo = 'Esta renovacion ya no es valida'
    detalle =
      'El prestamo que intentas renovar ya no esta disponible (puede que ' +
      'ya se renovo, ya se termino de pagar, o aun no tiene ninguna cuota confirmada).'
  } else if (motivo === 'no_editable') {
    titulo = 'Este prestamo ya no se puede editar'
    detalle =
      'Ya tiene al menos un cobro registrado (o ya fue aprobado/rechazado ' +
      'por el administrador), asi que sus condiciones ya no se pueden modificar.'
  } else if (motivo === 'no_encontrado') {
    titulo = 'Prestamo no encontrado'
    detalle = 'No se encontro este prestamo o no te pertenece.'
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
