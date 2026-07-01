// ---------------------------------------------------------------------
// ADVERTENCIA DE SEGURIDAD - LEER ANTES DE TOCAR ESTE ARCHIVO
// ---------------------------------------------------------------------
// Este token queda visible en el codigo del navegador (F12 -> Sources).
// Migrarlo a una Cloud Function (plan Blaze de Firebase) ocultaria el
// token en el servidor. Por ahora se acepta el riesgo: si alguien lo
// copia, solo consume creditos de la cuenta de VerificaPE.
// ---------------------------------------------------------------------
const VERIFICAPE_TOKEN = import.meta.env.VITE_APIPERU_TOKEN

/**
 * Consulta un DNI contra RENIEC via VerificaPE (api.verificape.com).
 * Devuelve datos completos y sin enmascarar (plan live).
 *
 * Puede no encontrar resultado para un DNI valido — esto NUNCA debe
 * bloquear el registro del cliente, solo es informativo.
 *
 * @param {string} dni  8 digitos
 * @returns {Promise<{dni, fullName, names, paternalSurname, maternalSurname, birthDate, gender, source}>}
 */
export async function consultarDni(dni) {
  if (!VERIFICAPE_TOKEN) {
    throw new Error('Falta configurar VITE_APIPERU_TOKEN en el .env')
  }

  const response = await fetch(`https://api.verificape.com/v2/dni/${dni}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${VERIFICAPE_TOKEN}`,
    },
  })

  const json = await response.json()

  if (!response.ok || !json.success) {
    throw new Error(json.message || 'No se encontro informacion para este DNI.')
  }

  return json.data
}
