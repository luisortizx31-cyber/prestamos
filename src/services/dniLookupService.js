// ---------------------------------------------------------------------
// ADVERTENCIA DE SEGURIDAD - LEER ANTES DE TOCAR ESTE ARCHIVO
// ---------------------------------------------------------------------
// Este token queda visible para cualquiera en el codigo del navegador
// (F12 -> Sources, o "Ver codigo fuente"). Se acepto este riesgo de
// forma TEMPORAL porque la cuenta de apiperu.dev usada es el plan
// FREE: si alguien copia el token, en el peor caso se agota el cupo
// gratuito mensual de consultas — no genera ningun cargo de dinero.
//
// ANTES de pasar a un plan de pago en apiperu.dev, o antes de que esta
// app maneje produccion real con datos sensibles a mayor escala, esto
// DEBE migrarse a una Cloud Function (requiere activar el plan Blaze
// de Firebase) para que el token quede oculto en el servidor y nunca
// llegue al navegador del usuario.
// ---------------------------------------------------------------------
const APIPERU_TOKEN = import.meta.env.VITE_APIPERU_TOKEN

/**
 * Consulta un DNI contra RENIEC via apiperu.dev.
 *
 * IMPORTANTE sobre el plan FREE: los datos vuelven PARCIALMENTE
 * ENMASCARADOS (ej. "CA***INA" en vez de "CAROLINA"). Por eso esto se
 * usa solo como VALIDACION/CONFIRMACION de que el DNI existe — nunca
 * para autocompletar el campo de nombre automaticamente, ya que el
 * dato enmascarado no sirve como nombre real a guardar.
 *
 * Tambien puede no encontrar resultado para un DNI valido (la fuente
 * publica no siempre tiene el dato) — esto NUNCA debe bloquear el
 * registro del cliente, solo es informativo.
 *
 * @param {string} dni  8 digitos
 * @returns {Promise<{numero, nombre_completo, nombres, apellido_paterno, apellido_materno}>}
 */
export async function consultarDni(dni) {
  if (!APIPERU_TOKEN) {
    throw new Error('Falta configurar VITE_APIPERU_TOKEN en el .env')
  }

  const response = await fetch('https://apiperu.dev/api/dni', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${APIPERU_TOKEN}`,
    },
    body: JSON.stringify({ dni }),
  })

  const json = await response.json()

  if (!response.ok || !json.success) {
    throw new Error(json.message || 'No se encontro informacion para este DNI.')
  }

  return json.data
}
