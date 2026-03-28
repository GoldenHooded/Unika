import React from 'react'
import { CommandItem } from '../../stores/chatStore'
import { DiffViewer, parseDiffResult } from './DiffViewer'

function extractFromRaw(raw: string, key: string): string {
  const m = new RegExp(`"${key}"\\s*:\\s*"([^"]*)`).exec(raw ?? '')
  return m ? m[1] : ''
}
function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() || p
}

function getLabel(name: string, args: Record<string, any>, argsRaw?: string): string {
  const g = (key: string): string => {
    const v = args[key]
    if (v !== undefined && v !== null) return String(v)
    return argsRaw ? extractFromRaw(argsRaw, key) : ''
  }
  const path = g('path')
  const file = path ? basename(path) : ''

  switch (name) {
    case 'FILE_WRITE':           return `Creando ${file || path || '…'}`
    case 'FILE_EDIT':            return `Editando ${file || path || '…'}`
    case 'FILE_READ':            return `Leyendo ${file || path || '…'}`
    case 'FILE_LIST':            return `Explorando ${path || 'directorio'}`
    case 'FILE_GREP':            return `Buscando en código`
    case 'FILE_FIND':            return `Buscando archivos`
    case 'UNITY_COMPILE':        return `Compilando proyecto Unity`
    case 'UNITY_READ_CONSOLE':   return `Leyendo consola Unity`
    case 'UNITY_GET_HIERARCHY':  return `Leyendo jerarquía de escena`
    case 'UNITY_GET_OBJECT':     return `Inspeccionando ${g('name') || 'objeto'}`
    case 'UNITY_CREATE_OBJECT':  return `Creando objeto ${g('name') || '…'}`
    case 'UNITY_DELETE_OBJECT':  return `Eliminando ${g('name') || 'objeto'}`
    case 'UNITY_SET_PROPERTY':   return `Configurando ${g('property') || g('object') || '…'}`
    case 'UNITY_ADD_COMPONENT':  return `Añadiendo ${g('component') || 'componente'}`
    case 'UNITY_SWITCH_SCENE':   return `Cargando escena ${g('name') || '…'}`
    case 'UNITY_GET_ASSETS':     return `Buscando assets`
    case 'UNITY_SETUP':          return `Configurando proyecto Unity`
    case 'UNITY_CREATE_SCRIPT':  return `Creando script ${g('name') || '…'}`
    case 'SHELL':                return `Ejecutando: ${g('command').slice(0, 50) || '…'}`
    case 'SEARCH':               return `Buscando: ${g('query').slice(0, 50) || '…'}`
    case 'THINK':                return `Analizando problema`
    case 'ASK':                  return `Preguntando al usuario`
    case 'WAIT':                 return `Esperando ${g('seconds') || '?'}s`
    case 'MEMORY_SAVE':          return `Guardando en memoria`
    case 'MEMORY_SEARCH':        return `Consultando memoria`
    case 'DOC_READ':             return `Leyendo ${g('document') || 'documento'}`
    case 'DOC_UPDATE':           return `Actualizando ${g('document') || 'documento'}`
    case 'CALL_CODER':           return `Llamando al agente Coder`
    case 'CALL_PLANNER':         return `Llamando al agente Planner`
    case 'CALL_SEARCH':          return `Llamando al agente Search`
    case 'CALL_REASONER':        return `Razonando con R1`
    case 'CALL_REVIEWER':        return `Revisando código`
    default:                     return name.toLowerCase().replace(/_/g, ' ')
  }
}

export function CommandBlock({ cmd }: { cmd: CommandItem }) {
  const isActive   = cmd.status === 'running' || cmd.status === 'building'
  const isBuilding = cmd.status === 'building'
  const isError    = cmd.status === 'error'
  const isDone     = cmd.status === 'done'

  const label = getLabel(cmd.name, cmd.args, cmd.args_raw)
  const diffData = isDone ? parseDiffResult(cmd.result) : null

  return (
    <>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 0',
        userSelect: 'none',
        // Outer glow on the entire row while active
        filter: isActive ? 'drop-shadow(0 0 5px rgba(90, 170, 255, 0.35))' : 'none',
        transition: 'filter 0.3s ease',
      }}
    >
      {/* ">" prefix */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
          color: isActive ? '#58C4FF'
            : isDone  ? '#5A9A5A'
            : isError ? '#C06060'
            : '#484848',
          lineHeight: 1,
        }}
      >
        &gt;
      </span>

      {/* Label — shimmer text when active, plain when done */}
      <span
        style={isActive ? {
          background: 'linear-gradient(90deg, #7ACFFF 0%, #7ACFFF 25%, #E8F8FF 50%, #7ACFFF 75%, #7ACFFF 100%)',
          backgroundSize: '250% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'cmdShimmerText 1.8s linear infinite',
          fontSize: 12,
          fontWeight: 500,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        } : {
          fontSize: 12,
          fontWeight: 400,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: isDone  ? '#7ABF7A'
            : isError ? '#C07070'
            : '#666',
        }}
      >
        {label}
        {isBuilding && (
          <span
            style={{
              display: 'inline-block',
              width: 4,
              height: 10,
              background: isBuilding ? '#6ABAFF88' : 'transparent',
              marginLeft: 2,
              verticalAlign: 'middle',
              animation: 'blink 1s step-end infinite',
            }}
          />
        )}
      </span>

      {/* Spinner when running (not building) */}
      {isActive && !isBuilding && (
        <span
          className="animate-spin"
          style={{
            flexShrink: 0,
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '1.5px solid #6ABAFF',
            borderTopColor: 'transparent',
            boxShadow: '0 0 6px rgba(106, 186, 255, 0.6)',
          }}
        />
      )}

      {/* Duration */}
      {isDone && cmd.duration_ms !== undefined && (
        <span style={{ flexShrink: 0, fontSize: 9, color: '#2A3A2A', opacity: 0.4 }}>
          {cmd.duration_ms}ms
        </span>
      )}
    </div>
    {/* Inline diff viewer for FILE_EDIT results */}
    {diffData && (
      <DiffViewer diff={diffData.diff} filename={diffData.filename} />
    )}
    </>
  )
}
