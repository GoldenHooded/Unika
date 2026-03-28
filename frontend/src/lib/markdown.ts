import { marked } from 'marked'

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(text: string | undefined | null): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Configure marked once at module load ──────────────────────────────────────
// CRITICAL: useNewRenderer:true tells marked NOT to run #convertRendererFunction()
// on our methods. Without it, marked v13 wraps our token-based functions as if they
// were old-style (code, lang, escaped) → destructuring { text } from a string gives
// undefined → escapeHtml(undefined) throws → entire parse aborts → raw markdown shown.
marked.use({
  gfm: true,
  breaks: true,
  useNewRenderer: true,   // ← required in marked v13 when using token-based renderer API
  renderer: {
    // Fenced + indented code blocks
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang || '').split(/\s+/)[0] || 'plaintext'
      return `<pre class="code-block" data-lang="${language}"><code class="language-${language}">${escapeHtml(text)}</code></pre>\n`
    },
    // Inline backtick code
    codespan({ text }: { text: string }) {
      return `<code class="inline-code">${escapeHtml(text)}</code>`
    },
    heading({ text, depth }: { text: string; depth: number }) {
      const id = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
      return `<h${depth} id="${id}">${text}</h${depth}>\n`
    },
  },
})

// ── Unity asset reference chips: [[type:Name]] ───────────────────────────────
// Renders as a colored chip in the chat. Types: prefab, scene, script, object,
// component, material, audio, shader.
const UNITY_REF_RE = /\[\[(\w+):([^\]]+)\]\]/g

function replaceUnityRefs(text: string): string {
  // Split on code spans / fenced blocks so [[ref]] inside code is NOT converted
  const parts: string[] = []
  const CODE_RE = /(`{3,}[\s\S]*?`{3,}|`[^`\n]+?`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = CODE_RE.exec(text)) !== null) {
    parts.push(
      text.slice(last, m.index).replace(UNITY_REF_RE, (_, type, name) =>
        `<span class="unity-ref" data-type="${type}">${escapeHtml(name.trim())}</span>`
      )
    )
    parts.push(m[0]) // code section — leave untouched
    last = m.index + m[0].length
  }
  parts.push(
    text.slice(last).replace(UNITY_REF_RE, (_, type, name) =>
      `<span class="unity-ref" data-type="${type}">${escapeHtml(name.trim())}</span>`
    )
  )
  return parts.join('')
}

// ── KaTeX: block math only ($$ ... $$) ───────────────────────────────────────
function renderKatex(text: string): string {
  return text.replace(/\$\$([\s\S]+?)\$\$/g, (full, math) => {
    try {
      const katex = require('katex') as typeof import('katex')
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return full
    }
  })
}

// ── Detect if agent wrapped entire response in a single code fence ────────────
function unwrapOuterFence(text: string): { stripped: boolean; inner: string } {
  const t = text.trim()
  const m = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n?\1\s*$/.exec(t)
  if (m && m[3].trim().length > 50 && !(/`{3,}/.test(m[3]))) {
    return { stripped: true, inner: m[3] }
  }
  return { stripped: false, inner: text }
}

// ── Plain-text fallback (used only if marked throws) ─────────────────────────
function textToHtml(text: string): string {
  return '<p>' +
    escapeHtml(text)
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>') +
    '</p>'
}

// ── Main export ───────────────────────────────────────────────────────────────
export function renderMarkdown(text: string): string {
  if (!text?.trim()) return ''

  const { stripped, inner } = unwrapOuterFence(text)
  const src = stripped ? inner : text

  // Unity refs → before markdown parsing so chips survive the pass
  const srcWithRefs = replaceUnityRefs(src)

  // KaTeX block math
  let processed = srcWithRefs
  try {
    processed = renderKatex(srcWithRefs)
  } catch {
    processed = srcWithRefs
  }

  // Markdown parse — async:false is in defaults (set via marked.use above)
  try {
    const result = marked.parse(processed, { async: false })
    // marked.parse returns string when async:false; guard against Promise in case of
    // misconfigured extensions in user's environment
    const html = typeof result === 'string' ? result : ''
    if (html.trim()) return html
  } catch (err) {
    console.error('[markdown] marked.parse failed:', err)
  }

  // Fallback: show plain text with line breaks, never raw <pre>
  return textToHtml(src)
}

// ── GUI element + mermaid extraction ─────────────────────────────────────────
export interface GuiElement {
  type: 'gui_element'
  element: string
  data: any
}

export function extractGuiElements(
  text: string
): Array<{ type: 'text' | 'gui' | 'mermaid'; content: string; gui?: GuiElement }> {
  const parts: Array<{ type: 'text' | 'gui' | 'mermaid'; content: string; gui?: GuiElement }> = []
  // Match ```gui ... ``` and ```mermaid ... ``` blocks
  const SPECIAL_PATTERN = /```(gui|mermaid)\n([\s\S]+?)\n```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = SPECIAL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    const blockType = match[1] as 'gui' | 'mermaid'
    const blockContent = match[2]
    if (blockType === 'gui') {
      try {
        const gui = JSON.parse(blockContent) as GuiElement
        parts.push({ type: 'gui', content: match[0], gui })
      } catch {
        parts.push({ type: 'text', content: match[0] })
      }
    } else {
      // mermaid — pass raw diagram source (without fences) to MermaidBlock
      parts.push({ type: 'mermaid', content: blockContent })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return parts
}
