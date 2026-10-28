import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Actions define BASE_PATH con el nombre del repositorio.
// Para desarrollo local se usa /.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
})