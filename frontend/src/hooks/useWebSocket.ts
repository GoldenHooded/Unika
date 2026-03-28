import { useEffect, useRef, useCallback } from 'react'
import { useProjectStore, Project } from '../stores/projectStore'
import { useChatStore } from '../stores/chatStore'
import { useUnityStore } from '../stores/unityStore'
import { useReviewStore } from '../stores/reviewStore'
import { useDebugStore } from '../stores/debugStore'
import { useUsageStore } from '../stores/usageStore'
import { playSound } from '../utils/sounds'

const WS_URL = 'ws://127.0.0.1:8765/ws'
const RECONNECT_DELAY = 3000

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disconnectNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentMessageId = useRef<string | null>(null)
  const taskStartMsgCount = useRef<number>(0)

  const addMessage = useChatStore(s => s.addMessage)
  const appendToken = useChatStore(s => s.appendToken)
  const setStreaming = useChatStore(s => s.setStreaming)
  const addCommandToMessage    = useChatStore(s => s.addCommandToMessage)
  const updateCommandInMessage = useChatStore(s => s.updateCommandInMessage)
  const setAskPending = useChatStore(s => s.setAskPending)
  const setProjects = useProjectStore(s => s.setProjects)
  const setActiveProject = useProjectStore(s => s.setActiveProject)
  const setActiveConversation = useProjectStore(s => s.setActiveConversation)
  const setConnected = useUnityStore(s => s.setConnected)
  const setIndexing = useUnityStore(s => s.setIndexing)
  const setPluginInstalled = useUnityStore(s => s.setPluginInstalled)

  // Returns the ID of the last assistant message (fallback when currentMessageId is null)
  const getLastAssistantMsgId = (): string | null => {
    const msgs = useChatStore.getState().messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i].id
    }
    return null
  }

  const pushDebugEvent = useCallback((event: any) => {
    const fallbackChannel = useProjectStore.getState().activeConversationId || 'general'
    useDebugStore.getState().addEvent({
      ...event,
      timestamp_ms: event.timestamp_ms ?? Date.now(),
      channel: event.channel ?? fallbackChannel,
    })
  }, [])

  const closeStreamingState = useCallback(() => {
    setStreaming(false)
    const chat = useChatStore.getState()
    const msgs = chat.messages
    const last = msgs[msgs.length - 1]
    if (last?.streaming) {
      chat.updateLastMessage({ streaming: false })
    }
    currentMessageId.current = null
  }, [setStreaming])

  const appendAssistantNotice = useCallback((content: string) => {
    if (!content?.trim()) return
    const msgs = useChatStore.getState().messages
    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant' && !last.streaming && last.content === content) return
    addMessage({ role: 'assistant', content, id: `notice-${Date.now()}` })
  }, [addMessage])

  const handleTaskFailure = useCallback((data: any) => {
    closeStreamingState()
    const content = data.message || (data.error ? `[Error] ${data.error}` : 'La tarea falló por un error no especificado.')
    appendAssistantNotice(content)
  }, [appendAssistantNotice, closeStreamingState])

  const handleMessage = useCallback((data: any) => {
    if (data.type === 'debug_event') {
      pushDebugEvent(data)
    }

    // Route planning channel events into main chat
    if (data.channel === 'planning') {
      switch (data.type) {
        case 'message_token': {
          const msgs = useChatStore.getState().messages
          const last = msgs[msgs.length - 1]
          if (!last || !last.streaming) {
            const planId = data.message_id ?? `plan-${Date.now()}`
            addMessage({ role: 'assistant', content: data.content ?? '', id: planId, streaming: true })
          } else {
            appendToken(data.content ?? '')
          }
          break
        }
        case 'message_end':
          useChatStore.getState().updateLastMessage({ streaming: false })
          setStreaming(false)
          break
        case 'plan_ready':
          // Plan is done streaming — nothing extra needed, message is already in chat
          break
      }
      return
    }

    // Route review channel events to reviewStore
    if (data.channel === 'review' || data.channel?.startsWith('subagent_')) {
      const rs = useReviewStore.getState()
      switch (data.type) {
        case 'turn_start': {
          rs.setStreaming(true)
          const reviewMsgId = data.message_id ?? `rev-${Date.now()}`
          rs.setCurrentMessageId(reviewMsgId)
          rs.addMessage({ id: reviewMsgId, role: 'assistant', content: '', streaming: true, ts: Date.now() })
          break
        }
        case 'message_token':
          rs.appendToken(data.content)
          break
        case 'message_end':
          rs.updateLastMessage({ streaming: false })
          rs.setStreaming(false)
          break
        case 'command_building': {
          const rMsgId = rs.currentMessageId ?? 'unknown'
          const tempId = `_bld_${data.index}_${rMsgId}`
          const rState = useReviewStore.getState()
          const parentMsg = rState.messages.find(m => m.id === rMsgId)
          const existing = parentMsg?.commands?.find(c => c.id === tempId)
          if (!existing) {
            rs.addCommandToMessage(rMsgId, {
              id: tempId, name: data.name, args: {}, status: 'building', args_raw: data.args_raw ?? '',
            })
          } else {
            rs.updateCommandInMessage(rMsgId, tempId, { name: data.name, args_raw: data.args_raw ?? '' })
          }
          break
        }
        case 'command_start': {
          const rMsgId = rs.currentMessageId ?? 'unknown'
          const rState = useReviewStore.getState()
          const parentMsg = rState.messages.find(m => m.id === rMsgId)
          const buildingCmd = parentMsg?.commands?.find(
            c => c.status === 'building' && c.name === data.name,
          )
          if (buildingCmd) {
            rs.updateCommandInMessage(rMsgId, buildingCmd.id, {
              id: data.id, name: data.name, args: data.args ?? {}, status: 'running', args_raw: undefined,
            })
          } else {
            rs.addCommandToMessage(rMsgId, {
              id: data.id, name: data.name, args: data.args ?? {}, status: 'running',
            })
          }
          break
        }
        case 'command_result':
          rs.updateCommandInMessage(rs.currentMessageId ?? 'unknown', data.id, {
            result: data.result, status: data.error ? 'error' : 'done', duration_ms: data.duration_ms,
          })
          break
        case 'review_start':
          rs.setActive(true)
          rs.setStreaming(true)
          playSound('reviewOpen')
          break
        case 'review_done':
          playSound('reviewClose')
          rs.setDone(data.status ?? 'approved', data.summary ?? '')
          setTimeout(() => {
            useReviewStore.getState().setActive(false)
            useReviewStore.getState().reset()
          }, 2800)
          break
        case 'subagent_start': {
          rs.setSubagentLabel(data.subagent ?? null)
          rs.setActive(true)
          rs.setStreaming(true)
          // Create a parent message so commands have somewhere to attach
          const subMsgId = `sub-${data.subagent}-${Date.now()}`
          rs.setCurrentMessageId(subMsgId)
          rs.addMessage({ id: subMsgId, role: 'assistant', content: '', streaming: true, ts: Date.now() })
          playSound('reviewOpen')
          break
        }
        case 'subagent_done':
          rs.setSubagentLabel(null)
          rs.setStreaming(false)
          rs.updateLastMessage({ streaming: false })
          // Auto-close the panel after a short delay so the user can see the result
          setTimeout(() => {
            useReviewStore.getState().setActive(false)
            useReviewStore.getState().reset()
          }, 3000)
          break
        case 'thinking_token':
          rs.appendThinkingToken(data.content ?? '')
          break
        case 'task_done':
          rs.setStreaming(false)
          rs.updateLastMessage({ streaming: false })
          break
      }
      return
    }

    switch (data.type) {
      case 'welcome':
        if (data.projects) setProjects(data.projects)
        break

      case 'project_opened': {
        const proj: Project = data.project
        const convId: string = data.conversation_id ?? ''
        if (data.projects) setProjects(data.projects)
        setActiveProject(proj.id)
        setActiveConversation(convId)
        useChatStore.getState().clearMessages()
        break
      }

      case 'message_ack':
        addMessage({ role: data.role, content: data.content, id: Date.now().toString() })
        break

      case 'message_queued':
        addMessage({
          role: 'user',
          content: data.text,
          id: `queued-${Date.now()}`,
          queued: true,
        })
        break

      case 'turn_start': {
        setStreaming(true)
        // Always create an assistant message immediately so commands appear AFTER the user message,
        // even when the agent produces no text and goes straight to tool calls.
        const turnMsgId = data.message_id ?? `msg-${Date.now()}`
        addMessage({ id: turnMsgId, role: 'assistant', content: '', streaming: true, ts: Date.now() })
        currentMessageId.current = turnMsgId
        if (data.turn === 1) {
          taskStartMsgCount.current = useChatStore.getState().messages.length - 1
        }
        break
      }

      case 'message_token': {
        const msgs = useChatStore.getState().messages
        const lastMsg = msgs[msgs.length - 1]
        if (!lastMsg || !lastMsg.streaming) {
          // Fallback: shouldn't normally happen since turn_start creates the message
          const msgId = data.message_id ?? currentMessageId.current ?? `msg-${Date.now()}`
          addMessage({ role: 'assistant', content: data.content, id: msgId, streaming: true })
          currentMessageId.current = msgId
        } else {
          appendToken(data.content)
          if (!currentMessageId.current) currentMessageId.current = lastMsg.id
        }
        break
      }

      case 'thinking_token':
        // Main-channel thinking tokens (e.g. THINK command from main agent)
        useReviewStore.getState().appendThinkingToken(data.content ?? '')
        break

      case 'message_end': {
        const allMsgs = useChatStore.getState().messages
        const lastStreaming = allMsgs[allMsgs.length - 1]
        if (lastStreaming?.streaming) {
          useChatStore.getState().updateLastMessage({ streaming: false })
        }
        setStreaming(false)
        break
      }

      case 'command_building': {
        const tempId = `_bld_${data.index}`
        const msgId = currentMessageId.current ?? getLastAssistantMsgId()
        if (!msgId) break
        const msg = useChatStore.getState().messages.find(m => m.id === msgId)
        const existing = msg?.commands?.find(c => c.id === tempId)
        if (!existing) {
          addCommandToMessage(msgId, { id: tempId, name: data.name ?? '…', args: {}, status: 'building', args_raw: data.args_raw ?? '' })
        } else {
          updateCommandInMessage(msgId, tempId, { name: data.name ?? existing.name, args_raw: data.args_raw ?? '' })
        }
        break
      }

      case 'command_start': {
        const msgId = currentMessageId.current ?? getLastAssistantMsgId()
        if (!msgId) break
        const msgs = useChatStore.getState().messages
        const msg = msgs.find(m => m.id === msgId)
        const buildingCmd = msg?.commands?.find(c => c.status === 'building' && c.name === data.name)
        if (buildingCmd) {
          updateCommandInMessage(msgId, buildingCmd.id, {
            id: data.id, name: data.name, args: data.args ?? {}, status: 'running', args_raw: undefined,
          })
        } else {
          addCommandToMessage(msgId, { id: data.id, name: data.name, args: data.args ?? {}, status: 'running' })
        }
        break
      }

      case 'command_result': {
        const msgId = currentMessageId.current ?? getLastAssistantMsgId()
        if (!msgId) break
        updateCommandInMessage(msgId, data.id, {
          result: data.result, status: data.error ? 'error' : 'done', duration_ms: data.duration_ms,
        })
        break
      }

      case 'token_usage': {
        const prompt     = data.prompt_tokens     ?? 0
        const completion = data.completion_tokens ?? 0
        // Attach to message bubble
        const targetId = data.message_id
        if (targetId) {
          useChatStore.getState().setMessageUsage(targetId, {
            prompt, completion, total: data.total_tokens ?? 0,
          })
        }
        // Accumulate into session usage meter
        useUsageStore.getState().addUsage(
          data.channel ?? 'main',
          data.model   ?? 'deepseek-chat',
          prompt,
          completion,
        )
        break
      }

      case 'queue_item_cancelled': {
        // Find the queued message by content and remove it visually
        const msgs = useChatStore.getState().messages
        const cancelled = msgs.find((m) => m.queued && m.content === data.text)
        if (cancelled) useChatStore.getState().removeMessage(cancelled.id)
        break
      }

      case 'task_done': {
        closeStreamingState()
        if (!data.cancelled) playSound('done')
        break
      }

      case 'task_interrupted':
        closeStreamingState()
        break

      case 'task_failed':
        handleTaskFailure(data)
        break

      case 'error':
        // Route to debug panel only — do not surface in chat
        pushDebugEvent({ phase: 'backend_error', timestamp_ms: Date.now(), ...data })
        break

      case 'api_error':
        // DeepSeek API errors (400/500, format errors, etc.) — debug only
        pushDebugEvent({ phase: 'api_error', timestamp_ms: Date.now(), ...data })
        break

      case 'content_filter_error':
        // DeepSeek content filter blocked the output after both attempts failed
        pushDebugEvent({ phase: 'content_filter', timestamp_ms: Date.now(), ...data })
        closeStreamingState()
        appendAssistantNotice(data.message ?? '⚠️ El modelo bloqueó esta respuesta por su filtro de contenido. Prueba a reformular el mensaje.')
        break

      case 'max_turns_reached':
        pushDebugEvent({
          phase: 'max_turns_reached',
          timestamp_ms: Date.now(),
          ...data,
        })
        break

      case 'ask_questions':
        setAskPending({ id: data.id, questions: data.questions })
        playSound('ask')
        break

      case 'history_loaded':
        useChatStore.getState().setMessages(data.messages || [])
        break

      case 'project_updated': {
        if (data.project) useProjectStore.getState().updateProject(data.project.id, data.project)
        if (data.new_conversation_id) {
          setActiveConversation(data.new_conversation_id)
          useChatStore.getState().clearMessages()
        }
        break
      }

      case 'project_created':
      case 'projects_updated':
        if (data.projects) setProjects(data.projects)
        break

      case 'unity_connected':
        setConnected(true)
        break

      case 'unity_disconnected':
        setConnected(false)
        break

      case 'plugin_installed':
        setPluginInstalled(true)
        break

      case 'rag_indexing_started':
        setIndexing(true)
        break

      case 'rag_indexing_done':
      case 'rag_indexing_error':
        setIndexing(false)
        break

      case 'doc_updated':
        window.dispatchEvent(new CustomEvent('doc_updated', { detail: data }))
        break

      case 'rag_indexed':
        console.log(`[RAG] Indexed ${data.count} chunks for project ${data.project_id}`)
        break

      case 'plan_ready':
        // Already handled in channel === 'planning' block; this is a safety fallback
        break
    }
  }, [
    addMessage,
    appendAssistantNotice,
    appendToken,
    closeStreamingState,
    handleTaskFailure,
    setStreaming,
    addCommandToMessage,
    updateCommandInMessage,
    setAskPending,
    setProjects,
    setActiveProject,
    setActiveConversation,
    setConnected,
    setIndexing,
    setPluginInstalled,
    pushDebugEvent,
  ])

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    const socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      console.log('[WS] Connected to Unika backend')
      // Cancel any pending disconnect notice — connection was restored in time
      if (disconnectNoticeTimer.current) {
        clearTimeout(disconnectNoticeTimer.current)
        disconnectNoticeTimer.current = null
      }
      pushDebugEvent({
        phase: 'socket_state',
        state: 'connected',
        timestamp_ms: Date.now(),
      })
    }

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        handleMessage(data)
      } catch {}
    }

    socket.onclose = () => {
      console.log('[WS] Disconnected. Reconnecting...')
      pushDebugEvent({
        phase: 'socket_state',
        state: 'disconnected',
        timestamp_ms: Date.now(),
      })
      if (useChatStore.getState().streaming) {
        closeStreamingState()
        // Delay the user-visible notice — multi-turn gaps can cause brief
        // disconnects that auto-heal before the user notices anything.
        // Only show if we haven't reconnected within RECONNECT_DELAY + 1s.
        disconnectNoticeTimer.current = setTimeout(() => {
          disconnectNoticeTimer.current = null
          appendAssistantNotice('La conexión con el backend se cerró mientras la tarea seguía en curso.')
        }, RECONNECT_DELAY + 1000)
      }
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY)
    }

    socket.onerror = () => {
      pushDebugEvent({
        phase: 'socket_state',
        state: 'error',
        timestamp_ms: Date.now(),
      })
      socket.close()
    }

    ws.current = socket
  }, [appendAssistantNotice, closeStreamingState, handleMessage, pushDebugEvent])

  useEffect(() => {
    connect()
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current)
      disconnectNoticeTimer.current && clearTimeout(disconnectNoticeTimer.current)
      ws.current?.close()
    }
  }, [connect])

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  return { send, ws }
}
