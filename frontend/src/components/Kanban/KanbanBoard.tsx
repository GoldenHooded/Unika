import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, Edit2, Check, Tag, GripVertical, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'

const API = 'http://127.0.0.1:8765'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface KanbanCard {
  id: string
  title: string
  description?: string
  tags: string[]
  color?: string
}
export interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}
export interface KanbanBoardData {
  columns: KanbanColumn[]
}

// ── Tag colors ─────────────────────────────────────────────────────────────────
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  bug:      { bg: '#4a1515', text: '#ff7070' },
  feature:  { bg: '#1a3a1a', text: '#6bcb77' },
  design:   { bg: '#1a2a4a', text: '#7ab4ff' },
  urgent:   { bg: '#4a2a00', text: '#ffa040' },
  docs:     { bg: '#2a1a3a', text: '#c4a8ff' },
  test:     { bg: '#0d2828', text: '#40d0c0' },
}
function tagStyle(tag: string) {
  return TAG_COLORS[tag.toLowerCase()] ?? { bg: '#2a2a2a', text: '#888' }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Card component ─────────────────────────────────────────────────────────────
function Card({
  card, colId,
  onEdit, onDelete,
  onDragStart, onDragEnd,
  isDragOver,
}: {
  card: KanbanCard
  colId: string
  onEdit: (card: KanbanCard) => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  isDragOver: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const accent = card.color ?? 'transparent'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isDragOver ? 'rgba(61,133,200,0.08)' : '#2a2a2a',
        border: isDragOver ? '1px solid rgba(61,133,200,0.4)' : `1px solid ${hovered ? '#444' : '#333'}`,
        borderLeft: `3px solid ${accent !== 'transparent' ? accent : '#3A3A3A'}`,
        borderRadius: 5,
        padding: '7px 8px',
        marginBottom: 4,
        cursor: 'grab',
        transition: 'border-color 0.1s, background 0.1s',
        opacity: isDragOver ? 0.7 : 1,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <GripVertical size={10} style={{ color: '#444', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#D2D2D2', lineHeight: 1.4, wordBreak: 'break-word' }}>
            {card.title}
          </div>
          {card.description && (
            <div style={{ fontSize: 9, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
              {card.description}
            </div>
          )}
          {card.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
              {card.tags.map(tag => {
                const s = tagStyle(tag)
                return (
                  <span key={tag} style={{
                    background: s.bg, color: s.text,
                    fontSize: 8, padding: '1px 5px', borderRadius: 3,
                  }}>{tag}</span>
                )
              })}
            </div>
          )}
        </div>
        {hovered && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button onClick={() => onEdit(card)} style={iconBtn}>
              <Edit2 size={9} />
            </button>
            <button onClick={onDelete} style={{ ...iconBtn, color: '#cc4444' }}>
              <X size={9} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card edit modal ────────────────────────────────────────────────────────────
const CARD_COLORS = ['transparent','#3d85c8','#6bcb77','#ffa040','#cc4488','#8844cc','#f4bc02']
const KNOWN_TAGS = ['bug','feature','design','urgent','docs','test']

function CardModal({
  initial, onSave, onClose,
}: {
  initial: Partial<KanbanCard>
  onSave: (card: KanbanCard) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(initial.title ?? '')
  const [desc,  setDesc]  = useState(initial.description ?? '')
  const [tags,  setTags]  = useState<string[]>(initial.tags ?? [])
  const [color, setColor] = useState(initial.color ?? 'transparent')
  const [customTag, setCustomTag] = useState('')

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const save = () => {
    if (!title.trim()) return
    onSave({ id: initial.id ?? uid(), title: title.trim(), description: desc.trim() || undefined, tags, color: color === 'transparent' ? undefined : color })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#1e1f22', border: '1px solid #3A3A3A', borderRadius: 8,
        padding: 16, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 10, fontWeight: 600 }}>
          {initial.id ? 'Editar tarjeta' : 'Nueva tarjeta'}
        </div>
        <input
          autoFocus
          placeholder="Título"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() ; if (e.key === 'Escape') onClose() }}
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <textarea
          placeholder="Descripción (opcional)"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'none', marginBottom: 10 }}
        />
        {/* Tags */}
        <div style={{ fontSize: 9, color: '#555', marginBottom: 5 }}>TAGS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {KNOWN_TAGS.map(t => {
            const s = tagStyle(t)
            const active = tags.includes(t)
            return (
              <button key={t} onClick={() => toggleTag(t)} style={{
                background: active ? s.bg : '#1a1a1a',
                color: active ? s.text : '#555',
                border: `1px solid ${active ? s.text + '40' : '#333'}`,
                borderRadius: 3, padding: '2px 7px', fontSize: 8, cursor: 'pointer',
              }}>{t}</button>
            )
          })}
          <div style={{ display: 'flex', gap: 3 }}>
            <input
              placeholder="tag custom"
              value={customTag}
              onChange={e => setCustomTag(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customTag.trim()) {
                  toggleTag(customTag.trim().toLowerCase())
                  setCustomTag('')
                }
              }}
              style={{ ...inputStyle, width: 80, fontSize: 8, padding: '2px 6px' }}
            />
          </div>
        </div>
        {/* Color */}
        <div style={{ fontSize: 9, color: '#555', marginBottom: 5 }}>COLOR DE ACENTO</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {CARD_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{
              width: 18, height: 18, borderRadius: '50%',
              background: c === 'transparent' ? '#2a2a2a' : c,
              border: color === c ? '2px solid #fff' : '2px solid transparent',
              cursor: 'pointer',
            }} />
          ))}
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button onClick={onClose} style={cancelBtn}>Cancelar</button>
          <button onClick={save} disabled={!title.trim()} style={saveBtn}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

// ── Column ─────────────────────────────────────────────────────────────────────
function Column({
  col, onUpdate, onDelete,
  draggingCard, onCardDragStart, onCardDragEnd,
  onDropCard,
}: {
  col: KanbanColumn
  onUpdate: (col: KanbanColumn) => void
  onDelete: () => void
  draggingCard: { cardId: string; fromColId: string } | null
  onCardDragStart: (cardId: string, fromColId: string) => void
  onCardDragEnd: () => void
  onDropCard: (toColId: string, afterCardId: string | null) => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal]         = useState(col.title)
  const [cardModal, setCardModal]       = useState<Partial<KanbanCard> | null>(null)
  const [dragOverIdx, setDragOverIdx]   = useState<number | null>(null)

  const saveTitle = () => {
    if (titleVal.trim()) onUpdate({ ...col, title: titleVal.trim() })
    setEditingTitle(false)
  }

  const addOrEditCard = (card: KanbanCard) => {
    const idx = col.cards.findIndex(c => c.id === card.id)
    const cards = idx >= 0
      ? col.cards.map(c => c.id === card.id ? card : c)
      : [...col.cards, card]
    onUpdate({ ...col, cards })
    setCardModal(null)
  }
  const deleteCard = (id: string) =>
    onUpdate({ ...col, cards: col.cards.filter(c => c.id !== id) })

  return (
    <div
      style={{
        width: 240, flexShrink: 0,
        background: '#1e1f22', border: '1px solid #2a2a2a', borderRadius: 6,
        display: 'flex', flexDirection: 'column', maxHeight: '100%',
      }}
      onDragOver={e => { e.preventDefault(); setDragOverIdx(col.cards.length) }}
      onDrop={e => { e.preventDefault(); onDropCard(col.id, null); setDragOverIdx(null) }}
      onDragLeave={() => setDragOverIdx(null)}
    >
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', borderBottom: '1px solid #2a2a2a', flexShrink: 0,
      }}>
        {editingTitle ? (
          <input
            autoFocus
            value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
            style={{ ...inputStyle, flex: 1, marginRight: 4 }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditingTitle(true)}
            style={{ fontSize: 11, fontWeight: 600, color: '#C4C4C4', flex: 1, cursor: 'default' }}
            title="Doble clic para renombrar"
          >
            {col.title}
            <span style={{ marginLeft: 6, fontSize: 9, color: '#444' }}>{col.cards.length}</span>
          </span>
        )}
        <button onClick={onDelete} style={{ ...iconBtn, color: '#444' }} title="Eliminar columna">
          <Trash2 size={10} />
        </button>
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {col.cards.map((card, idx) => (
          <div
            key={card.id}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverIdx(idx) }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); onDropCard(col.id, card.id); setDragOverIdx(null) }}
          >
            <Card
              card={card}
              colId={col.id}
              onEdit={c => setCardModal(c)}
              onDelete={() => deleteCard(card.id)}
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onCardDragStart(card.id, col.id) }}
              onDragEnd={onCardDragEnd}
              isDragOver={dragOverIdx === idx && draggingCard?.cardId !== card.id}
            />
          </div>
        ))}
        {/* Drop zone at end */}
        {draggingCard && draggingCard.fromColId !== col.id && (
          <div style={{
            height: dragOverIdx === col.cards.length ? 32 : 6,
            borderRadius: 4,
            background: dragOverIdx === col.cards.length ? 'rgba(61,133,200,0.1)' : 'transparent',
            border: dragOverIdx === col.cards.length ? '1px dashed rgba(61,133,200,0.4)' : 'none',
            transition: 'height 0.1s, background 0.1s',
          }} />
        )}
      </div>

      {/* Add card */}
      <button
        onClick={() => setCardModal({})}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '7px 10px', background: 'none', border: 'none',
          borderTop: '1px solid #222', color: '#555', cursor: 'pointer',
          fontSize: 10, width: '100%', transition: 'color 0.1s, background 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.background = 'none' }}
      >
        <Plus size={10} /> Añadir tarjeta
      </button>

      {cardModal && (
        <CardModal
          initial={cardModal}
          onSave={addOrEditCard}
          onClose={() => setCardModal(null)}
        />
      )}
    </div>
  )
}

// ── Main board ─────────────────────────────────────────────────────────────────
export function KanbanBoard() {
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const [board, setBoard] = useState<KanbanBoardData>({ columns: [] })
  const [loading, setLoading] = useState(true)
  const [draggingCard, setDraggingCard] = useState<{ cardId: string; fromColId: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load
  useEffect(() => {
    if (!activeProjectId) return
    setLoading(true)
    fetch(`${API}/projects/${activeProjectId}/board`)
      .then(r => r.json())
      .then(data => { setBoard(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeProjectId])

  // Auto-save (debounced 600ms)
  const persist = useCallback((b: KanbanBoardData) => {
    if (!activeProjectId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(`${API}/projects/${activeProjectId}/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      }).catch(() => {})
    }, 600)
  }, [activeProjectId])

  const updateBoard = useCallback((b: KanbanBoardData) => {
    setBoard(b)
    persist(b)
  }, [persist])

  const updateCol = (col: KanbanColumn) => {
    const next = { columns: board.columns.map(c => c.id === col.id ? col : c) }
    updateBoard(next)
  }
  const deleteCol = (id: string) => {
    updateBoard({ columns: board.columns.filter(c => c.id !== id) })
  }
  const addCol = () => {
    const next: KanbanColumn = { id: uid(), title: 'Nueva columna', cards: [] }
    updateBoard({ columns: [...board.columns, next] })
  }

  const dropCard = (toColId: string, afterCardId: string | null) => {
    if (!draggingCard) return
    const { cardId, fromColId } = draggingCard
    let card: KanbanCard | undefined
    const cols = board.columns.map(col => {
      if (col.id === fromColId) {
        card = col.cards.find(c => c.id === cardId)
        return { ...col, cards: col.cards.filter(c => c.id !== cardId) }
      }
      return col
    })
    if (!card) return
    const finalCard = card
    const cols2 = cols.map(col => {
      if (col.id !== toColId) return col
      if (afterCardId === null) return { ...col, cards: [...col.cards, finalCard] }
      const idx = col.cards.findIndex(c => c.id === afterCardId)
      const cards = [...col.cards]
      cards.splice(idx, 0, finalCard)
      return { ...col, cards }
    })
    updateBoard({ columns: cols2 })
    setDraggingCard(null)
  }

  if (!activeProjectId) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 11 }}>
      Selecciona un proyecto
    </div>
  )
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 11 }}>
      Cargando tablero…
    </div>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#282828' }}>
      {/* Board toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 12px',
        borderBottom: '1px solid #3A3A3A', flexShrink: 0, gap: 8,
      }}>
        <span style={{ fontSize: 10, color: '#555', fontWeight: 600 }}>TABLERO</span>
        <button
          onClick={addCol}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.04)', border: '1px solid #3A3A3A',
            borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
            color: '#888', fontSize: 9,
          }}
        >
          <Plus size={9} /> Columna
        </button>
      </div>

      {/* Columns */}
      <div style={{
        flex: 1, display: 'flex', gap: 10, padding: 12,
        overflowX: 'auto', overflowY: 'hidden', alignItems: 'flex-start',
      }}>
        {board.columns.map(col => (
          <Column
            key={col.id}
            col={col}
            onUpdate={updateCol}
            onDelete={() => deleteCol(col.id)}
            draggingCard={draggingCard}
            onCardDragStart={(cardId, fromColId) => setDraggingCard({ cardId, fromColId })}
            onCardDragEnd={() => setDraggingCard(null)}
            onDropCard={dropCard}
          />
        ))}
        {board.columns.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            flex: 1, color: '#444', fontSize: 11, gap: 8,
          }}>
            <span>El tablero está vacío</span>
            <button onClick={addCol} style={saveBtn}>
              <Plus size={10} style={{ marginRight: 4 }} /> Crear primera columna
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shared micro-styles ────────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#666', padding: 2, display: 'flex', alignItems: 'center',
  borderRadius: 3, transition: 'color 0.1s',
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#2A2A2A', border: '1px solid #3A3A3A',
  borderRadius: 4, color: '#D2D2D2', fontSize: 10, padding: '4px 7px',
  outline: 'none',
}
const saveBtn: React.CSSProperties = {
  background: 'rgba(61,133,200,0.2)', border: '1px solid rgba(61,133,200,0.4)',
  borderRadius: 4, color: '#3d85c8', fontSize: 9, padding: '4px 10px',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
}
const cancelBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #3A3A3A',
  borderRadius: 4, color: '#666', fontSize: 9, padding: '4px 10px', cursor: 'pointer',
}
