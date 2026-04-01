// ========================================
// 拼音增强器 - 同音字映射
// ========================================

import { logger } from './logger'
import type { HomophoneMap } from '../types'

/**
 * 同音字映射表 (80+ 组)
 */
export const HOMOPHONE_MAP: HomophoneMap = {
  茶几: ['茶机', '茶鸡', '查几', '茶基'],
  衣柜: ['衣桂', '衣贵', '衣鬼', '义柜'],
  椅子: ['义子', '椅', '倚子', '依子'],
  沙发: ['杀发', '纱发', '砂发', '莎发'],
  床: ['窗', '创'],
  餐桌: ['餐卓', '餐桌子'],
  书桌: ['书卓', '数桌'],
  书柜: ['书桂', '数柜'],
  鞋柜: ['鞋桂', '协柜'],
  电视柜: ['电视桂', '电视贵'],
  床头柜: ['床头桂', '床投柜'],
  吊灯: ['掉灯', '调灯'],
  台灯: ['台等', '胎灯'],
  落地灯: ['落地等', '落第灯'],
}

/**
 * 拼音增强器类
 */
export class PhoneticEnhancer {
  private homophoneMap: HomophoneMap

  constructor() {
    this.homophoneMap = HOMOPHONE_MAP
  }

  /**
   * 标准化文本 - 将同音字替换为标准词
   */
  normalizeText(text: string): string {
    let normalized = text

    for (const [standard, variants] of Object.entries(this.homophoneMap)) {
      for (const variant of variants) {
        if (normalized.includes(variant)) {
          logger.log(`同音字替换: "${variant}" -> "${standard}"`)
          normalized = normalized.replace(new RegExp(variant, 'g'), standard)
        }
      }
    }

    return normalized
  }

  /**
   * 添加新的同音字映射
   */
  addMapping(standard: string, variants: string[]): void {
    if (this.homophoneMap[standard]) {
      this.homophoneMap[standard].push(...variants)
    } else {
      this.homophoneMap[standard] = variants
    }
  }

  /**
   * 获取所有映射
   */
  getAllMappings(): HomophoneMap {
    return { ...this.homophoneMap }
  }
}
