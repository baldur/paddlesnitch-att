#!/usr/bin/env tsx
/**
 * One-command dev stack:
 *   1. start cognito-local on :9229 (if not already running)
 *   2. create pool + client + .env.local (idempotent)
 *   3. start `next dev` and stream its output
 *   4. on Ctrl+C, kill both children cleanly
 *
 * Usage:  pnpm dev
 */
import { spawn, ChildProcess } from 'child_process'
import { createConnection } from 'net'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const COGNITO_PORT = 9229

const COLOURS = {
  cognito: '\x1b[36m',  // cyan
  next: '\x1b[35m',     // magenta
  info: '\x1b[33m',     // yellow
  reset: '\x1b[0m',
}

function tag(label: keyof typeof COLOURS, line: string): string {
  return `${COLOURS[label]}[${label}]${COLOURS.reset} ${line}`
}

function log(label: keyof typeof COLOURS, message: string) {
  process.stdout.write(tag(label, message) + '\n')
}

function pipeWithTag(stream: NodeJS.ReadableStream, label: keyof typeof COLOURS, dest: NodeJS.WriteStream) {
  let buffer = ''
  stream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      if (line) dest.write(tag(label, line) + '\n')
    }
  })
  stream.on('end', () => {
    if (buffer) dest.write(tag(label, buffer) + '\n')
  })
}

function portInUse(port: number, host = 'localhost'): Promise<boolean> {
  return new Promise(resolve => {
    const s = createConnection({ port, host })
    s.once('connect', () => { s.destroy(); resolve(true) })
    s.once('error', () => { resolve(false) })
  })
}

function waitForLine(proc: ChildProcess, match: string, timeoutMs = 10000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${match}"`)), timeoutMs)
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes(match)) {
        clearTimeout(t)
        resolve()
      }
    }
    proc.stdout?.on('data', onData)
    proc.on('exit', code => { clearTimeout(t); reject(new Error(`process exited with ${code} before ready`)) })
  })
}

function runOnce(cmd: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' })
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`)))
  })
}

async function main() {
  let cognito: ChildProcess | null = null

  if (await portInUse(COGNITO_PORT)) {
    log('info', `cognito-local already running on :${COGNITO_PORT}, reusing it`)
  } else {
    log('info', `starting cognito-local on :${COGNITO_PORT}`)
    cognito = spawn(
      'node',
      [require.resolve('cognito-local/lib/bin/start.js')],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    pipeWithTag(cognito.stdout!, 'cognito', process.stdout)
    pipeWithTag(cognito.stderr!, 'cognito', process.stderr)
    await waitForLine(cognito, 'Cognito Local running')
  }

  log('info', 'initialising pool/client (idempotent)')
  await runOnce('npx', ['tsx', '--env-file-if-exists=.env.local', 'scripts/cognito-init.ts'])

  log('info', 'starting next dev')
  const next = spawn('npx', ['next', 'dev'], { stdio: 'inherit' })

  const cleanup = (code: number) => {
    if (cognito && !cognito.killed) cognito.kill('SIGTERM')
    if (!next.killed) next.kill('SIGTERM')
    process.exit(code)
  }

  process.on('SIGINT', () => cleanup(0))
  process.on('SIGTERM', () => cleanup(0))
  next.on('exit', code => cleanup(code ?? 0))
  cognito?.on('exit', code => {
    log('info', `cognito-local exited (${code}), shutting down dev server`)
    cleanup(code ?? 1)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
