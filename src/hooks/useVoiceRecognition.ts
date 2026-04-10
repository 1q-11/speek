// ========================================
// 语音识别 Hook (Pro版 - 双通道ASR + 倒计时 + 非阻塞停止)
// ========================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { AsrManager } from '../services/asr-manager'
import { getVoiceController } from '../utils/controller'
import { getSettingsManager } from '../utils/settings-manager'
import { loadReplacementMap } from '../utils/utils'
import { logger } from '../utils/logger'
import {
  normalizeTranscript,
  stripTranscriptPunctuation,
} from '../utils/transcript-normalizer'
import type {
  RecognitionStatus,
  ParseResult,
  AsrEngine,
  RecognitionAlternative,
} from '../types'

interface UseVoiceRecognitionReturn {
  isRecording: boolean
  status: RecognitionStatus
  transcript: string
  setTranscript: (text: string) => void  // 来自Dbao: 可编辑
  interimTranscript: string
  confidence: number
  parseResult: ParseResult | null
  error: string | null
  activeEngine: AsrEngine
  backendAvailable: boolean
  remainingSeconds: number
  keywords: string[]
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  resetAll: () => void
  switchEngine: (engine: AsrEngine) => Promise<void>
  rescanBackend: () => Promise<boolean>
  parseTranscript: (text: string) => void
  syncSettings: () => void
}

export function useVoiceRecognition(): UseVoiceRecognitionReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState<RecognitionStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeEngine, setActiveEngine] = useState<AsrEngine>('web-speech')
  const [backendAvailable, setBackendAvailable] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(15)
  const [keywords, setKeywords] = useState<string[]>([])

  const asrManagerRef = useRef<AsrManager | null>(null)
  const controllerRef = useRef(getVoiceController())
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const replacementMapRef = useRef<Map<string, string>>(new Map())

  const syncSettings = useCallback(() => {
    const manager = asrManagerRef.current
    if (!manager) return
    const settings = getSettingsManager().getSettings()
    manager.updateSettings(settings)
    setRemainingSeconds(manager.getIsRecording() ? manager.getRemainingSeconds() : manager.getMaxSeconds())
  }, [])

  const normalizeAsrText = useCallback((text: string) => {
    const settings = getSettingsManager().getSettings()
    return normalizeTranscript(text, {
      replacementMap: replacementMapRef.current,
      enableCleanup: settings.enableTranscriptCleanup,
      enableDomainHotwords: settings.enableDomainHotwords,
      customFurniture: controllerRef.current.getCustomFurniture(),
    })
  }, [])

  // 初始化
  useEffect(() => {
    const settings = getSettingsManager().getSettings()

    // 加载离线替换映射
    loadReplacementMap('/data/asr_replace_zh.txt').then((map) => {
      replacementMapRef.current = map
      if (map.size > 0) {
        logger.log(`已加载 ${map.size} 条离线替换映射`)
      }
    })

    // 创建ASR管理器
    const manager = new AsrManager({
      onRealtimeTranscript: (text, engine) => {
        const corrected = normalizeAsrText(text)
        setInterimTranscript(corrected)
        // 实时文本也写入主文本（Dbao的UX：录音过程中就能看到）
        setTranscript(corrected)
      },
      onFinalTranscript: (text, alternatives, engine) => {
        const corrected = normalizeAsrText(text)
        const normalizedAlternatives = alternatives.map((item) => ({
          ...item,
          transcript: stripTranscriptPunctuation(normalizeAsrText(item.transcript)),
        }))
        setTranscript(corrected)
        setInterimTranscript('')

        // 使用控制器解析
        const result = controllerRef.current.process(
          stripTranscriptPunctuation(corrected),
          normalizedAlternatives,
        )
        setParseResult(result)
        if (result.confidence > 0) {
          setConfidence(result.confidence)
        }
      },
      onKeywords: (kw) => {
        setKeywords(kw)
      },
      onError: (msg) => {
        setError(msg)
        logger.error('ASR错误:', msg)
      },
      onEngineChange: (engine, available) => {
        if (engine === 'backend-whisper') {
          setBackendAvailable(available)
        }
      },
    })

    asrManagerRef.current = manager
    manager.updateSettings(settings)

    // 初始化ASR引擎
    manager.init(
      settings.preferredAsrEngine,
      settings.backendApiBase || undefined,
      settings.maxRecordingSeconds,
    ).then(() => {
      setActiveEngine(manager.getActiveEngine())
      setBackendAvailable(manager.isBackendAvailable())
      setRemainingSeconds(manager.getMaxSeconds())
    })

    return () => {
      manager.destroy()
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [normalizeAsrText])

  // 开始录音
  const startRecording = useCallback(async () => {
    const manager = asrManagerRef.current
    if (!manager) return

    try {
      setError(null)
      setStatus('recording')
      setIsRecording(true)
      setTranscript('')
      setInterimTranscript('')
      setConfidence(0)
      setParseResult(null)
      setKeywords([])

      await manager.startRecording()

      // Dbao: 倒计时更新
      countdownRef.current = setInterval(() => {
        const remaining = manager.getRemainingSeconds()
        setRemainingSeconds(remaining)
        if (remaining <= 0) {
          // 自动停止时清理倒计时
          if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
          }
          setIsRecording(false)
          setStatus('idle')
        }
      }, 200)

      logger.log('开始录音')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '无法启动麦克风，请检查权限'
      setError(msg)
      setStatus('error')
      setIsRecording(false)
    }
  }, [])

  // 停止录音（Dbao: 非阻塞，秒出结果）
  const stopRecording = useCallback(async () => {
    const manager = asrManagerRef.current
    if (!manager) return

    // 立即更新UI（非阻塞UX）
    setIsRecording(false)
    setStatus('idle')

    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setRemainingSeconds(manager.getMaxSeconds())

    try {
      await manager.stopRecording()
      logger.log('停止录音')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '停止录音失败'
      setError(msg)
    }
  }, [])

  // 重置
  const resetAll = useCallback(() => {
    asrManagerRef.current?.reset()
    setTranscript('')
    setInterimTranscript('')
    setConfidence(0)
    setParseResult(null)
    setError(null)
    setKeywords([])
    setStatus('idle')
    setIsRecording(false)
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setRemainingSeconds(asrManagerRef.current?.getMaxSeconds() ?? 15)
  }, [])

  // 切换引擎
  const switchEngine = useCallback(async (engine: AsrEngine) => {
    const manager = asrManagerRef.current
    if (!manager) return
    await manager.switchEngine(engine)
    setActiveEngine(manager.getActiveEngine())
  }, [])

  // 重新扫描后端
  const rescanBackend = useCallback(async () => {
    const manager = asrManagerRef.current
    if (!manager) return false
    const settings = getSettingsManager().getSettings()
    const available = await manager.rescanBackend(settings.backendApiBase || undefined)
    setBackendAvailable(available)
    return available
  }, [])

  // 手动解析文本（来自Dbao: 编辑后重新解析）
  const parseTranscript = useCallback((text: string) => {
    const normalized = normalizeAsrText(text)
    if (!normalized.trim()) {
      setParseResult(null)
      setConfidence(0)
      return
    }
    setTranscript(normalized)
    const result = controllerRef.current.process(stripTranscriptPunctuation(normalized))
    setParseResult(result)
    if (result.confidence > 0) {
      setConfidence(result.confidence)
    }
  }, [normalizeAsrText])

  return {
    isRecording,
    status,
    transcript,
    setTranscript,
    interimTranscript,
    confidence,
    parseResult,
    error,
    activeEngine,
    backendAvailable,
    remainingSeconds,
    keywords,
    startRecording,
    stopRecording,
    resetAll,
    switchEngine,
    rescanBackend,
    parseTranscript,
    syncSettings,
  }
}
