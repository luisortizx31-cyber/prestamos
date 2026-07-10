import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (en vez de generateSW): necesitamos un service
      // worker propio (src/sw.js) porque tiene que manejar tambien los
      // mensajes en segundo plano de Firebase Cloud Messaging (push de
      // "nueva solicitud" / "cobro por verificar" al Maestro), ademas
      // del precacheo normal de la PWA.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Prestamos Jhairo',
        short_name: 'Jhairo',
        description: 'Gestion de prestamos y cobranzas',
        theme_color: '#1e4d3d',
        background_color: '#1e4d3d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'es',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
