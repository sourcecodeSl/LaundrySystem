// One-command dev launcher: `npm run dev` from the project root.
// 1. Starts XAMPP MySQL if nothing is listening on port 3306 (left running afterwards, like the XAMPP panel).
// 2. Runs the Laravel API (http://127.0.0.1:8000) and the Vite frontend (http://localhost:5173).
// Ctrl+C stops the backend and frontend.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const xampp = process.env.XAMPP_PATH ?? 'C:\\xampp'
const php = process.env.PHP_BINARY ?? (existsSync(path.join(xampp, 'php', 'php.exe')) ? path.join(xampp, 'php', 'php.exe') : 'php')
const isWin = process.platform === 'win32'

const colors = { mysql: 33, api: 35, web: 36, dev: 32 }
const log = (name, msg) => process.stdout.write(`\x1b[${colors[name]}m[${name}]\x1b[0m ${msg}\n`)

const portOpen = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const s = net.connect({ port, host })
  s.setTimeout(800)
  s.once('connect', () => { s.destroy(); resolve(true) })
  s.once('timeout', () => { s.destroy(); resolve(false) })
  s.once('error', () => resolve(false))
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensureMysql() {
  if (await portOpen(3306)) return log('mysql', 'already running on :3306')
  const bin = path.join(xampp, 'mysql', 'bin')
  const mysqld = path.join(bin, isWin ? 'mysqld.exe' : 'mysqld')
  if (!existsSync(mysqld)) {
    log('mysql', `not running and ${mysqld} not found — start MySQL manually (or set XAMPP_PATH)`)
    return
  }
  log('mysql', 'starting XAMPP MySQL…')
  const child = spawn(mysqld, ['--defaults-file=' + path.join(bin, 'my.ini'), '--standalone'], {
    cwd: bin, detached: true, stdio: 'ignore', windowsHide: true,
  })
  child.unref()
  for (let i = 0; i < 120; i++) {
    if (await portOpen(3306)) return log('mysql', 'ready on :3306')
    await sleep(500)
  }
  log('mysql', `did not come up within 60s — check ${path.join(xampp, 'mysql', 'data', 'mysql_error.log')}`)
}

const children = []
function run(name, cmd, args, cwd) {
  const useShell = isWin && cmd === 'npm'
  const child = useShell
    ? spawn([cmd, ...args].join(' '), { cwd, shell: true, env: process.env })
    : spawn(cmd, args, { cwd, env: process.env })
  children.push(child)
  const pipe = (stream) => {
    let buf = ''
    stream.on('data', (d) => {
      buf += d.toString()
      const lines = buf.split(/\r?\n/)
      buf = lines.pop()
      lines.filter((l) => l.trim()).forEach((l) => log(name, l))
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)
  child.on('exit', (code) => {
    log(name, `exited (${code})`)
    shutdown(code ?? 0)
  })
  return child
}

let stopping = false
function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const c of children) {
    if (c.exitCode !== null) continue
    if (isWin) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' })
    else c.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 500)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Pre-flight checks
const backend = path.join(root, 'backend')
const frontend = path.join(root, 'frontend')
if (!existsSync(path.join(backend, 'vendor'))) log('dev', 'backend/vendor missing — run: npm run setup')
if (!existsSync(path.join(frontend, 'node_modules'))) log('dev', 'frontend/node_modules missing — run: npm run setup')
for (const [port, name] of [[8000, 'api'], [5173, 'web']]) {
  if (await portOpen(port)) {
    log(name, `port ${port} is already in use — stop the other process first`)
    process.exit(1)
  }
}

await ensureMysql()
run('api', php, ['artisan', 'serve', '--host=127.0.0.1', '--port=8000'], backend)
for (let i = 0; i < 60 && !(await portOpen(8000)); i++) await sleep(500) // let the API boot first
run('web', 'npm', ['run', 'dev'], frontend)
log('dev', 'open http://localhost:5173  (Ctrl+C to stop)')
