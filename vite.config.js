/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Stamped into the app at build time so a new version can be recorded in System
// Logs with the commit and person behind it. Only present on Vercel builds.
const build = {
  sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
  message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
  author: process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN || process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME || null,
  env: process.env.VERCEL_ENV || null,
  builtAt: new Date().toISOString(),
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __BUILD__: JSON.stringify(build) },
})
