// ========================================
// Toast 提示 Hook
// ========================================

import { useState, useCallback } from 'react'
import type { ToastType } from '../types'

interface ToastState {
  show: boolean
  message: string
  type: ToastType
}

interface UseToastReturn {
  toast: ToastState
  showToast: (message: string, type?: ToastType) => void
  hideToast: () => void
}

export function useToast(): UseToastReturn {
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'info',
  })

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({
      show: true,
      message,
      type,
    })

    // 3秒后自动隐藏
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }))
    }, 3000)
  }, [])

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, show: false }))
  }, [])

  return {
    toast,
    showToast,
    hideToast,
  }
}
