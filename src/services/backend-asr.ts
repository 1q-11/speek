// ========================================
// 后端ASR服务 (来自Dbao: 累计上传 + 双模式 + 队列合并)
// ========================================

import { apiFetch, readJsonSafe } from './api-discovery'
import { logger } from '../utils/logger'
import { ASR_CONFIG } from '../utils/constants'
import type { AsrChunkResponse, AsrFinalResponse, KeywordsResponse } from '../types'

/**
 * 后端ASR会话管理
 * 核心特性（来自Dbao）：
 * - 累计音频上传：每次发送从开头到当前的完整WebM，避免单个chunk解码失败
 * - 双模式ASR：实时用快速参数，最终用高精度参数
 * - 上传队列合并：只保留最新的累计上传，防止积压
 * - 非阻塞停止：停止时立即显示实时结果，final在后台完成
 */
export class BackendAsrSession {
  private sessionId: string | null = null
  private chunks: Blob[] = []
  private uploadQueue: QueueItem[] = []
  private uploading = false
  private chunkSeq = 0
  private latestSeqQueued = 0
  private lastRealtimeTranscript = ''

  /** 实时转写回调 */
  onRealtimeTranscript: ((text: string) => void) | null = null
  /** 最终转写回调 */
  onFinalTranscript: ((text: string) => void) | null = null
  /** 关键词回调 */
  onKeywords: ((keywords: string[]) => void) | null = null
  /** 错误回调 */
  onError: ((error: string) => void) | null = null

  /**
   * 接收一个音频chunk（由MediaRecorder ondataavailable触发）
   */
  pushChunk(chunk: Blob): void {
    if (!chunk || chunk.size === 0) return
    this.chunks.push(chunk)

    // 累计上传：拼成一个完整WebM
    this.chunkSeq += 1
    this.latestSeqQueued = this.chunkSeq

    const cumulativeBlob = new Blob(this.chunks, {
      type: this.chunks[0]?.type || 'audio/webm',
    })

    const item: QueueItem = {
      blob: cumulativeBlob,
      attempt: 0,
      cumulative: true,
      seq: this.chunkSeq,
    }

    // 队列合并：只保留最新的上传任务
    if (this.uploadQueue.length === 0) {
      this.uploadQueue.push(item)
    } else {
      this.uploadQueue[this.uploadQueue.length - 1] = item
    }

    this.drainQueue()
  }

  /**
   * 排空上传队列（串行 + 重试）
   */
  private async drainQueue(): Promise<void> {
    if (this.uploading) return
    this.uploading = true

    try {
      while (this.uploadQueue.length > 0) {
        const item = this.uploadQueue[0]
        try {
          const form = new FormData()
          form.append('chunk', item.blob, 'chunk.webm')
          if (this.sessionId) form.append('sessionId', this.sessionId)
          if (item.cumulative) form.append('cumulative', '1')

          const resp = await apiFetch('/api/asr/chunk', { method: 'POST', body: form }, 120000)
          const json = await readJsonSafe<AsrChunkResponse>(resp, { throwOnHttpError: true })

          if (json?.data?.sessionId) this.sessionId = json.data.sessionId

          // 忽略过期的累计响应，避免UI跳回
          if (!item.cumulative || item.seq >= this.latestSeqQueued) {
            if (json?.data?.transcript != null) {
              this.lastRealtimeTranscript = json.data.transcript || ''
              this.onRealtimeTranscript?.(this.lastRealtimeTranscript)
            }
          }

          this.uploadQueue.shift()
        } catch (e: any) {
          item.attempt += 1
          if (item.attempt >= 3) {
            logger.warn('实时转写分片上传失败（已放弃）:', e?.message)
            this.uploadQueue.shift()
            continue
          }
          const backoff = 400 * item.attempt
          logger.log(`实时转写重试（第${item.attempt}次），${backoff}ms后`)
          await new Promise((r) => setTimeout(r, backoff))
        }
      }
    } finally {
      this.uploading = false
    }
  }

  /**
   * 等待实时上传队列空闲
   */
  private async waitIdle(maxMs = 1200): Promise<void> {
    const until = Date.now() + maxMs
    while ((this.uploading || this.uploadQueue.length > 0) && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 50))
    }
  }

  /**
   * 获取当前实时文本
   */
  getRealtimeTranscript(): string {
    return this.lastRealtimeTranscript
  }

  /**
   * 完成录音，发送最终转写请求（非阻塞）
   * 返回时立即给出实时结果，final在后台异步完成
   */
  async finalize(): Promise<string> {
    // 立即返回实时结果
    const immediateResult = this.lastRealtimeTranscript

    // 后台：先同步最新实时结果
    this.backgroundFinalize()

    return immediateResult
  }

  /**
   * 后台执行最终转写 + 关键词提取
   */
  private async backgroundFinalize(): Promise<void> {
    try {
      // 等待实时队列处理完
      await this.waitIdle(1200)

      // 尝试同步最新实时结果
      if (this.sessionId) {
        try {
          const r = await apiFetch(
            `/api/result?sessionId=${encodeURIComponent(this.sessionId)}`,
            { method: 'GET' },
            1500,
          )
          const j = await readJsonSafe<AsrChunkResponse>(r, { throwOnHttpError: true })
          if (j?.data?.transcript != null) {
            this.lastRealtimeTranscript = j.data.transcript
            this.onRealtimeTranscript?.(this.lastRealtimeTranscript)
          }
        } catch {
          // 静默：实时同步是可选的
        }
      }

      // 发送最终转写请求（高精度参数）
      if (this.chunks.length === 0) return

      const blob = new Blob(this.chunks, {
        type: this.chunks[0]?.type || 'audio/webm',
      })
      const form = new FormData()
      form.append('audioFile', blob, 'audio.webm')
      if (this.sessionId) form.append('sessionId', this.sessionId)

      const resp = await apiFetch('/api/asr/final', { method: 'POST', body: form }, 180000)
      const json = await readJsonSafe<AsrFinalResponse>(resp, { throwOnHttpError: false })

      this.sessionId = json?.data?.sessionId || this.sessionId
      const transcript = json?.data?.transcript || ''

      if (transcript) {
        this.onFinalTranscript?.(transcript)
      }

      if (!resp.ok) {
        this.onError?.(`转写失败: ${json?.message || `HTTP ${resp.status}`}`)
        return
      }

      // 关键词提取
      if (transcript) {
        this.extractKeywords(transcript)
      }
    } catch (e: any) {
      this.onError?.(`最终转写失败: ${e?.message || e}`)
    }
  }

  /**
   * 后台提取关键词
   */
  private async extractKeywords(transcript: string): Promise<void> {
    try {
      const form = new FormData()
      form.append('transcript', transcript)
      if (this.sessionId) form.append('sessionId', this.sessionId)

      const resp = await apiFetch('/api/keywords', { method: 'POST', body: form }, 30000)
      const json = await readJsonSafe<KeywordsResponse>(resp, { throwOnHttpError: true })
      const keywords = json?.data?.keywords || []
      this.onKeywords?.(keywords)
    } catch (e: any) {
      logger.warn('关键词提取失败:', e?.message)
    }
  }

  /**
   * 重置会话
   */
  reset(): void {
    this.sessionId = null
    this.chunks = []
    this.uploadQueue = []
    this.chunkSeq = 0
    this.latestSeqQueued = 0
    this.lastRealtimeTranscript = ''
  }

  /**
   * 获取sessionId
   */
  getSessionId(): string | null {
    return this.sessionId
  }
}

interface QueueItem {
  blob: Blob
  attempt: number
  cumulative: boolean
  seq: number
}
