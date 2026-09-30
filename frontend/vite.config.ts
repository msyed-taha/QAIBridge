import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// When running with Docker:  BACKEND_HOST=backend
// When running directly:     BACKEND_HOST=localhost  (default)
const BACKEND_HOST = process.env.BACKEND_HOST ?? 'localhost'

// The live web address, used for link-preview images in index.html
// (WhatsApp, LinkedIn etc. need a full URL). Set it when building for the
// real site, e.g.  SITE_URL=https://qaibridge.com npm run build
// Left empty, the preview image falls back to a relative path.
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replace(/__SITE_URL__/g, SITE_URL),
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: `http://${BACKEND_HOST}:8000`,
        changeOrigin: true,
        xfwd: true, // pass the visitor's IP on (X-Forwarded-For) — the contact form rate-limits by it
        ws: true,   // live progress sockets (/api/kernel/ws/…, /api/dashboard/ws/…)
      },
      '/ws': {
        target: `ws://${BACKEND_HOST}:8000`,
        ws: true,
      },
    },
  },
})
