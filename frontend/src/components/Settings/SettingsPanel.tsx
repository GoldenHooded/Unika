import React, { useEffect, useRef, useState } from 'react'
import { X, Volume2, VolumeX, CheckCircle2, AlertCircle, Eye, EyeOff, Save, ChevronDown, ChevronRight, RotateCcw, TriangleAlert } from 'lucide-react'
import { useSettingsStore, SoundKey } from '../../stores/settingsStore'
import { playSound } from '../../utils/sounds'

const API_BASE = 'http://127.0.0.1:8765'

async function fetchSettings() {
  const r = await fetch(`${API_BASE}/settings`)
  return r.json()
}

async function postSettings(body: Record<string, any>) {
  const r = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

interface Props {
  onClose: () => void
}

const SOUND_LABELS: Record<SoundKey, string> = {
  ask:         'Pregunta del agente',
  done:        'Agente termina tarea',
  reviewOpen:  'Revisión de código se abre',
  reviewClose: 'Revisión de código se cierra',
  exit:        'Cierre de la aplicación',
}

const SOUND_DESCS: Record<SoundKey, string> = {
  ask:         'Suena cuando el agente necesita una respuesta tuya',
  done:        'Suena cuando el agente termina de ejecutar una tarea',
  reviewOpen:  'Suena cuando el panel de revisión de código aparece',
  reviewClose: 'Suena cuando la revisión de código se cierra',
  exit:        'Suena al cerrar la aplicación',
}

const SOUND_ORDER: SoundKey[] = ['ask', 'done', 'reviewOpen', 'reviewClose', 'exit']

export function SettingsPanel({ onClose }: Props) {
  const { sounds, setSoundEnabled, setSoundVolume } = useSettingsStore()

  // API keys state
  const [deepseekSet,  setDeepseekSet]  = useState<boolean | null>(null)
  const [tavily_set,   setTavilySet]    = useState<boolean | null>(null)
  const [deepseekVal,  setDeepseekVal]  = useState('')
  const [tavilyVal,    setTavilyVal]    = useState('')
  const [showDeepseek, setShowDeepseek] = useState(false)
  const [showTavily,   setShowTavily]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)

  // System prompt state
  const [spOpen,       setSpOpen]       = useState(false)
  const [spContent,    setSpContent]    = useState('')
  const [spDefault,    setSpDefault]    = useState('')
  const [spCustomized, setSpCustomized] = useState(false)
  const [spSaving,     setSpSaving]     = useState(false)
  const [spSaved,      setSpSaved]      = useState(false)
  const [spResetting,  setSpResetting]  = useState(false)
  const spLoadedRef = useRef(false)

  useEffect(() => {
    fetchSettings().then(s => {
      setDeepseekSet(s.deepseek_key_set ?? false)
      setTavilySet(s.tavily_key_set ?? false)
    }).catch(() => {})
  }, [])

  // Load system prompt when section is first opened
  useEffect(() => {
    if (!spOpen || spLoadedRef.current) return
    spLoadedRef.current = true
    fetch(`${API_BASE}/system-prompt`)
      .then(r => r.json())
      .then(d => {
        setSpContent(d.content ?? '')
        setSpDefault(d.default ?? '')
        setSpCustomized(d.customized ?? false)
      })
      .catch(() => {})
  }, [spOpen])

  const saveSystemPrompt = async () => {
    setSpSaving(true)
    try {
      await fetch(`${API_BASE}/system-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: spContent }),
      })
      setSpCustomized(true)
      setSpSaved(true)
      setTimeout(() => setSpSaved(false), 2500)
    } finally {
      setSpSaving(false)
    }
  }

  const resetSystemPrompt = async () => {
    setSpResetting(true)
    try {
      await fetch(`${API_BASE}/system-prompt`, { method: 'DELETE' })
      setSpContent(spDefault)
      setSpCustomized(false)
    } finally {
      setSpResetting(false)
    }
  }

  const saveKeys = async () => {
    const body: Record<string, string> = {}
    if (deepseekVal.trim()) body.deepseek_api_key = deepseekVal.trim()
    if (tavilyVal.trim())   body.tavily_api_key   = tavilyVal.trim()
    if (!Object.keys(body).length) return
    setSaving(true)
    try {
      await postSettings(body)
      if (body.deepseek_api_key) { setDeepseekSet(true); setDeepseekVal('') }
      if (body.tavily_api_key)   { setTavilySet(true);   setTavilyVal('') }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Panel */}
      <div
        className="flex flex-col rounded overflow-hidden shadow-2xl"
        style={{ background: '#1e2130', border: '1px solid #3A3A3A', width: spOpen ? 620 : 440, maxHeight: '90vh', transition: 'width 0.2s ease' }}
      >
        {/* Header */}
        <div className="flex items-center px-4 py-2.5 border-b flex-shrink-0"
             style={{ background: '#282f45', borderColor: 'rgba(255,255,255,0.07)' }}>
          <span className="text-[13px] font-semibold text-[#EEEEEE] flex-1">Ajustes</span>
          <button
            className="p-1 rounded text-[#888] hover:text-[#EEEEEE] hover:bg-[#28282e] transition-colors"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {/* API Keys section */}
          <div>
            <h3 className="text-[11px] uppercase tracking-widest text-[#888] mb-2">Claves API</h3>
            <div className="space-y-2">
              {/* DeepSeek */}
              <div className="px-3 py-2 rounded space-y-1.5" style={{ background: '#252b3b' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#D2D2D2] flex-1">DeepSeek API Key</span>
                  {deepseekSet === true  && <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 size={11}/>Configurada</span>}
                  {deepseekSet === false && <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertCircle size={11}/>Sin configurar</span>}
                </div>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showDeepseek ? 'text' : 'password'}
                      className="w-full text-[11px] px-2 py-1 rounded outline-none pr-7"
                      style={{ background: '#1a2030', border: '1px solid #3A3A3A', color: '#D2D2D2' }}
                      placeholder={deepseekSet ? '••••••••••••••••••••••  (dejar vacío = no cambiar)' : 'sk-...'}
                      value={deepseekVal}
                      onChange={e => setDeepseekVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveKeys() }}
                    />
                    <button
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#ccc]"
                      onClick={() => setShowDeepseek(v => !v)}
                    >{showDeepseek ? <EyeOff size={11}/> : <Eye size={11}/>}</button>
                  </div>
                </div>
                <p className="text-[10px] text-[#888]">Necesaria para que el agente funcione · <a className="text-[#3d85c8] cursor-pointer hover:underline" onClick={() => window.electronAPI?.openExternal('https://platform.deepseek.com/api_keys')}>Obtener clave</a></p>
              </div>

              {/* Tavily */}
              <div className="px-3 py-2 rounded space-y-1.5" style={{ background: '#252b3b' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#D2D2D2] flex-1">Tavily API Key</span>
                  {tavily_set === true  && <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 size={11}/>Configurada</span>}
                  {tavily_set === false && <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertCircle size={11}/>Sin configurar</span>}
                </div>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showTavily ? 'text' : 'password'}
                      className="w-full text-[11px] px-2 py-1 rounded outline-none pr-7"
                      style={{ background: '#1a2030', border: '1px solid #3A3A3A', color: '#D2D2D2' }}
                      placeholder={tavily_set ? '••••••••••••••••••••••  (dejar vacío = no cambiar)' : 'tvly-...'}
                      value={tavilyVal}
                      onChange={e => setTavilyVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveKeys() }}
                    />
                    <button
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#ccc]"
                      onClick={() => setShowTavily(v => !v)}
                    >{showTavily ? <EyeOff size={11}/> : <Eye size={11}/>}</button>
                  </div>
                </div>
                <p className="text-[10px] text-[#888]">Opcional — búsquedas web del agente · <a className="text-[#3d85c8] cursor-pointer hover:underline" onClick={() => window.electronAPI?.openExternal('https://app.tavily.com')}>Obtener clave</a></p>
              </div>

              {/* Save button */}
              <button
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: saved ? 'rgba(34,197,94,0.2)' : 'rgba(61,133,200,0.2)', color: saved ? '#4ade80' : '#3d85c8', border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(61,133,200,0.3)'}` }}
                disabled={saving || (!deepseekVal.trim() && !tavilyVal.trim())}
                onClick={saveKeys}
              >
                {saved ? <CheckCircle2 size={13}/> : <Save size={13}/>}
                {saved ? 'Guardado' : saving ? 'Guardando…' : 'Guardar claves'}
              </button>
            </div>
          </div>

          {/* Sounds section */}
          <div>
            <h3 className="text-[11px] uppercase tracking-widest text-[#888] mb-2">Sonidos</h3>
            <div className="space-y-1">
              {SOUND_ORDER.map(key => {
                const cfg = sounds[key]
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 px-3 py-2 rounded"
                    style={{ background: '#252b3b' }}
                  >
                    {/* Toggle */}
                    <button
                      className="flex-shrink-0 p-1 rounded transition-colors"
                      style={cfg.enabled
                        ? { color: '#3d85c8', background: 'rgba(61,133,200,0.15)' }
                        : { color: '#555', background: 'transparent' }
                      }
                      onClick={() => setSoundEnabled(key, !cfg.enabled)}
                      title={cfg.enabled ? 'Desactivar' : 'Activar'}
                    >
                      {cfg.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    </button>

                    {/* Label + desc */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-[#D2D2D2] leading-tight">{SOUND_LABELS[key]}</div>
                      <div className="text-[10px] text-[#888] leading-tight mt-0.5 truncate">{SOUND_DESCS[key]}</div>
                    </div>

                    {/* Volume slider */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="range"
                        min={0} max={1} step={0.05}
                        value={cfg.volume}
                        disabled={!cfg.enabled}
                        onChange={e => setSoundVolume(key, parseFloat(e.target.value))}
                        className="w-20 accent-[#3d85c8] disabled:opacity-30"
                        style={{ height: 4, cursor: cfg.enabled ? 'pointer' : 'not-allowed' }}
                      />
                      {/* Preview button */}
                      <button
                        className="text-[10px] px-1.5 py-0.5 rounded border transition-colors"
                        style={cfg.enabled
                          ? { color: '#888', borderColor: 'rgba(255,255,255,0.07)', background: 'transparent' }
                          : { color: '#444', borderColor: '#333', background: 'transparent', cursor: 'not-allowed' }
                        }
                        disabled={!cfg.enabled}
                        onClick={() => playSound(key)}
                        title="Previsualizar"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* System Prompt section */}
          <div>
            {/* Accordion header */}
            <button
              className="w-full flex items-center gap-2 text-left"
              onClick={() => setSpOpen(v => !v)}
            >
              <span className="text-[11px] uppercase tracking-widest text-[#888] flex-1">System Prompt</span>
              {spCustomized && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(234,179,8,0.12)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.25)' }}>
                  Personalizado
                </span>
              )}
              {spOpen ? <ChevronDown size={12} className="text-[#888]"/> : <ChevronRight size={12} className="text-[#888]"/>}
            </button>

            {spOpen && (
              <div className="mt-2 space-y-2">

                {/* Danger banner */}
                <div className="flex items-start gap-2 px-3 py-2 rounded"
                     style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <TriangleAlert size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] text-red-400 font-medium leading-tight">Zona de peligro</p>
                    <p className="text-[10px] text-[#999] leading-snug mt-0.5">
                      Modificar el system prompt puede alterar el comportamiento del agente de forma impredecible.
                      El placeholder <code className="text-[#f87171] text-[9px]">{'{context_section}'}</code> se
                      añade automáticamente si lo eliminas. Haz una copia antes de editar.
                    </p>
                  </div>
                </div>

                {/* Textarea */}
                <textarea
                  className="w-full text-[11px] px-2 py-2 rounded outline-none resize-none font-mono"
                  style={{
                    background: '#141820',
                    border: '1px solid #3A3A3A',
                    color: '#D2D2D2',
                    height: 320,
                    lineHeight: '1.55',
                  }}
                  value={spContent}
                  onChange={e => setSpContent(e.target.value)}
                  spellCheck={false}
                />

                {/* Action row */}
                <div className="flex gap-2">
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                    disabled={spResetting || !spCustomized}
                    onClick={resetSystemPrompt}
                    title="Restaurar el prompt por defecto"
                  >
                    <RotateCcw size={11} className={spResetting ? 'animate-spin' : ''} />
                    Restaurar
                  </button>

                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-40"
                    style={{
                      background: spSaved ? 'rgba(34,197,94,0.2)' : 'rgba(61,133,200,0.2)',
                      color: spSaved ? '#4ade80' : '#3d85c8',
                      border: `1px solid ${spSaved ? 'rgba(34,197,94,0.3)' : 'rgba(61,133,200,0.3)'}`,
                    }}
                    disabled={spSaving}
                    onClick={saveSystemPrompt}
                  >
                    {spSaved ? <CheckCircle2 size={11}/> : <Save size={11}/>}
                    {spSaved ? 'Guardado' : spSaving ? 'Guardando…' : 'Guardar system prompt'}
                  </button>
                </div>

                <p className="text-[10px] text-[#666] leading-snug">
                  Los cambios se aplican en la próxima conversación. Para el agente actual, reinicia la sesión.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
