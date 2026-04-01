// ========================================
// 关键词面板组件 (来自Dbao)
// ========================================

import styles from './index.module.css'

interface KeywordsPanelProps {
  /** 关键词列表 */
  keywords: string[]
  /** 是否显示 */
  show: boolean
}

export function KeywordsPanel({ keywords, show }: KeywordsPanelProps) {
  if (!show) return null

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>关键词</h3>
      <div className={styles.keywords}>
        {keywords.length === 0 ? (
          <span className={styles.empty}>暂无关键词</span>
        ) : (
          keywords.map((kw, i) => (
            <span key={`${kw}-${i}`} className={styles.kw}>
              {kw}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
