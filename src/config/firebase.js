import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging'

// Todas las credenciales vienen de variables de entorno (.env / Vercel
// Environment Variables). Esto permite reutilizar el mismo código para
// conectar a DISTINTOS proyectos de Firebase (el del cliente hoy, y
// potencialmente otros tenants en el futuro) sin tocar una sola línea.
//
// IMPORTANTE: estas claves de Firebase para apps web NO son secretas por
// diseño (Google las documenta como públicas). La seguridad real del
// sistema vive en las Firestore Security Rules, no en ocultar este
// objeto. Aun así las mantenemos en variables de entorno por buenas
// prácticas, orden y facilidad para cambiar de proyecto sin tocar código.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.projectId) {
  // Falla rápido y con un mensaje claro en vez de un error críptico de
  // Firebase si alguien olvida configurar el .env o las env vars en Vercel.
  console.error(
    '[firebase] Faltan variables de entorno VITE_FIREBASE_*. ' +
      'Revisa tu archivo .env (local) o la configuración de Environment ' +
      'Variables en Vercel.'
  )
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

// Cloud Messaging (notificaciones push) no esta soportado en todos los
// navegadores (ej. Safari solo si la PWA esta instalada en pantalla de
// inicio), asi que se resuelve de forma perezosa y asincrona en vez de
// llamar getMessaging(app) directo, que rompe en los que no lo soportan.
export const messagingPromise = isMessagingSupported().then((soportado) =>
  soportado ? getMessaging(app) : null
)
