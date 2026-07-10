import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { clientsClaim } from 'workbox-core'

// Con generateSW (estrategia anterior), vite-plugin-pwa inyectaba esto
// automaticamente. Con injectManifest (SW propio) hay que hacerlo a
// mano: sin esto, cuando se sube una version nueva del SW, el navegador
// la deja "esperando" y sigue sirviendo la version vieja cacheada hasta
// que se cierren TODAS las pestañas/instancias de la app — con esto, en
// cambio, el registerType:'autoUpdate' del cliente le manda un mensaje
// SKIP_WAITING a este SW apenas detecta la version nueva, y clientsClaim()
// hace que tome el control de inmediato en vez de esperar una recarga.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
clientsClaim()

// Precacheo normal de la PWA (mismo comportamiento que antes con
// generateSW): self.__WB_MANIFEST lo inyecta vite-plugin-pwa en build.
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.hostname === 'firestore.googleapis.com',
  new NetworkFirst({ cacheName: 'firebase-cache', networkTimeoutSeconds: 10 })
)

// --- Firebase Cloud Messaging: notificaciones push con la app cerrada ---
//
// Este mismo service worker (ya lo necesitamos para el precacheo de la
// PWA) tambien recibe los mensajes push de FCM en segundo plano.
// vite-plugin-pwa compila este archivo con un build real de Vite (usa
// injectManifest, no una copia literal), asi que import.meta.env.VITE_*
// SI se reemplaza en build time igual que en src/config/firebase.js —
// no hace falta hardcodear nada, y sigue funcionando el patron
// multi-tenant (mismo codigo, distinto proyecto de Firebase segun las
// env vars).
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {}
  self.registration.showNotification(title || 'Prestamos Jhairo', {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  })
})
