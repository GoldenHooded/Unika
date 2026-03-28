import { contextBridge, ipcRenderer, webFrame } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  selectUnityProject: (): Promise<string | null> => ipcRenderer.invoke('select-unity-project'),
  onPlayExitSound: (cb: () => void) => {
    ipcRenderer.on('play-exit-sound', cb)
    return () => ipcRenderer.removeListener('play-exit-sound', cb)
  },
  exitReady: () => ipcRenderer.send('exit-ready'),
  // UI scale — webFrame is only accessible from the preload context
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
})
