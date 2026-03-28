import React from 'react'
import { useUnityStore } from '../../stores/unityStore'
import { Loader2 } from 'lucide-react'

export function UnityStatus() {
  const connected       = useUnityStore(s => s.connected)
  const activeScene     = useUnityStore(s => s.activeScene)
  const indexing        = useUnityStore(s => s.indexing)
  const pluginInstalled = useUnityStore(s => s.pluginInstalled)

  return (
    <div className="flex items-center gap-2 px-3 text-[10px]" style={{ color: '#888' }}>
      {indexing && (
        <span className="flex items-center gap-1" style={{ color: '#3d85c8' }}>
          <Loader2 size={9} className="animate-spin" />
          Indexando…
        </span>
      )}
      {pluginInstalled && !indexing && (
        <span style={{ color: '#4CAF50' }}>Plugin ✓</span>
      )}
      {connected ? (
        <span className="flex items-center gap-1" style={{ color: '#4CAF50' }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Unity conectado
          {activeScene && (
            <span style={{ color: '#888' }}>· {activeScene}</span>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-1" style={{ color: '#888' }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#555' }} />
          Unity desconectado
        </span>
      )}
    </div>
  )
}
