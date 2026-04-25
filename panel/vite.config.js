import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Göreceli yerine kök dizin kullanıyoruz (Sunucu / react-router uyumu için)
  server: {
    proxy: {
      '/api': 'http://localhost:3002'
    }
  },
  build: {
    outDir: 'dist_v4',
    emptyOutDir: true
  }
})
