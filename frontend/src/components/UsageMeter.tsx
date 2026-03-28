import React, { useRef, useState, useEffect, useCallback } from 'react'
import { DollarSign, RotateCcw, RefreshCw } from 'lucide-react'
import { useUsageStore, channelColor, channelLabel } from '../stores/usageStore'

const API_BASE = 'http://127.0.0.1:8765'

function fmt(usd: number): string {
  if (usd === 0)   return '$0.0000'
  if (usd < 0.01)  return `$${usd.toFixed(4)}`
  if (usd < 1)     return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

interface ApiBalance {
  topped_up_balance: string
  granted_balance:   string
  total_balance:     string
  currency:          string
}

export function UsageMeter() {
  const { byChannel, totalCost, reset } = useUsageStore()
  const [open, setOpen]           = useState(false)
  const [balance, setBalance]     = useState<ApiBalance | null>(null)
  const [balLoading, setBalLoading] = useState(false)
  const [balError, setBalError]   = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const channels = Object.values(byChannel).sort((a, b) => b.cost - a.cost)
  const hasUsage = channels.length > 0

  // ── Fetch balance from backend ──────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    setBalLoading(true)
    setBalError(null)
    try {
      const r = await fetch(`${API_BASE}/balance`)
      const data = await r.json()
      if (data.error) { setBalError(data.error); return }
      // DeepSeek returns { is_available, balance_infos: [ { currency, total_balance, ... } ] }
      const info: ApiBalance = data.balance_infos?.[0] ?? null
      setBalance(info)
    } catch (e: any) {
      setBalError('Sin conexión')
    } finally {
      setBalLoading(false)
    }
  }, [])

  // Fetch on open, refresh every 60s while open
  useEffect(() => {
    if (!open) return
    fetchBalance()
    const id = setInterval(fetchBalance, 60_000)
    return () => clearInterval(id)
  }, [open, fetchBalance])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popRef.current && !popRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // Warn colour: < $0.50 remaining
  const totalBal  = balance ? parseFloat(balance.total_balance) : null
  const remaining = totalBal !== null ? totalBal - totalCost : null
  const isLow     = remaining !== null && remaining < 0.5
  const isOver    = remaining !== null && remaining < 0

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border transition-colors"
        style={isOver
          ? { background: 'rgba(211,34,34,0.15)',   color: '#f87171', borderColor: 'rgba(211,34,34,0.3)' }
          : isLow
            ? { background: 'rgba(251,191,36,0.12)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }
            : open || hasUsage
              ? { background: 'rgba(61,133,200,0.10)', color: '#3d85c8', borderColor: 'rgba(61,133,200,0.25)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#555', borderColor: 'rgba(255,255,255,0.06)' }
        }
        title="Uso de API y saldo disponible"
      >
        <DollarSign size={8} />

        {/* Mini stacked bar */}
        {hasUsage && totalBal !== null && (
          <div style={{
            display: 'flex', height: 6, width: 28, borderRadius: 3,
            overflow: 'hidden', background: 'rgba(255,255,255,0.06)', flexShrink: 0,
          }}>
            {channels.map(ch => (
              <div key={ch.channel} style={{
                width:      `${Math.min((ch.cost / totalBal) * 100, 100)}%`,
                background: channelColor(ch.channel),
                flexShrink: 0,
              }} />
            ))}
          </div>
        )}

        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmt(totalCost)}
        </span>
      </button>

      {open && (
        <div
          ref={popRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: '#1e1f22',
            border: '1px solid #3A3A3A',
            borderRadius: 6,
            padding: '8px 0 6px',
            minWidth: 248,
            zIndex: 200,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 10px 6px', borderBottom: '1px solid #2a2a2a', marginBottom: 6,
          }}>
            <span style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em' }}>
              USO DE API
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={fetchBalance} disabled={balLoading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 2 }}
                title="Actualizar saldo">
                <RefreshCw size={9} style={{ animation: balLoading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              <button onClick={reset}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 2 }}
                title="Reiniciar contadores de esta sesión">
                <RotateCcw size={9} />
              </button>
            </div>
          </div>

          {/* ── API Balance ── */}
          <div style={{ padding: '2px 10px 8px', borderBottom: '1px solid #2a2a2a', marginBottom: 4 }}>
            {balError ? (
              <span style={{ fontSize: 9, color: '#666' }}>Error al obtener saldo: {balError}</span>
            ) : balance ? (
              <>
                {/* Saldo disponible grande */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 18, color: isOver ? '#f87171' : isLow ? '#fbbf24' : '#6BCB77', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    ${parseFloat(balance.total_balance).toFixed(2)}
                  </span>
                  <span style={{ fontSize: 9, color: '#555' }}>{balance.currency} disponible</span>
                </div>

                {/* Barra de saldo restante */}
                {totalBal !== null && totalBal > 0 && (
                  <div style={{
                    height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)',
                    overflow: 'hidden', marginBottom: 5, position: 'relative',
                  }}>
                    {/* Fondo verde = saldo intacto */}
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(107,203,119,0.15)' }} />
                    {/* Segmentos de gasto por agente */}
                    {channels.reduce<{ els: React.ReactNode[]; offset: number }>(
                      ({ els, offset }, ch) => {
                        const w = Math.min((ch.cost / totalBal) * 100, 100 - offset)
                        els.push(
                          <div key={ch.channel} style={{
                            position: 'absolute', top: 0, height: '100%',
                            left: `${offset}%`, width: `${w}%`,
                            background: channelColor(ch.channel),
                          }} />
                        )
                        return { els, offset: offset + w }
                      },
                      { els: [], offset: 0 }
                    ).els}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 8, color: '#555' }}>
                    Gastado esta sesión: <span style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalCost)}</span>
                  </span>
                  {balance.granted_balance !== '0.00' && (
                    <span style={{ fontSize: 8, color: '#555' }}>
                      Gratuito: <span style={{ color: '#6BCB77' }}>${parseFloat(balance.granted_balance).toFixed(2)}</span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span style={{ fontSize: 9, color: '#555' }}>Cargando saldo…</span>
            )}
          </div>

          {/* ── Desglose por agente ── */}
          {channels.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 9, color: '#444', textAlign: 'center' }}>
              Sin actividad todavía
            </div>
          ) : (
            <>
              {channels.map(ch => (
                <div key={ch.channel} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: channelColor(ch.channel), flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, color: '#C4C4C4', flex: 1 }}>
                    {channelLabel(ch.channel)}
                  </span>
                  <span style={{ fontSize: 8, color: '#555', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtK(ch.promptTokens)}↑ {fmtK(ch.completionTokens)}↓
                  </span>
                  <span style={{
                    fontSize: 9, color: channelColor(ch.channel),
                    minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmt(ch.cost)}
                  </span>
                </div>
              ))}

              {channels.length > 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px 2px', borderTop: '1px solid #2a2a2a', marginTop: 2,
                }}>
                  <div style={{ width: 7, height: 7, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#888', flex: 1 }}>Total sesión</span>
                  <span style={{
                    fontSize: 9, color: '#D2D2D2',
                    minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmt(totalCost)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
