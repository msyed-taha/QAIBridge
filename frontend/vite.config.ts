import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// When running with Docker:  BACKEND_HOST=backend
// When running directly:     BACKEND_HOST=localhost  (default)
const BACKEND_HOST = process.env.BACKEND_HOST ?? 'localhost'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: `http://${BACKEND_HOST}:8000`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${BACKEND_HOST}:8000`,
        ws: true,
      },
    },
  },
})
