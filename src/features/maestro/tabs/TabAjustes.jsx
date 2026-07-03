import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { limpiarTodoElSistema } from '../../../services/resetService'
import {
  listarComisionistas,
  inhabilitarComisionista,
  habilitarComisionista,
} from '../../../services/comisionistasService'
import { reasignarClientesDeComisionista } from '../../../services/clientesService'
import { useAuth } from '../../../context/AuthContext'

const PALABRA_CONFIRMACION = 'BORRAR'

export default function TabAjustes() {
  const { usuarioAuth } = useAuth()
  const [palabra, setPalabra] = useState('')
  const [estado, setEstado] = useState('idle') // idle | cargando | ok | error
  const [error, setError] = useState(null)

  const [comisionistas, setComisionistas] = useState([])
  const [cargandoComisionistas, setCargandoComisionistas] = useState(true)
  const [errorComisionistas, setErrorComisionistas] = useState(null)
  const [expandido, setExpandido] = useState(null) // uid del comisionista abierto (acordeon)

  async function cargarComisionistas() {
    setCargandoComisionistas(true)
    setErrorComisionistas(null)
    try {
      const data = await listarComisionistas()
      setComisionistas(data)
    } catch (err) {
      console.error('[TabAjustes] Error al listar comisionistas:', err)
      setErrorComisionistas('No se pudieron cargar los comisionistas.')
    } finally {
      setCargandoComisionistas(false)
    }
  }

  useEffect(() => {
    cargarComisionistas()
  }, [])

  async function handleLimpiar() {
    if (palabra !== PALABRA_CONFIRMACION) return
    setEstado('cargando')
    setError(null)
    try {
      await limpiarTodoElSistema()
      setEstado('ok')
      setPalabra('')
    } catch (err) {
      console.error('[TabAjustes] Error al limpiar:', err)
      setError(err.message || 'Ocurrió un error inesperado.')
      setEstado('error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">Ajustes del sistema</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Herramientas de administración avanzadas.
        </p>
      </div>

      {/* Mi cuenta */}
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5">
        <div>
          <h3 className="text-base font-semibold text-ink">Mi cuenta</h3>
          <p className="mt-1 text-xs text-ink-soft">Cambia tu propio PIN de acceso.</p>
        </div>
        <Link
          to="/cambiar-pin"
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft"
        >
          Cambiar PIN
        </Link>
      </div>

      {/* Comisionistas: acordeon, clave de acceso e inhabilitar */}
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-ink">Comisionistas registrados</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Toca un nombre para ver sus datos completos, su clave (PIN) de
            acceso, o inhabilitarlo.
          </p>
        </div>

        {cargandoComisionistas && <p className="text-sm text-ink-soft">Cargando…</p>}
        {errorComisionistas && <p className="text-sm text-danger">{errorComisionistas}</p>}

        {!cargandoComisionistas && !errorComisionistas && comisionistas.length === 0 && (
          <p className="text-sm text-ink-soft">Todavia no hay comisionistas registrados.</p>
        )}

        {!cargandoComisionistas && !errorComisionistas && comisionistas.length > 0 && (
          <ul className="space-y-2">
            {comisionistas.map((c) => {
              const uid = c.uid ?? c.id
              return (
                <FilaComisionista
                  key={uid}
                  comisionista={c}
                  abierto={expandido === uid}
                  onToggle={() => setExpandido((prev) => (prev === uid ? null : uid))}
                  maestroUid={usuarioAuth?.uid}
                  onCambio={cargarComisionistas}
                />
              )
            })}
          </ul>
        )}
      </div>

      {/* Zona de peligro */}
      <div className="rounded-2xl border border-danger/40 bg-danger/5 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-danger uppercase tracking-wide">
            Zona de peligro
          </p>
          <h3 className="mt-1 text-base font-semibold text-ink">
            Reiniciar todo el sistema
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Elimina <strong>todos los comisionistas</strong> (perfil Firestore),{' '}
            <strong>todos los clientes</strong>, <strong>todos los préstamos</strong> y
            sus cuotas, y los códigos Yape registrados. El usuario Maestro no se
            elimina.
          </p>
          <p className="mt-2 text-xs text-ink-soft bg-paper rounded-lg px-3 py-2 border border-line">
            Nota: las cuentas de acceso de los comisionistas (Firebase Auth) quedan
            inactivas pero no se eliminan. Si necesitas volver a registrar un comisionista
            con el mismo DNI, elimina su cuenta desde la consola de Firebase.
          </p>
        </div>

        {estado === 'ok' ? (
          <div className="rounded-xl bg-success/10 border border-success/30 px-4 py-3 text-sm text-success font-medium">
            Sistema reiniciado correctamente. Ya puedes empezar desde cero.
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm text-ink-soft mb-1">
                Escribe <span className="font-mono font-bold text-danger">{PALABRA_CONFIRMACION}</span> para confirmar
              </label>
              <input
                type="text"
                value={palabra}
                onChange={(e) => {
                  setPalabra(e.target.value)
                  if (estado === 'error') setEstado('idle')
                }}
                placeholder={PALABRA_CONFIRMACION}
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-danger/40"
                disabled={estado === 'cargando'}
              />
            </div>

            {estado === 'error' && (
              <p className="text-sm text-danger">{error}</p>
            )}

            <button
              onClick={handleLimpiar}
              disabled={palabra !== PALABRA_CONFIRMACION || estado === 'cargando'}
              className="w-full rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {estado === 'cargando' ? 'Limpiando datos…' : 'Reiniciar sistema completo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function FilaComisionista({ comisionista: c, abierto, onToggle, maestroUid, onCambio }) {
  const uid = c.uid ?? c.id
  const inhabilitado = c.activo === false

  const [claveVisible, setClaveVisible] = useState(false)
  const [mostrarFormInhabilitar, setMostrarFormInhabilitar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [errorAccion, setErrorAccion] = useState(null)
  const [resultado, setResultado] = useState(null)

  async function handleInhabilitar() {
    setProcesando(true)
    setErrorAccion(null)
    try {
      await inhabilitarComisionista(uid, motivo)
      const cantidad = await reasignarClientesDeComisionista(uid, maestroUid)
      setResultado(
        cantidad > 0
          ? `Comisionista inhabilitado. ${cantidad} cliente${cantidad === 1 ? '' : 's'} pasaron a tu cuenta (Mi Cartera).`
          : 'Comisionista inhabilitado.'
      )
      setMostrarFormInhabilitar(false)
      setMotivo('')
      onCambio()
    } catch (err) {
      console.error('[TabAjustes] Error al inhabilitar:', err)
      setErrorAccion('No se pudo inhabilitar. Intenta de nuevo.')
    } finally {
      setProcesando(false)
    }
  }

  async function handleHabilitar() {
    setProcesando(true)
    setErrorAccion(null)
    try {
      await habilitarComisionista(uid)
      setResultado(null)
      onCambio()
    } catch (err) {
      console.error('[TabAjustes] Error al habilitar:', err)
      setErrorAccion('No se pudo habilitar. Intenta de nuevo.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <li className="rounded-xl border border-line bg-paper overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-ink truncate">{c.nombre}</span>
          {inhabilitado && (
            <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
              Inhabilitado
            </span>
          )}
        </span>
        <span className={`shrink-0 text-ink-soft transition-transform ${abierto ? 'rotate-180' : ''}`}>
          ⌄
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-line px-4 py-3 text-sm">
          <FilaDato label="DNI" valor={c.dni} />
          <FilaDato label="Telefono" valor={c.telefono || '—'} />
          <FilaDato label="Direccion" valor={c.direccion || '—'} />

          <div className="flex items-center justify-between">
            <span className="text-ink-soft">Clave (PIN)</span>
            <span className="flex items-center gap-2">
              <span className="font-mono font-medium text-ink">
                {claveVisible ? (c.pin || '—') : '••••••'}
              </span>
              <button
                type="button"
                onClick={() => setClaveVisible((v) => !v)}
                className="rounded-lg border border-line px-2 py-0.5 text-xs text-ink-soft active:scale-95 transition-transform"
              >
                {claveVisible ? 'Ocultar' : 'Ver clave'}
              </button>
            </span>
          </div>

          {inhabilitado && c.motivoInhabilitacion && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              Motivo: {c.motivoInhabilitacion}
            </p>
          )}

          {resultado && (
            <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">{resultado}</p>
          )}
          {errorAccion && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{errorAccion}</p>
          )}

          {inhabilitado ? (
            <button
              type="button"
              onClick={handleHabilitar}
              disabled={procesando}
              className="w-full rounded-lg border border-success/40 bg-success-soft py-2 text-sm font-medium text-success disabled:opacity-50"
            >
              {procesando ? 'Habilitando…' : 'Habilitar de nuevo'}
            </button>
          ) : mostrarFormInhabilitar ? (
            <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
              <label className="block text-xs font-medium text-ink">
                Motivo (para que quede el registro)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ej: dejo de trabajar con nosotros"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:border-danger"
              />
              <p className="text-xs text-ink-soft">
                Ya no podra entrar a la app. Sus clientes pasaran automaticamente
                a tu cuenta (los veras en la pestaña "Mi Cartera").
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMostrarFormInhabilitar(false)
                    setMotivo('')
                  }}
                  className="flex-1 rounded-lg border border-line py-2 text-sm text-ink-soft"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleInhabilitar}
                  disabled={procesando}
                  className="flex-1 rounded-lg bg-danger py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {procesando ? 'Inhabilitando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarFormInhabilitar(true)}
              className="w-full rounded-lg border border-danger/40 py-2 text-sm font-medium text-danger active:scale-[0.99] transition-transform"
            >
              Inhabilitar comisionista
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function FilaDato({ label, valor }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium text-ink">{valor}</span>
    </div>
  )
}
