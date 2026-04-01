// ========================================
// 可编辑转写文本组件 (来自Dbao)
// 内嵌麦克风按钮 + 倒计时 + 编辑后重新解析
// ========================================

import { useCallback, useRef, useEffect } from 'react'
import styles from './index.module.css'

interface TranscriptEditorProps {
  /** 当前转写文本 */
  transcript: string
  /** 实时中间结果 */
  interimTranscript: string
  /** 更新文本回调 */
  onTranscriptChange: (text: string) => void
  /** 编辑完成后重新解析 */
  onParseRequest: (text: string) => void
  /** 是否正在录音 */
  isRecording: boolean
  /** 剩余秒数 */
  remainingSeconds: number
  /** 最大录音秒数 */
  maxSeconds: number
  /** 点击麦克风 */
  onMicClick: () => void
}

export function TranscriptEditor({
  transcript,
  interimTranscript,
  onTranscriptChange,
  onParseRequest,
  isRecording,
  remainingSeconds,
  maxSeconds,
  onMicClick,
}: TranscriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自动调整高度
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = `${Math.max(ta.scrollHeight, 60)}px`
    }
  }, [transcript, interimTranscript])

  // 手动编辑时触发重新解析（防抖）
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      onTranscriptChange(value)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onParseRequest(value)
      }, 500)
    },
    [onTranscriptChange, onParseRequest],
  )

  // 显示的文本：录音时显示 interimTranscript，否则显示 transcript
  const displayText = isRecording && interimTranscript ? interimTranscript : transcript

  return (
    <div className={styles.transcriptWrap}>
      <textarea
        ref={textareaRef}
        className={styles.transcriptInput}
        value={displayText}
        onChange={handleChange}
        placeholder="录完音会自动转成文字，也可以手动修改..."
        rows={3}
        readOnly={isRecording}
      />
      <button
        className={styles.mic}
        type="button"
        aria-pressed={isRecording}
        title={isRecording ? '点击停止录音' : '点击开始录音'}
        onClick={onMicClick}
      >
        {isRecording ? (
          <div className={styles.audioWave}>
            <span className={`${styles.bar} ${styles.bar1}`}></span>
            <span className={`${styles.bar} ${styles.bar2}`}></span>
            <span className={`${styles.bar} ${styles.bar3}`}></span>
            <span className={`${styles.bar} ${styles.bar4}`}></span>
            <span className={`${styles.bar} ${styles.bar5}`}></span>
          </div>
        ) : (
          <svg className={styles.micIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
      <div className={styles.hintRow}>
        <span className={styles.hintText}>
          {isRecording
            ? `录音中... 再次点击停止`
            : '点击麦克风开始录音，或按 F9 / 空格键'}
        </span>
        {isRecording && (
          <span className={styles.timer} aria-live="polite">
            {remainingSeconds}s / {maxSeconds}s
          </span>
        )}
      </div>
    </div>
  )
}
