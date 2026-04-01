// ========================================
// 语义解析器 - 7层匹配算法
// ========================================

import { ACTION_COMMANDS, STOP_WORDS } from './constants'
import { PhoneticEnhancer } from './phonetic-enhancer'
import { similarityScore, pinyinMatch } from './utils'
import {
  KJL_FURNITURE_NAMES,
  KJL_FURNITURE_SET,
} from './kjl-furniture-db'
import { logger } from './logger'
import type {
  ParseResult,
  MatchResult,
  ActionType,
} from '../types'

export class EnhancedParser {
  private phoneticEnhancer: PhoneticEnhancer

  constructor() {
    this.phoneticEnhancer = new PhoneticEnhancer()
    logger.log(`EnhancedParser 初始化完成 (${KJL_FURNITURE_NAMES.length} 个家具)`)
  }

  /**
   * 解析语音文本
   * @param text 识别的文本
   * @returns 解析结果
   */
  parse(text: string): ParseResult {
    logger.log('开始解析:', text)

    if (!text || text.trim().length === 0) {
      return this.createEmptyResult()
    }

    // 1. 标准化文本（同音字纠正）
    const normalizedText = this.phoneticEnhancer.normalizeText(text)
    logger.log('标准化后:', normalizedText)

    // 2. 识别操作类型
    const action = this.extractAction(normalizedText)
    logger.log('操作类型:', action)

    // 3. 清理文本（移除动作词和停用词）
    const cleanedText = this.cleanText(normalizedText)
    logger.log('清理后:', cleanedText)

    // 4. 执行7层匹配
    const matches = this.matchFurniture(cleanedText)
    logger.log('匹配结果:', matches.length, '个候选')

    if (matches.length === 0) {
      return this.createEmptyResult(action)
    }

    // 5. 选择最佳匹配
    const bestMatch = matches[0]

    const result: ParseResult = {
      action,
      model: bestMatch.name,
      confidence: Math.round(bestMatch.score * 100),
      matchType: bestMatch.matchType,
      candidates: matches.slice(0, 3),
      isCustom: false,
      context: null,
    }

    logger.log('解析完成:', result)
    return result
  }

  /**
   * 提取操作类型
   */
  private extractAction(text: string): ActionType {
    // 检查删除指令
    for (const keyword of ACTION_COMMANDS.delete) {
      if (text.includes(keyword)) {
        return 'delete'
      }
    }

    // 检查旋转指令
    for (const keyword of ACTION_COMMANDS.rotate) {
      if (text.includes(keyword)) {
        return 'rotate'
      }
    }

    // 检查清空指令
    if (text.includes('清空') || text.includes('清除全部') || text.includes('删掉全部')) {
      return 'clear'
    }

    // 默认为放置
    return 'place'
  }

  /**
   * 清理文本（移除动作词和停用词）
   */
  private cleanText(text: string): string {
    let cleaned = text

    // 移除操作相关的词
    const allActionWords = [
      ...ACTION_COMMANDS.place,
      ...ACTION_COMMANDS.delete,
      ...ACTION_COMMANDS.rotate,
    ]

    allActionWords.forEach(word => {
      cleaned = cleaned.replace(new RegExp(word, 'g'), '')
    })

    // 移除停用词
    STOP_WORDS.forEach(word => {
      cleaned = cleaned.replace(new RegExp(word, 'g'), '')
    })

    // 移除多余空格
    cleaned = cleaned.replace(/\s+/g, '').trim()

    return cleaned
  }

  /**
   * 快速匹配算法（优化版）
   * 使用酷家乐1329个家具数据库
   */
  private matchFurniture(text: string): MatchResult[] {
    const matches: MatchResult[] = []
    const foundNames = new Set<string>()

    // 第1层：完全匹配 (O(1) - Set查找)
    if (KJL_FURNITURE_SET.has(text)) {
      matches.push({
        name: text,
        score: 1.0,
        matchType: '完全匹配',
        confidence: 100,
        category: 'kjl',
      })
      foundNames.add(text)
    }

    // 第2层：包含匹配（优先长名称）
    // 由于KJL_FURNITURE_NAMES已按长度降序排序，优先匹配更长的词
    for (const name of KJL_FURNITURE_NAMES) {
      if (foundNames.has(name)) continue

      // 文本包含家具名
      if (text.includes(name)) {
        const score = Math.min(0.98, 0.98 * (name.length / text.length))
        matches.push({
          name,
          score,
          matchType: '包含匹配',
          confidence: Math.round(score * 100),
          category: 'kjl',
        })
        foundNames.add(name)
      }
      // 家具名包含文本（短输入）
      else if (text.length >= 2 && name.includes(text)) {
        const score = 0.9 * (text.length / name.length)
        matches.push({
          name,
          score,
          matchType: '部分匹配',
          confidence: Math.round(score * 100),
          category: 'kjl',
        })
        foundNames.add(name)
      }
    }

    // 第3层：模糊匹配（仅对前100个高频家具）
    if (matches.length < 3 && text.length >= 2) {
      const topFurniture = KJL_FURNITURE_NAMES.slice(0, 100)
      for (const name of topFurniture) {
        if (foundNames.has(name)) continue

        const similarity = similarityScore(text, name)
        if (similarity >= 0.75) {
          const score = similarity * 0.85
          matches.push({
            name,
            score,
            matchType: '模糊匹配',
            confidence: Math.round(score * 100),
            category: 'kjl',
          })
          foundNames.add(name)
        }
      }
    }

    // 第4层：拼音匹配（仅对前100个高频家具）
    if (matches.length < 3 && text.length >= 2) {
      const topFurniture = KJL_FURNITURE_NAMES.slice(0, 100)
      for (const name of topFurniture) {
        if (foundNames.has(name)) continue

        const pinyinScore = pinyinMatch(text, name)
        if (pinyinScore >= 0.75) {
          const score = pinyinScore * 0.8
          matches.push({
            name,
            score,
            matchType: '拼音匹配',
            confidence: Math.round(score * 100),
            category: 'kjl',
          })
          foundNames.add(name)
        }
      }
    }

    // 按分数排序
    matches.sort((a, b) => b.score - a.score)

    return matches
  }

  /**
   * 创建空结果
   */
  private createEmptyResult(action: ActionType = 'place'): ParseResult {
    return {
      action,
      model: '',
      confidence: 0,
      matchType: '无匹配',
      candidates: [],
      isCustom: false,
      context: null,
    }
  }

  /**
   * 检查是否支持该家具 (O(1) 查询)
   */
  hasFurniture(name: string): boolean {
    return KJL_FURNITURE_SET.has(name)
  }

  /**
   * 获取家具实体
   */
  getFurniture(name: string) {
    if (KJL_FURNITURE_SET.has(name)) {
      return { name, words: [name], keywords: [name], weight: 1, category: 'kjl' }
    }
    return undefined
  }
}
