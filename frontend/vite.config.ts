import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/ifoaalerts/',
    plugins: [react()],
    server: {
        port: 5173,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            }
        }
    },
    optimizeDeps: {
        include: ['react-map-gl/maplibre', 'maplibre-gl'],
        esbuildOptions: {
            target: 'es2022'
        }
    },
    build: {
        target: 'es2022'
    }
})
