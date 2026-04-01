// ========================================
// 自定义家具列表模态框
// ========================================

import { getVoiceController } from '../../utils/controller'
import type { FurnitureEntity } from '../../types'
import styles from './index.module.css'

interface FurnitureListModalProps {
  show: boolean
  onClose: () => void
  onUpdate: () => void
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
}

export function FurnitureListModal({
  show,
  onClose,
  onUpdate,
  onShowToast,
}: FurnitureListModalProps) {
  const controller = getVoiceController()

  if (!show) return null

  const list = controller.getCustomFurniture()

  const handleDelete = (name: string) => {
    if (confirm(`确定要删除"${name}"吗？`)) {
      const result = controller.removeCustomFurniture(name)
      if (result.success) {
        onShowToast(`已删除"${name}"`, 'success')
        onUpdate()
      } else {
        onShowToast(result.message, 'error')
      }
    }
  }

  return (
    <div className={styles.modal} onClick={onClose}>
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalTitle}>自定义家具列表</div>

        <div className={styles.furnitureList}>
          {list.length === 0 ? (
            <p className={styles.emptyText}>还没有添加自定义家具</p>
          ) : (
            list.map((item: FurnitureEntity) => (
              <div key={item.name} className={styles.furnitureItem}>
                <div className={styles.furnitureInfo}>
                  <div className={styles.furnitureName}>{item.name}</div>
                  <div className={styles.furnitureMeta}>
                    类别: {item.category} | 别名:{' '}
                    {item.keywords.slice(1).join(', ') || '无'}
                  </div>
                </div>
                <button
                  className={styles.furnitureDelete}
                  onClick={() => handleDelete(item.name)}
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>

        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
