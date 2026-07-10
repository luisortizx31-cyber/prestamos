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
  // El envio (ver api/enviar-notificacion.js) manda todo como "data", no
  // "notification" — evita que Chrome/Android auto-muestre una segunda
  // notificacion generica por su cuenta.
  const { title, body } = payload.data || {}
  self.registration.showNotification(title || 'Prestamos Jhairo', {
    body,
    icon: '/icon-192.png',
    // "badge" (icono chico monocromo de Android) necesita fondo
    // transparente para que el sistema lo recoloree solo — usar el
    // icono a color de arriba aca lo dejaba en blanco vacio.
    badge: '/badge-96.png',
    data: payload.data,
    // En algunos celulares/PWAs Firebase dispara el mismo mensaje tanto
    // en primer plano (onMessage, ver notificacionesPushService.js) como
    // en segundo plano (aca) — con el mismo "tag" (el messageId unico
    // del envio), la segunda llamada REEMPLAZA a la primera en vez de
    // mostrarse como una notificacion duplicada.
    tag: payload.messageId,
  })
})

// Al tocar la notificacion: enfoca una pestaña ya abierta de la app (y
// la manda a la url indicada, ej. /conciliacion para un cobro) o abre
// una nueva si no hay ninguna. Sin esto, tocar la notificacion no hacia
// nada mas que cerrarla.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existente = clientList.find((c) => 'focus' in c)
      if (existente) {
        existente.navigate(url)
        return existente.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
