// ========================================
// 自定义家具管理器
// ========================================

import { logger } from './logger'
import { KJL_FURNITURE_SET } from './kjl-furniture-db'
import { FurnitureValidator } from './furniture-validator'
import { STORAGE_KEYS } from './constants'
import type { FurnitureEntity } from '../types'

export class CustomFurnitureManager {
  private customFurniture: Map<string, FurnitureEntity>
  private validator: FurnitureValidator

  constructor() {
    this.customFurniture = new Map()
    this.validator = new FurnitureValidator()
    this.loadFromStorage()
    logger.log('CustomFurnitureManager 初始化完成')
  }

  /**
   * 从 localStorage 加载自定义家具
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CUSTOM_FURNITURE)
      if (stored) {
        const data = JSON.parse(stored) as FurnitureEntity[]
        data.forEach(item => {
          this.customFurniture.set(item.name, item)
        })
        logger.log(`已加载 ${data.length} 个自定义家具`)
      }
    } catch (error) {
      logger.error('加载自定义家具失败:', error)
    }
  }

  /**
   * 保存到 localStorage
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.customFurniture.values())
      localStorage.setItem(STORAGE_KEYS.CUSTOM_FURNITURE, JSON.stringify(data))
      logger.log('自定义家具已保存')
    } catch (error) {
      logger.error('保存自定义家具失败:', error)
    }
  }

  /**
   * 检查家具是否已存在（系统+自定义）
   */
  exists(name: string): boolean {
    if (KJL_FURNITURE_SET.has(name)) {
      return true
    }
    return this.customFurniture.has(name)
  }

  /**
   * 添加自定义家具
   */
  add(name: string, keywords: string[] = []): { success: boolean; message: string } {
    logger.log('尝试添加自定义家具:', name)

    if (!name || name.trim().length === 0) {
      return { success: false, message: '家具名称不能为空' }
    }

    const trimmedName = name.trim()

    if (this.exists(trimmedName)) {
      return { success: false, message: '该家具已存在（系统或自定义）' }
    }

    const validation = this.validator.validate(trimmedName)
    if (!validation.isValid) {
      return { success: false, message: validation.reason }
    }

    const entity: FurnitureEntity = {
      name: trimmedName,
      words: [trimmedName],
      keywords: keywords.length > 0 ? keywords : [trimmedName],
      weight: 1,
      category: 'custom',
      custom: true,
      addedAt: Date.now(),
    }

    this.customFurniture.set(trimmedName, entity)
    this.saveToStorage()

    logger.log('自定义家具添加成功:', trimmedName)
    return { success: true, message: '添加成功' }
  }

  /**
   * 删除自定义家具
   */
  remove(name: string): { success: boolean; message: string } {
    if (!this.customFurniture.has(name)) {
      return { success: false, message: '该自定义家具不存在' }
    }

    this.customFurniture.delete(name)
    this.saveToStorage()

    logger.log('自定义家具已删除:', name)
    return { success: true, message: '删除成功' }
  }

  /**
   * 获取所有自定义家具
   */
  getAll(): FurnitureEntity[] {
    return Array.from(this.customFurniture.values())
  }

  /**
   * 获取自定义家具数量
   */
  getCount(): number {
    return this.customFurniture.size
  }

  /**
   * 清空所有自定义家具
   */
  clear(): void {
    this.customFurniture.clear()
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_FURNITURE)
    logger.log('所有自定义家具已清空')
  }

  /**
   * 获取家具（自定义）
   */
  get(name: string): FurnitureEntity | undefined {
    return this.customFurniture.get(name)
  }

  /**
   * 导出自定义家具（用于备份）
   */
  export(): string {
    const data = this.getAll()
    return JSON.stringify(data, null, 2)
  }

  /**
   * 导入自定义家具（用于恢复）
   */
  import(jsonString: string): { success: boolean; message: string; count: number } {
    try {
      const data = JSON.parse(jsonString) as FurnitureEntity[]

      if (!Array.isArray(data)) {
        return { success: false, message: '数据格式错误', count: 0 }
      }

      let imported = 0
      for (const item of data) {
        if (item.name && !this.exists(item.name)) {
          this.customFurniture.set(item.name, item)
          imported++
        }
      }

      this.saveToStorage()
      logger.log(`导入了 ${imported} 个自定义家具`)

      return { success: true, message: '导入成功', count: imported }
    } catch (error) {
      logger.error('导入失败:', error)
      return { success: false, message: '解析 JSON 失败', count: 0 }
    }
  }

  /**
   * 获取所有家具（系统+自定义）
   * 注意：由于酷家乐数据库有1329个家具，此方法仅返回自定义家具
   */
  getAllFurniture(): FurnitureEntity[] {
    return this.getAll()
  }
}
