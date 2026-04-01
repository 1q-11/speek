// ========================================
// 添加自定义家具模态框
// ========================================

import { useState, useEffect } from 'react'
import { getVoiceController } from '../../utils/controller'
import styles from './index.module.css'

interface AddFurnitureModalProps {
  show: boolean
  onClose: () => void
  initialName?: string
  onSuccess: () => void
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
}

export function AddFurnitureModal({
  show,
  onClose,
  initialName = '',
  onSuccess,
  onShowToast,
}: AddFurnitureModalProps) {
  const [name, setName] = useState(initialName)
  const [keywords, setKeywords] = useState('')
  const controller = getVoiceController()

  // 当 show 或 initialName 变化时，重置表单
  useEffect(() => {
    if (show) {
      setName(initialName)
      setKeywords('')
    }
  }, [show, initialName])

  if (!show) return null

  const handleConfirm = () => {
    const trimmedName = name.trim()

    if (!trimmedName) {
      onShowToast('请输入家具名称', 'error')
      return
    }

    // 验证是否为有效的家居物品
    const validation = controller.validateFurniture(trimmedName)

    if (!validation.isValid) {
      onShowToast(validation.reason, 'error')
      return
    }

    // 解析别名
    const keywordList = keywords
      ? keywords
          .split(/[,，]/)
          .map((k) => k.trim())
          .filter((k) => k)
      : []

    // 添加家具
    const result = controller.addCustomFurniture(trimmedName, keywordList)

    if (result.success) {
      onShowToast(`已添加自定义家具："${trimmedName}"`, 'success')
      onSuccess()
      onClose()
    } else {
      onShowToast(result.message, 'error')
    }
  }

  return (
    <div className={styles.modal} onClick={onClose}>
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalTitle}>添加自定义家具</div>
        <div className={styles.modalMessage}>
          系统未识别该家具，是否添加到自定义列表？
        </div>

        <div className={styles.formGroup}>
          <label>家具名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：榻榻米"
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label>别名（可选，用逗号分隔）</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="例如：塌塌米,日式床"
          />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            取消
          </button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            确认添加
          </button>
        </div>
      </div>
    </div>
  )
}
