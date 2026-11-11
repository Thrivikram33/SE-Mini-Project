import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import { validateProductionApiBaseUrl } from './scripts/transportSecurity.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = env.VITE_API_BASE_URL || ''
  if (mode === 'production') validateProductionApiBaseUrl(apiBaseUrl)

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': 'http://localhost:5000',
      },
    },
  }
})
