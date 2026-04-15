// ========================================
// TypeScript 类型定义 (Pro版 - 融合speek AI + Dbao)
// ========================================

// ---- 家具相关类型 ----

export interface FurnitureEntity {
  name: string
  words: string[]
  keywords: string[]
  weight: number
  category: string
  custom?: boolean
  addedAt?: number
}

export type ActionType =
  | 'place' | 'delete' | 'rotate' | 'move'
  | 'scale' | 'clear' | 'save' | 'reset'

export interface ActionCommands {
  [key: string]: string[]
}

export interface RecognitionAlternative {
  transcript: string
  confidence: number
}

export interface ContextInfo {
  mainObject: string | null
  referenceObject: string | null
  position: string | null
  quantity: number | null
  modifiers: string[]
}

export interface MatchResult {
  name: string
  score: number
  matchType: string
  confidence: number
  category: string
  custom?: boolean
  details?: string[]
  context?: ContextInfo
  finalScore?: number
}

export interface ParseResult {
  action: ActionType
  model: string
  confidence: number
  matchType: string
  candidates: MatchResult[]
  isCustom: boolean
  context?: ContextInfo | null
  voiceConfidence?: number
}

export interface ValidationResult {
  isValid: boolean
  reason: string
  category?: string
}

export interface HomophoneMap {
  [key: string]: string[]
}

// ---- ASR 相关类型 (来自Dbao) ----

/** ASR引擎类型 */
export type AsrEngine = 'web-speech' | 'backend-whisper'

/** ASR模式 */
export type AsrMode = 'realtime' | 'final'

/** ASR后端响应 */
export interface AsrChunkResponse {
  code: number
  message: string
  data: {
    sessionId: string
    deltaTranscript: string
    transcript: string
    costTime: number
  }
}

export interface AsrFinalResponse {
  code: number
  message: string
  data: {
    sessionId: string
    transcript: string
    rawTranscript?: string
    corrected?: boolean
    costTime: number
  }
}

/** 关键词提取响应 */
export interface KeywordsResponse {
  code: number
  message: string
  data: {
    keywords: string[]
    weights: number[]
    costTime: number
  }
}

/** 后端健康检查响应 */
export interface HealthResponse {
  status: string
  timestamp: string
}

// ---- UI 相关类型 ----

export type RecognitionStatus = 'idle' | 'recording' | 'processing' | 'error'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  message: string
  type: ToastType
}

export type SettingsTab = 'general' | 'furniture' | 'asr' | 'test'

/** 应用设置 (扩展版) */
export interface AppSettings {
  // 语音相关
  enableSpaceHotkey: boolean
  enableF9Hotkey: boolean       // 来自Dbao
  autoExecuteAPI: boolean
  maxRecordingSeconds: number   // 来自Dbao: 自动停止秒数
  enableAudioEnhancement: boolean
  enableAutoStopOnSilence: boolean
  silenceDurationMs: number
  enableTranscriptCleanup: boolean
  enableDomainHotwords: boolean
  enableHybridAsr: boolean
  enableDialectNormalization: boolean
  enabledDialectRegions: string[]
  customDialectMappings: string
  showDialectVisualizationPanel: boolean

  // ASR引擎
  preferredAsrEngine: AsrEngine
  backendApiBase: string        // 来自Dbao: 后端API地址

  // 解析器
  enableFuzzyMatch: boolean
  enablePinyinMatch: boolean

  // UI
  showConfidence: boolean
  showCandidates: boolean
  showKeywords: boolean         // 来自Dbao: 显示关键词
  enableDarkMode: 'auto' | 'light' | 'dark'  // 来自Dbao: 自适应主题
}

// ---- Web Speech API 类型扩展 ----

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

export interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative
  length: number
  isFinal: boolean
}

export interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

export interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult
  length: number
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
}

export interface SpeechRecognitionConstructor {
  new(): SpeechRecognition
}

// ---- 酷家乐 API 类型 ----

export interface KujialeAPI {
  searchAndPlaceModel(
    modelName: string,
    options?: {
      position?: string | null
      referenceObject?: string | null
      rotation?: number
      scale?: number
    },
  ): Promise<void>
  deleteModel(modelName: string): Promise<void>
  rotateModel(modelName: string, angle: number): Promise<void>
  moveModel(modelName: string): Promise<void>
  scaleModel(modelName: string, scale?: number): Promise<void>
  clearAllModels(): Promise<void>
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor
    webkitSpeechRecognition: SpeechRecognitionConstructor
    kujialeAPI?: KujialeAPI
  }
}
