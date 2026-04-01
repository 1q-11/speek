// ========================================
// 浏览器原生 Web Speech API ASR (来自speek AI)
// ========================================

import { logger } from '../utils/logger'
import type {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  RecognitionAlternative,
} from '../types'

/**
 * Web Speech API ASR 会话
 * 零配置、无需后端、浏览器原生支持
 */
export class WebSpeechSession {
  private recognition: SpeechRecognition | null = null
  private isRunning = false

  /** 实时（interim）转写回调 */
  onInterimTranscript: ((text: string) => void) | null = null
  /** 最终转写回调 */
  onFinalTranscript: ((text: string, alternatives: RecognitionAlternative[]) => void) | null = null
  /** 错误回调 */
  onError: ((error: string) => void) | null = null
  /** 状态变化回调 */
  onStateChange: ((running: boolean) => void) | null = null

  /**
   * 检查浏览器是否支持 Web Speech API
   */
  static isSupported(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  /**
   * 创建并配置 SpeechRecognition 实例
   */
  private createRecognition(): SpeechRecognition {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      throw new Error('浏览器不支持 Web Speech API')
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'
    recognition.maxAlternatives = 3

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ''
      let finalTranscript = ''
      const alternatives: RecognitionAlternative[] = []

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
          // 收集所有候选
          for (let j = 0; j < result.length; j++) {
            alternatives.push({
              transcript: result[j].transcript,
              confidence: result[j].confidence,
            })
          }
        } else {
          interimTranscript += result[0].transcript
        }
      }

      if (interimTranscript) {
        this.onInterimTranscript?.(interimTranscript)
      }

      if (finalTranscript) {
        this.onFinalTranscript?.(finalTranscript, alternatives)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      logger.error('Web Speech API 错误:', event.error)

      // 某些错误不需要停止（如 no-speech）
      if (event.error === 'no-speech') {
        logger.log('未检测到语音')
        return
      }

      if (event.error === 'aborted') {
        // 主动停止时触发，忽略
        return
      }

      this.onError?.(this.getErrorMessage(event.error))
    }

    recognition.onend = () => {
      // continuous 模式下可能意外停止，自动重启
      if (this.isRunning) {
        logger.log('Web Speech API 意外停止，自动重启')
        try {
          recognition.start()
        } catch {
          this.isRunning = false
          this.onStateChange?.(false)
        }
      } else {
        this.onStateChange?.(false)
      }
    }

    recognition.onstart = () => {
      this.onStateChange?.(true)
    }

    return recognition
  }

  /**
   * 开始识别
   */
  start(): void {
    if (this.isRunning) return

    if (!WebSpeechSession.isSupported()) {
      this.onError?.('浏览器不支持 Web Speech API')
      return
    }

    try {
      this.recognition = this.createRecognition()
      this.recognition.start()
      this.isRunning = true
      logger.log('Web Speech API 开始识别')
    } catch (e: any) {
      this.onError?.(`启动语音识别失败: ${e?.message || e}`)
    }
  }

  /**
   * 停止识别
   */
  stop(): void {
    if (!this.isRunning) return
    this.isRunning = false

    try {
      this.recognition?.stop()
    } catch {
      // 忽略停止时的错误
    }

    this.recognition = null
    logger.log('Web Speech API 已停止')
  }

  /**
   * 是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning
  }

  /**
   * 转换错误码为友好消息
   */
  private getErrorMessage(error: string): string {
    const messages: Record<string, string> = {
      'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问',
      'no-speech': '未检测到语音',
      'audio-capture': '无法捕获音频，请检查麦克风',
      'network': '网络错误，请检查网络连接',
      'service-not-allowed': '语音服务不可用',
      'language-not-supported': '不支持当前语言',
    }
    return messages[error] || `语音识别错误: ${error}`
  }
}
