import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Serves the Vercel function api/parse-rule.js during `npm run dev`,
// so local dev needs only ANTHROPIC_API_KEY in .env (no `vercel dev`).
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-rule', async (req, res) => {
        let raw = ''
        for await (const chunk of req) raw += chunk
        const { default: handler } = await server.ssrLoadModule('/api/parse-rule.js')
        const shim = {
          status(code) { res.statusCode = code; return shim },
          json(body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) },
        }
        let body = {}
        try { body = JSON.parse(raw || '{}') } catch { return shim.status(400).json({ error: 'Invalid JSON.' }) }
        await handler({ method: req.method, body }, shim)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'ANTHROPIC_'))
  return { plugins: [react(), devApi()] }
})
