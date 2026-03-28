import { useSettingsStore, SoundKey } from '../stores/settingsStore'

const FILES: Record<SoundKey, string> = {
  ask:         '/sounds/Pregunta.mp3',
  done:        '/sounds/Finalizar.mp3',
  reviewOpen:  '/sounds/Agente Revisión Código Se Abre.mp3',
  reviewClose: '/sounds/Agente Revisión Código Se Cierra.mp3',
  exit:        '/sounds/Exit Sound.mp3',
}

const cache: Partial<Record<SoundKey, HTMLAudioElement>> = {}

export function playSound(key: SoundKey) {
  const { sounds } = useSettingsStore.getState()
  const cfg = sounds[key]
  if (!cfg.enabled) return

  let audio = cache[key]
  if (!audio) {
    audio = new Audio(FILES[key])
    cache[key] = audio
  }
  audio.volume = cfg.volume
  audio.currentTime = 0
  audio.play().catch(() => {})
}

/** Play exit sound and call `onDone` when finished (or after timeout) */
export function playExitSound(onDone: () => void) {
  const { sounds } = useSettingsStore.getState()
  const cfg = sounds.exit
  if (!cfg.enabled) { onDone(); return }

  const audio = new Audio(FILES.exit)
  audio.volume = cfg.volume
  const done = () => onDone()
  audio.addEventListener('ended', done, { once: true })
  audio.addEventListener('error', done, { once: true })
  setTimeout(done, 3000) // safety fallback
  audio.play().catch(done)
}
