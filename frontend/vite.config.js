import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const frontendDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendDir, ['API_BASE_URL', 'GOOGLE_CLIENT_ID'])

  return {
    plugins: [react()],
    envPrefix: [],
    define: {
      'import.meta.env.API_BASE_URL': JSON.stringify(env.API_BASE_URL ?? ''),
      'import.meta.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID ?? ''),
    },
  }
})
