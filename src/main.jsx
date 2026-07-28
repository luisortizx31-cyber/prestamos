import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// registerType: 'autoUpdate' (ver vite.config.js) NO hace nada solo -
// necesita que la app llame a registerSW() para de verdad revisar si
// hay una version nueva y activarla sola. Sin esto (como estaba antes),
// el navegador quedaba atendido por el Service Worker viejo
// indefinidamente hasta cerrar TODAS las pestañas/instancias - en la
// laptop eso pasaba seguido sin darse cuenta (cerrar y reabrir la
// pestaña), pero en el celular con la app instalada y nunca cerrada del
// todo, se quedaba pegado con la version vieja.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // Revisa cada 60s si hay una version nueva - sin esto, una pestaña
    // que queda abierta mucho tiempo sin navegar nunca se entera de un
    // deploy nuevo hasta que la cierran y la vuelven a abrir.
    setInterval(() => registration.update(), 60 * 1000)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
