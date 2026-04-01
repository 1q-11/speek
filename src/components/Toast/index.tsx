// ========================================
// Toast 提示组件
// ========================================

import { useEffect } from 'react'
import type { ToastType } from '../../types'
import styles from './index.module.css'

interface ToastProps {
  show: boolean
  message: string
  type: ToastType
  onClose?: () => void
}

export function Toast({ show, message, type, onClose }: ToastProps) {
  useEffect(() => {
    if (show && onClose) {
      const timer = setTimeout(() => {
        onClose()
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [show, onClose])

  if (!show) return null

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      default:
        return 'ℹ️'
    }
  }

  return (
    <div className={`${styles.toast} ${styles[type]} ${show ? styles.show : ''}`}>
      <span className={styles.icon}>{getIcon()}</span>
      <span className={styles.message}>{message}</span>
    </div>
  )
}
