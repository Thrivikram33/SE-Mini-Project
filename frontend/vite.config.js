import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/, priority: 10 },
            { name: 'react-three-fiber', test: /[\\/]node_modules[\\/]@react-three[\\/]fiber[\\/]/, priority: 9 },
          ],
        },
      },
    },
  },
})
