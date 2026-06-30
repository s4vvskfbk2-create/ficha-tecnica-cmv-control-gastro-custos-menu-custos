import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // exceljs/jspdf são carregados sob demanda (import dinâmico nos exports),
    // então o chunk grande deles não afeta o carregamento inicial do app.
    chunkSizeWarningLimit: 1000,
  },
})
