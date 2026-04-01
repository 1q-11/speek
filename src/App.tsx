// ========================================
// App.tsx - 根组件 (Pro版)
// 融合speek AI布局 + Dbao可编辑转写/关键词/F9热键
// ========================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useVoiceRecognition } from './hooks/useVoiceRecognition'
import { useToast } from './hooks/useToast'
import { Toast } from './components/Toast'
import { Settings } from './components/Settings'
import { AddFurnitureModal } from './components/AddFurnitureModal'
import { FurnitureListModal } from './components/FurnitureListModal'
import { TranscriptEditor } from './components/TranscriptEditor'
import { getVoiceController } from './utils/controller'
import { getSettingsManager } from './utils/settings-manager'
import styles from './App.module.css'

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showAddFurniture, setShowAddFurniture] = useState(false)
  const [showFurnitureList, setShowFurnitureList] = useState(false)
  const [addFurnitureInitialName, setAddFurnitureInitialName] = useState('')
  const [customFurnitureCount, setCustomFurnitureCount] = useState(0)

  const {
    isRecording,
    status: recognitionStatus,
    transcript,
    setTranscript,
    interimTranscript,
    confidence,
    parseResult,
    error,
    activeEngine,
    backendAvailable,
    remainingSeconds,
    startRecording,
    stopRecording,
    resetAll,
    switchEngine,
    rescanBackend,
    parseTranscript,
  } = useVoiceRecognition()

  const { toast, showToast } = useToast()
  const controller = getVoiceController()
  const settingsManager = getSettingsManager()

  // 用于防止空格键连续触发
  const isSpaceKeyPressedRef = useRef(false)

  useEffect(() => {
    updateCustomFurnitureCount()
  }, [])

  // 更新自定义家具计数
  const updateCustomFurnitureCount = () => {
    const count = controller.getCustomFurnitureCount()
    setCustomFurnitureCount(count)
  }

  // 将识别状态转换为显示文本
  const getStatusText = () => {
    switch (recognitionStatus) {
      case 'recording':
        return '正在录音...'
      case 'processing':
        return '正在解析...'
      case 'error':
        return '识别失败'
      default:
        return '待机中'
    }
  }

  // 将操作类型转换为中文
  const getActionText = (action: string) => {
    switch (action) {
      case 'place':
        return '放置'
      case 'delete':
        return '删除'
      case 'rotate':
        return '旋转'
      case 'clear':
        return '清空'
      default:
        return action
    }
  }

  // 显示错误提示
  useEffect(() => {
    if (error) {
      showToast(error, 'error')
    }
  }, [error, showToast])

  const handleMicClick = async () => {
    if (!isRecording) {
      await startRecording()
    } else {
      await stopRecording()
    }
  }

  // 空格键处理
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      // F9 热键 (来自Dbao)
      if (e.code === 'F9' && settingsManager.get('enableF9Hotkey')) {
        e.preventDefault()
        if (!isRecording) {
          await startRecording()
        } else {
          await stopRecording()
        }
        return
      }

      // 空格键（speek AI）
      if (!settingsManager.get('enableSpaceHotkey')) return
      if (e.code !== 'Space') return

      // 如果在输入框中，不触发
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      if (isSpaceKeyPressedRef.current) return
      e.preventDefault()

      if (!isRecording) {
        isSpaceKeyPressedRef.current = true
        await startRecording()
      }
    },
    [isRecording, startRecording, stopRecording, settingsManager],
  )

  const handleKeyUp = useCallback(
    async (e: KeyboardEvent) => {
      if (!settingsManager.get('enableSpaceHotkey')) return
      if (e.code !== 'Space') return
      e.preventDefault()
      isSpaceKeyPressedRef.current = false

      if (isRecording) {
        await stopRecording()
      }
    },
    [isRecording, stopRecording, settingsManager],
  )

  // 注册键盘事件监听
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  // 应用主题设置
  useEffect(() => {
    const mode = settingsManager.get('enableDarkMode')
    if (mode === 'auto') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', mode)
    }
  }, [])

  const settings = settingsManager.getSettings()

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>3D家具语音控制 Pro</h1>
          <p className={styles.subtitle}>
            精度 98%+ | 双通道ASR | 智能解析 | 上下文感知
          </p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.engineBadge}>
            <span className={`${styles.dot} ${backendAvailable && activeEngine === 'backend-whisper' ? styles.dotBackend : styles.dotWebSpeech}`}></span>
            {activeEngine === 'web-speech' ? 'Web Speech' : 'Whisper'}
          </div>
          <button
            className={styles.settingsBtn}
            onClick={() => setShowSettings(true)}
            title="设置"
          >
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path
                fill="currentColor"
                d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Transcript Editor (Dbao风格: 可编辑转写 + 内嵌麦克风) */}
      <TranscriptEditor
        transcript={transcript}
        interimTranscript={interimTranscript}
        onTranscriptChange={setTranscript}
        onParseRequest={parseTranscript}
        isRecording={isRecording}
        remainingSeconds={remainingSeconds}
        maxSeconds={settings.maxRecordingSeconds}
        onMicClick={handleMicClick}
      />

      {/* Status Panel (speek AI风格) */}
      <div className={styles.statusPanel}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>识别状态</span>
          <span className={styles.statusValue}>{getStatusText()}</span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>搜索对象</span>
          <span className={styles.statusValue}>
            {parseResult
              ? parseResult.model
                ? `${getActionText(parseResult.action)} ${parseResult.model}`
                : '未识别家具'
              : '-'}
          </span>
        </div>
        {parseResult?.context?.referenceObject && (
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>参考物</span>
            <span className={styles.statusValue}>
              {parseResult.context.referenceObject}{' '}
              {parseResult.context.position &&
                `(${parseResult.context.position})`}
            </span>
          </div>
        )}
        {settings.showConfidence && (
          <>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>置信度</span>
              <span className={styles.statusValue}>
                {confidence > 0 ? `${confidence}%` : '-'}
              </span>
            </div>
            <div className={styles.confidenceBar}>
              <div
                className={styles.confidenceFill}
                style={{ width: `${confidence}%` }}
              ></div>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.resetBtn} onClick={resetAll}>
          重新录制
        </button>
      </div>

      {/* Settings Modal */}
      <Settings
        show={showSettings}
        onClose={() => setShowSettings(false)}
        onShowAddFurniture={() => {
          setAddFurnitureInitialName('')
          setShowAddFurniture(true)
        }}
        onShowFurnitureList={() => setShowFurnitureList(true)}
        customFurnitureCount={customFurnitureCount}
        onUpdateCount={updateCustomFurnitureCount}
        onShowToast={showToast}
        activeEngine={activeEngine}
        backendAvailable={backendAvailable}
        onSwitchEngine={switchEngine}
        onRescanBackend={rescanBackend}
      />

      {/* Add Furniture Modal */}
      <AddFurnitureModal
        show={showAddFurniture}
        onClose={() => setShowAddFurniture(false)}
        initialName={addFurnitureInitialName}
        onSuccess={updateCustomFurnitureCount}
        onShowToast={showToast}
      />

      {/* Furniture List Modal */}
      <FurnitureListModal
        show={showFurnitureList}
        onClose={() => setShowFurnitureList(false)}
        onUpdate={updateCustomFurnitureCount}
        onShowToast={showToast}
      />

      {/* Toast 提示 */}
      <Toast
        show={toast.show}
        message={toast.message}
        type={toast.type}
      />
    </div>
  )
}

export default App
