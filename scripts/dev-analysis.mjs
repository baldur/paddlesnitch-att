// Local dev for the analysis app: reuses att's cognito-local + shared .local-data,
// then runs `next dev` on :3001. Run `pnpm dev` (att, :3000) in another terminal
// first — it starts cognito-local and writes apps/att/.env.local, which this
// script mirrors so both apps share the same user pool + data store.
//
// Note: this serves the analysis app at http://localhost:3001/analyse. In prod a
// single CloudFront serves paddlesnitch.com/analyse; locally the two apps run on
// separate ports (log in on att :3000 first — the cookie is shared across ports).
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const attEnv = join(root, 'apps/att/.env.local')
if (!existsSync(attEnv)) {
  console.error('apps/att/.env.local not found — run `pnpm dev` (att) first to start cognito-local.')
  process.exit(1)
}
const cognito = readFileSync(attEnv, 'utf8').split('\n').filter(l => /^(COGNITO_|USE_LOCAL_STORAGE|NODE_ENV)/.test(l))
const dataDir = join(root, 'apps/att/.local-data')
const env = [
  ...cognito,
  `DATA_DIR=${dataDir}`,
  'LLM_BACKEND=ollama',
  'LLM_MODEL=llama3.2:3b',
  '',
].join('\n')
writeFileSync(join(root, 'apps/analysis/.env.local'), env)
console.log('[analysis] wrote apps/analysis/.env.local (shared cognito + data + ollama)')

spawn('pnpm', ['exec', 'next', 'dev', '--port', '3001'], {
  cwd: join(root, 'apps/analysis'), stdio: 'inherit',
})
