import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? ''
const previewCommit = process.env.VERCEL_ENV === 'preview' && /^[a-f0-9]{40}$/.test(commit) ? commit : ''

if (previewCommit) console.info('Calori Preview · ' + previewCommit)

export default defineConfig({
  define: { __CALORI_PREVIEW_COMMIT__: JSON.stringify(previewCommit) },
  plugins: [react()],
})
