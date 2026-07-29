// Cierre de sesion automatico por inactividad (30 minutos). Se guarda
// en localStorage (no en memoria) porque tiene que sobrevivir a cerrar
// la app/PWA por completo y volver a abrirla despues — el caso que
// motivo esto es justamente "cierro la app y al volver a entrar sigue
// logueado sin pedirme nada".
export const TIEMPO_INACTIVIDAD_MS = 30 * 60 * 1000

const CLAVE_ULTIMA_ACTIVIDAD = 'ultimaActividad'

export function registrarActividad() {
  localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now()))
}

export function limpiarActividad() {
  localStorage.removeItem(CLAVE_ULTIMA_ACTIVIDAD)
}

export function haPasadoElTiempoDeInactividad() {
  const ultima = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD))
  if (!ultima) return false
  return Date.now() - ultima > TIEMPO_INACTIVIDAD_MS
}
