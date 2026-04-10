// ========================================
// ASR管理器 - 双通道编排
// Channel A: Web Speech API (浏览器原生, 零配置)
// Channel B: Backend ASR (faster-whisper, 高精度, 可选)
// 自动降级：优先后端ASR，不可用时回退浏览器原生
// ========================================

import { logger } from '../utils/logger'
import { ASR_CONFIG } from '../utils/constants'
import {
  buildAudioConstraints,
  createProcessedRecordingStream,
  SilenceDetector,
} from '../utils/audio'
import { discoverBackend, resetDiscovery } from './api-discovery'
import { BackendAsrSession } from './backend-asr'
import { WebSpeechSession } from './web-speech-asr'
import type { AppSettings, AsrEngine, RecognitionAlternative } from '../types'

export interface AsrManagerCallbacks {
  /** 实时文本更新 */
  onRealtimeTranscript: (text: string, engine: AsrEngine) => void
  /** 最终文本 */
  onFinalTranscript: (text: string, alternatives: RecognitionAlternative[], engine: AsrEngine) => void
  /** 关键词（仅后端ASR） */
  onKeywords: (keywords: string[]) => void
  /** 错误 */
  onError: (message: string) => void
  /** 引擎状态变化 */
  onEngineChange: (engine: AsrEngine, available: boolean) => void
}

export class AsrManager {
  private backendSession: BackendAsrSession | null = null
  private webSpeechSession: WebSpeechSession | null = null
  private mediaRecorder: MediaRecorder | null = null
  private mediaStream: MediaStream | null = null
  private rawMediaStream: MediaStream | null = null
  private processedStreamCleanup: (() => void) | null = null

  private activeEngine: AsrEngine = 'web-speech'
  private backendAvailable = false
  private isRecording = false
  private callbacks: AsrManagerCallbacks
  private settings: AppSettings | null = null
  private silenceDetector = new SilenceDetector()

  // Dbao: 自动停止倒计时
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null
  private maxSeconds: number = 15

  // Dbao: 录音时间
  private recordingStartTime = 0
  private pendingInterimTranscript = ''

  constructor(callbacks: AsrManagerCallbacks) {
    this.callbacks = callbacks
  }

  /**
   * 初始化：检测后端可用性，决定使用哪个引擎
   */
  async init(preferredEngine: AsrEngine, backendHint?: string, maxSeconds?: number): Promise<void> {
    if (maxSeconds) this.maxSeconds = maxSeconds

    if (preferredEngine === 'backend-whisper' || !backendHint) {
      // 尝试发现后端
      const base = await discoverBackend(backendHint || undefined)
      this.backendAvailable = !!base
      this.callbacks.onEngineChange('backend-whisper', this.backendAvailable)
    }

    if (preferredEngine === 'backend-whisper' && this.backendAvailable) {
      this.activeEngine = 'backend-whisper'
    } else if (WebSpeechSession.isSupported()) {
      this.activeEngine = 'web-speech'
    } else {
      this.callbacks.onError('当前浏览器不支持任何ASR引擎')
    }

    logger.log(`ASR引擎: ${this.activeEngine} (后端${this.backendAvailable ? '可用' : '不可用'})`)
  }

  /**
   * 更新运行时设置
   */
  updateSettings(settings: AppSettings): void {
    this.settings = settings
    this.maxSeconds = settings.maxRecordingSeconds
  }

  /**
   * 开始录音
   */
  async startRecording(): Promise<void> {
    if (this.isRecording) return

    try {
      if (this.activeEngine === 'backend-whisper') {
        await this.startBackendRecording()
      } else {
        this.startWebSpeechRecording()
      }

      this.isRecording = true
      this.recordingStartTime = Date.now()

      // Dbao: 自动停止倒计时
      if (this.autoStopTimer) clearTimeout(this.autoStopTimer)
      this.autoStopTimer = setTimeout(() => {
        if (this.isRecording) {
          logger.log(`${this.maxSeconds}s自动停止录音`)
          this.stopRecording()
        }
      }, this.maxSeconds * 1000)
    } catch (e: any) {
      this.callbacks.onError(`无法开始录音: ${e?.message || e}`)
      throw e
    }
  }

  /**
   * 停止录音（非阻塞，来自Dbao的UX设计）
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) return
    this.isRecording = false

    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer)
      this.autoStopTimer = null
    }

    if (this.activeEngine === 'backend-whisper') {
      await this.stopBackendRecording()
    } else {
      this.stopWebSpeechRecording()
    }
  }

  /**
   * 后端ASR：开始
   */
  private async startBackendRecording(): Promise<void> {
    // 获取麦克风
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('浏览器不支持录音')
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints({
        enableAudioEnhancement: this.settings?.enableAudioEnhancement ?? true,
      }),
    })

    this.rawMediaStream = this.mediaStream
    const processed = createProcessedRecordingStream(this.mediaStream, {
      enableAudioEnhancement: this.settings?.enableAudioEnhancement ?? true,
    })
    this.mediaStream = processed.stream
    this.processedStreamCleanup = processed.cleanup

    this.startSilenceDetection()
    this.startHybridWebSpeech()

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : ''

    this.backendSession = new BackendAsrSession()
    this.backendSession.onRealtimeTranscript = (text) => {
      this.callbacks.onRealtimeTranscript(text, 'backend-whisper')
    }
    this.backendSession.onFinalTranscript = (text) => {
      this.callbacks.onFinalTranscript(text, [{ transcript: text, confidence: 1.0 }], 'backend-whisper')
    }
    this.backendSession.onKeywords = (keywords) => {
      this.callbacks.onKeywords(keywords)
    }
    this.backendSession.onError = (msg) => {
      this.callbacks.onError(msg)
    }

    this.mediaRecorder = new MediaRecorder(
      this.mediaStream,
      mime ? { mimeType: mime } : undefined,
    )

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.backendSession?.pushChunk(ev.data)
      }
    }

    this.mediaRecorder.onerror = (e: any) => {
      this.callbacks.onError(`录音错误: ${e?.error?.message || e?.message || e}`)
    }

    // timeslice: 控制实时转写频率
    this.mediaRecorder.start(ASR_CONFIG.UPLOAD_INTERVAL)
    logger.log('后端ASR录音开始')
  }

  /**
   * 后端ASR：停止（Dbao的非阻塞UX）
   */
  private async stopBackendRecording(): Promise<void> {
    this.stopSilenceDetection()

    // 立即停止MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        this.mediaRecorder!.onstop = () => resolve()
        this.mediaRecorder!.stop()
      })
    }

    // 释放麦克风
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }

    if (this.rawMediaStream) {
      this.rawMediaStream.getTracks().forEach((t) => t.stop())
      this.rawMediaStream = null
    }

    this.processedStreamCleanup?.()
    this.processedStreamCleanup = null

    this.stopHybridWebSpeech()

    // 非阻塞：finalize在后台完成
    this.backendSession?.finalize()

    logger.log('后端ASR录音停止')
  }

  /**
   * Web Speech API：开始
   */
  private startWebSpeechRecording(): void {
    this.pendingInterimTranscript = ''
    this.webSpeechSession = new WebSpeechSession()
    this.webSpeechSession.onInterimTranscript = (text) => {
      this.callbacks.onRealtimeTranscript(text, 'web-speech')
    }
    this.webSpeechSession.onFinalTranscript = (text, alternatives) => {
      this.callbacks.onFinalTranscript(text, alternatives, 'web-speech')
    }
    this.webSpeechSession.onError = (msg) => {
      this.callbacks.onError(msg)
    }

    this.webSpeechSession.start()
    logger.log('Web Speech API 录音开始')
  }

  /**
   * Web Speech API：停止
   */
  private stopWebSpeechRecording(): void {
    this.stopSilenceDetection()
    this.webSpeechSession?.stop()
    this.webSpeechSession = null
    this.pendingInterimTranscript = ''
    logger.log('Web Speech API 录音停止')
  }

  /**
   * 后端录音时，使用浏览器原生识别提供更快的 interim 文本
   */
  private startHybridWebSpeech(): void {
    if (!this.backendAvailable) return
    if (!this.settings?.enableHybridAsr) return
    if (!WebSpeechSession.isSupported()) return

    this.pendingInterimTranscript = ''
    this.webSpeechSession = new WebSpeechSession()
    this.webSpeechSession.onInterimTranscript = (text) => {
      this.pendingInterimTranscript = text
      this.callbacks.onRealtimeTranscript(text, 'web-speech')
    }
    this.webSpeechSession.onFinalTranscript = (text) => {
      // 后端模式下，浏览器原生结果仅用于加速 interim 展示，不抢最终结果。
      this.pendingInterimTranscript = text
      this.callbacks.onRealtimeTranscript(text, 'web-speech')
    }
    this.webSpeechSession.onError = () => {
      logger.log('Hybrid Web Speech 不可用，继续使用后端ASR')
    }
    this.webSpeechSession.start()
  }

  private stopHybridWebSpeech(): void {
    this.webSpeechSession?.stop()
    this.webSpeechSession = null
    this.pendingInterimTranscript = ''
  }

  /**
   * 启动端侧静音检测
   */
  private startSilenceDetection(): void {
    if (!this.mediaStream) return
    if (!this.settings?.enableAutoStopOnSilence) return

    void this.silenceDetector.start(this.mediaStream, {
      silenceDurationMs: this.settings.silenceDurationMs,
      onSilence: () => {
        if (!this.isRecording) return
        logger.log('检测到持续静音，自动停止录音')
        void this.stopRecording()
      },
    })
  }

  /**
   * 停止端侧静音检测
   */
  private stopSilenceDetection(): void {
    this.silenceDetector.stop()
  }

  /**
   * 获取录音已持续的秒数
   */
  getElapsedSeconds(): number {
    if (!this.isRecording) return 0
    return Math.floor((Date.now() - this.recordingStartTime) / 1000)
  }

  /**
   * 获取最大录音秒数
   */
  getMaxSeconds(): number {
    return this.maxSeconds
  }

  /**
   * 获取剩余秒数
   */
  getRemainingSeconds(): number {
    if (!this.isRecording) return this.maxSeconds
    const elapsed = (Date.now() - this.recordingStartTime) / 1000
    return Math.max(0, Math.ceil(this.maxSeconds - elapsed))
  }

  /**
   * 获取当前活动引擎
   */
  getActiveEngine(): AsrEngine {
    return this.activeEngine
  }

  /**
   * 后端是否可用
   */
  isBackendAvailable(): boolean {
    return this.backendAvailable
  }

  /**
   * 是否正在录音
   */
  getIsRecording(): boolean {
    return this.isRecording
  }

  /**
   * 切换引擎
   */
  async switchEngine(engine: AsrEngine): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording()
    }

    if (engine === 'backend-whisper' && !this.backendAvailable) {
      this.callbacks.onError('后端ASR不可用，无法切换')
      return
    }

    if (engine === 'web-speech' && !WebSpeechSession.isSupported()) {
      this.callbacks.onError('浏览器不支持 Web Speech API')
      return
    }

    this.activeEngine = engine
    logger.log(`ASR引擎已切换为: ${engine}`)
  }

  /**
   * 重新扫描后端
   */
  async rescanBackend(hint?: string): Promise<boolean> {
    resetDiscovery()
    const base = await discoverBackend(hint)
    this.backendAvailable = !!base
    this.callbacks.onEngineChange('backend-whisper', this.backendAvailable)
    return this.backendAvailable
  }

  /**
   * 重置
   */
  reset(): void {
    if (this.isRecording) {
      this.stopRecording()
    }
    this.stopSilenceDetection()
    this.stopHybridWebSpeech()
    this.backendSession?.reset()
    this.backendSession = null
    this.webSpeechSession = null
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.reset()
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer)
      this.autoStopTimer = null
    }
  }
}
