// ========================================
// 设置管理器 - 持久化配置 (Pro版 - 融合Dbao设置)
// ========================================

import { logger } from './logger'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants'
import type { AppSettings } from '../types'

/**
 * 设置管理器
 */
export class SettingsManager {
  private settings: AppSettings

  constructor() {
    this.settings = this.loadSettings()
  }

  /**
   * 从 localStorage 加载设置
   */
  private loadSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS)
      if (stored) {
        const parsed = JSON.parse(stored)
        // 合并默认设置和已保存的设置
        return { ...DEFAULT_SETTINGS, ...parsed } as AppSettings
      }
    } catch (error) {
      logger.error('加载设置失败:', error)
    }
    return { ...DEFAULT_SETTINGS } as AppSettings
  }

  /**
   * 保存设置到 localStorage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings))
      logger.log('设置已保存', this.settings)
    } catch (error) {
      logger.error('保存设置失败:', error)
    }
  }

  /**
   * 获取所有设置
   */
  getSettings(): AppSettings {
    return { ...this.settings }
  }

  /**
   * 更新设置
   */
  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...updates }
    this.saveSettings()
  }

  /**
   * 获取单个设置值
   */
  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key]
  }

  /**
   * 设置单个值
   */
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.settings[key] = value
    this.saveSettings()
  }

  /**
   * 重置为默认设置
   */
  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS } as AppSettings
    this.saveSettings()
  }

  /**
   * 导出设置
   */
  export(): string {
    return JSON.stringify(this.settings, null, 2)
  }

  /**
   * 导入设置
   */
  import(jsonString: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(jsonString)
      this.settings = { ...DEFAULT_SETTINGS, ...parsed } as AppSettings
      this.saveSettings()

      return {
        success: true,
        message: '设置导入成功',
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '导入失败',
      }
    }
  }
}

// 创建单例
let settingsInstance: SettingsManager | null = null

/**
 * 获取设置管理器实例
 */
export function getSettingsManager(): SettingsManager {
  if (!settingsInstance) {
    settingsInstance = new SettingsManager()
  }
  return settingsInstance
}
