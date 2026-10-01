import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
    build: { outDir: 'dist' },
    server: {
        host: true,
        proxy: {
            "/api": "http://frontend:80",
            "/render": "http://frontend:80",
        },
    },
})
