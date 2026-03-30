import { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn, exec, ChildProcess } from 'child_process'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
let isQuitting = false

function killBackend() {
  if (!backendProcess || backendProcess.exitCode !== null) return
  const pid = backendProcess.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    // Kill entire process tree on Windows (includes Python child processes)
    exec(`taskkill /F /T /PID ${pid}`, () => {})
  } else {
    backendProcess.kill('SIGTERM')
  }
}

const isDev = !app.isPackaged

function resolveIcon(): string | undefined {
  // In dev: public/icon.png relative to project root
  // In prod: resources/icon.png bundled by electron-builder
  const candidates = [
    join(__dirname, '../../public/icon.png'),          // dev (dist-electron/../public)
    join(__dirname, '../../../public/icon.png'),        // dev alt
    join(process.resourcesPath ?? '', 'icon.png'),     // packaged
    join(__dirname, '../../resources/icon.png'),        // packaged alt
  ]
  return candidates.find(p => existsSync(p))
}

function createWindow() {
  const preloadPath = join(__dirname, '../preload/index.mjs')
  const iconPath    = resolveIcon()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#222427',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#191919',
      symbolColor: '#9ca3af',
      height: 28,  // match React h-7 (28px)
    },
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  if (isDev) {
    const url = process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'
    mainWindow.loadURL(url)
    // En dev: mostrar ventana inmediatamente, sin esperar ready-to-show
    mainWindow.show()
    // DevTools solo si se pide explícitamente (F12 o variable de entorno)
    if (process.env['OPEN_DEVTOOLS'] === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    mainWindow.once('ready-to-show', () => mainWindow?.show())
  }

  mainWindow.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    // Ask renderer to play exit sound, then quit
    mainWindow?.webContents.send('play-exit-sound')
    // Fallback: force quit after 3 s if renderer doesn't respond
    setTimeout(() => { isQuitting = true; app.quit() }, 3000)
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

function startBackend() {
  if (app.isPackaged) {
    // Packaged: backend compiled to a standalone exe by PyInstaller
    const resourcesPath = process.resourcesPath ?? join(__dirname, '..')
    const backendExe    = join(resourcesPath, 'unika-agent', 'unika-agent.exe')
    backendProcess = spawn(backendExe, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env:  { ...process.env },
      cwd:  resourcesPath,
    })
  } else {
    // Development: pre-compile bytecode (no-op if already up to date), then start
    const projectRoot  = join(__dirname, '../../..')
    const backendScript = join(projectRoot, 'backend', 'server.py')
    // Compile silently in background — won't block window creation since we poll /health
    exec(`python -m compileall -q "${join(projectRoot, 'backend')}"`, { cwd: projectRoot }, () => {})
    backendProcess = spawn('python', [backendScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: projectRoot,
    })
  }

  backendProcess.stdout?.on('data', (d) => process.stdout.write(`[Backend] ${d}`))
  backendProcess.stderr?.on('data', (d) => process.stderr.write(`[Backend] ${d}`))
  backendProcess.on('exit', (code) => console.log(`[Backend] exited with code ${code}`))
}

function waitForBackend(onReady: () => void, maxWaitMs = 15000) {
  const { request } = require('http') as typeof import('http')
  const interval = 150
  let elapsed = 0
  const poll = () => {
    const req = request({ host: '127.0.0.1', port: 8765, path: '/health', method: 'GET' }, (res) => {
      if (res.statusCode === 200) {
        onReady()
      } else {
        retry()
      }
    })
    req.on('error', retry)
    req.end()
  }
  const retry = () => {
    elapsed += interval
    if (elapsed >= maxWaitMs) { onReady(); return } // fallback: open anyway
    setTimeout(poll, interval)
  }
  poll()
}

app.whenReady().then(() => {
  // Set app icon (macOS dock; Windows taskbar uses BrowserWindow icon)
  const iconPath = resolveIcon()
  if (iconPath) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) {
      if (process.platform === 'darwin') app.dock?.setIcon(img)
    }
  }

  startBackend()
  waitForBackend(createWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    killBackend()
    app.quit()
  }
})

// Renderer signals it's ready to quit (after playing exit sound)
ipcMain.on('exit-ready', () => {
  isQuitting = true
  killBackend()
  app.quit()
})

ipcMain.handle('open-external', (_, url: string) => shell.openExternal(url))
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('select-unity-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Seleccionar proyecto Unity',
    properties: ['openDirectory'],
    buttonLabel: 'Abrir proyecto',
  })
  return result.canceled ? null : result.filePaths[0]
})
