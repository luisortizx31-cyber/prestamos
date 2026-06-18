import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
