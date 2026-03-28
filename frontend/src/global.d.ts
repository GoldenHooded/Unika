interface ElectronAPI {
  openExternal: (url: string) => Promise<void>
  getAppVersion: () => Promise<string>
  selectUnityProject: () => Promise<string | null>
  onPlayExitSound: (cb: () => void) => (() => void)
  exitReady: () => void
  setZoomFactor: (factor: number) => void
  getZoomFactor: () => number
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
