// "Truco" del correo virtual: Firebase Auth exige un email con formato
// valido para usuario/contraseña, pero nunca lo usa para enviar correos
// reales en este flujo (no hay reset de password por email, ni
// verificacion). Por eso podemos construir uno ficticio a partir del DNI
// y usarlo de forma transparente.
//
// El dominio es configurable por variable de entorno para que este
// mismo patron se pueda reutilizar con otros clientes sin tocar codigo.
// No necesita ser un dominio real registrado.
const DOMINIO_VIRTUAL = import.meta.env.VITE_AUTH_VIRTUAL_DOMAIN || 'usuarios.app'

export function construirCorreoVirtual(dni) {
  return `${dni.trim()}@${DOMINIO_VIRTUAL}`
}

// DNI peruano: 8 digitos numericos.
export function validarDni(dni) {
  return /^\d{8}$/.test(dni.trim())
}

// PIN numerico de 6 digitos. Firebase Auth exige un minimo de 6
// caracteres en la contraseña, asi que el PIN de 6 digitos cumple ese
// minimo por diseño y es facil de recordar para el personal de campo.
export function validarPin(pin) {
  return /^\d{6}$/.test(pin.trim())
}
