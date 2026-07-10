import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

// Se inicializa una sola vez por instancia de la funcion serverless
// (Vercel reutiliza el proceso entre invocaciones "calientes").
// FIREBASE_SERVICE_ACCOUNT_KEY es el JSON completo de la cuenta de
// servicio (Firebase Console > Configuracion del proyecto > Cuentas de
// servicio > Generar nueva clave privada), pegado como UNA sola linea
// en la variable de entorno de Vercel.
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  initializeApp({ credential: cert(serviceAccount) })
}

/**
 * Envia una notificacion push a todos los dispositivos del Maestro.
 * Requiere un idToken de Firebase Auth valido (de un comisionista o del
 * propio Maestro) para evitar que cualquiera use este endpoint para
 * mandar spam. El cuerpo del push lo arma el llamador (title/body).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo no permitido.' })
    return
  }

  const { idToken, title, body } = req.body || {}
  if (!idToken || !title) {
    res.status(400).json({ error: 'Faltan idToken y/o title.' })
    return
  }

  try {
    await getAuth().verifyIdToken(idToken)
  } catch {
    res.status(401).json({ error: 'idToken invalido o expirado.' })
    return
  }

  const db = getFirestore()
  const snapMaestros = await db.collection('usuarios').where('role', '==', 'master').get()

  const tokens = snapMaestros.docs.flatMap((d) => d.data().fcmTokens || [])
  console.log(`[enviar-notificacion] maestros encontrados: ${snapMaestros.size}, tokens: ${tokens.length}`)
  if (tokens.length === 0) {
    res.status(200).json({ enviados: 0, motivo: 'El Maestro no tiene notificaciones activadas.' })
    return
  }

  const respuesta = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
  })
  console.log(
    `[enviar-notificacion] exitosos: ${respuesta.successCount}, fallidos: ${respuesta.failureCount}`,
    JSON.stringify(respuesta.responses.map((r) => (r.success ? 'ok' : r.error?.code)))
  )

  // Limpieza: si un token quedo invalido (celular desinstalo la app,
  // permiso revocado, etc.), Firebase lo reporta aca — lo sacamos de
  // Firestore para no seguir intentando enviarle en el futuro.
  const tokensInvalidos = respuesta.responses
    .map((r, i) => (!r.success && esTokenInvalido(r.error) ? tokens[i] : null))
    .filter(Boolean)

  if (tokensInvalidos.length > 0) {
    await Promise.all(
      snapMaestros.docs.map((d) => {
        const restantes = (d.data().fcmTokens || []).filter((t) => !tokensInvalidos.includes(t))
        return restantes.length !== (d.data().fcmTokens || []).length
          ? d.ref.update({ fcmTokens: restantes })
          : null
      })
    )
  }

  res.status(200).json({ enviados: respuesta.successCount, fallidos: respuesta.failureCount })
}

function esTokenInvalido(error) {
  return (
    error?.code === 'messaging/registration-token-not-registered' ||
    error?.code === 'messaging/invalid-registration-token'
  )
}
