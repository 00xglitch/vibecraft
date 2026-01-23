import { defineConfig } from 'vite'
import { resolve } from 'path'
import { DEFAULTS } from './shared/defaults'

const clientPort = parseInt(process.env.VIBECRAFT_CLIENT_PORT ?? String(DEFAULTS.CLIENT_PORT), 10)
const serverPort = parseInt(process.env.VIBECRAFT_PORT ?? String(DEFAULTS.SERVER_PORT), 10)

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  define: {
    // Inject default port into frontend at build time
    __VIBECRAFT_DEFAULT_PORT__: serverPort,
  },
  server: {
    port: clientPort,
    host: '0.0.0.0', // Bind to all interfaces for Docker
    proxy: {
      '/ws': {
        target: `ws://localhost:${serverPort}`,
        ws: true,
      },
      '/api': {
        target: `http://localhost:${serverPort}`,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/sessions': {
        target: `http://localhost:${serverPort}`,
      },
      '/opencode': {
        target: `http://localhost:${serverPort}`,
      },
      '/health': {
        target: `http://localhost:${serverPort}`,
      },
      '/tiles': {
        target: `http://localhost:${serverPort}`,
      },
      '/stats': {
        target: `http://localhost:${serverPort}`,
      },
      '/event': {
        target: `http://localhost:${serverPort}`,
      },
      '/prompt': {
        target: `http://localhost:${serverPort}`,
      },
      '/voice': {
        target: `http://localhost:${serverPort}`,
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
})
