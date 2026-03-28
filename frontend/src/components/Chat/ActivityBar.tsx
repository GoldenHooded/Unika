import React, { useEffect, useState, useRef } from 'react'

/**
 * ActivityBar — small strip that types out the current agent status one-liner.
 * Appears between the context-toggle row and the input field when the agent
 * is running a command.  Hides itself when `text` is empty.
 *
 * The typewriter effect resets every time `text` changes so the user sees
 * each status appear fresh, character by character.
 */

const TYPING_SPEED_MS = 16   // ~60 chars/sec — fast enough to feel snappy

interface Props {
  text: string
}

export function ActivityBar({ text }: Props) {
  const [displayed, setDisplayed] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const indexRef    = useRef(0)

  // Typewriter reveal
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!text) {
      setDisplayed('')
      return
    }

    // Start fresh
    indexRef.current = 0
    setDisplayed('')

    intervalRef.current = setInterval(() => {
      indexRef.current += 1
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
      }
    }, TYPING_SPEED_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [text])

  // Blinking cursor
  useEffect(() => {
    const t = setInterval(() => setCursorVisible(v => !v), 520)
    return () => clearInterval(t)
  }, [])

  if (!text) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '3px 10px 3px 8px',
        marginBottom: 4,
        borderRadius: 4,
        background: 'rgba(61,133,200,0.07)',
        border: '1px solid rgba(61,133,200,0.2)',
        fontSize: 11,
        color: '#9ab8d8',
        fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        flexShrink: 0,
      }}
    >
      {/* Pulsing status dot */}
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#3d85c8',
          flexShrink: 0,
          animation: 'activityPulse 1.4s ease-in-out infinite',
        }}
      />

      {/* Typed text */}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {displayed}
      </span>

      {/* Blinking block cursor */}
      <span
        style={{
          color: '#3d85c8',
          opacity: cursorVisible ? 1 : 0,
          transition: 'opacity 0.05s',
          flexShrink: 0,
          fontSize: 10,
        }}
      >
        ▋
      </span>
    </div>
  )
}
