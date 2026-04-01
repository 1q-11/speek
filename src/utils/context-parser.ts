// ========================================
// 上下文解析器 - 复杂句子解析
// ========================================

import { logger } from './logger'
import { KJL_FURNITURE_NAMES, KJL_FURNITURE_SET } from './kjl-furniture-db'
import type { ContextInfo } from '../types'

// 位置关系词（按长度降序排列，避免短词先匹配）
const POSITION_RELATIONS = [
  '旁边', '左边', '右边', '上面', '下面', '前面', '后面',
  '附近', '周围', '边上', '侧边', '顶上', '底下',
  '左侧', '右侧', '上方', '下方', '前方', '后方',
  '上', '下', '左', '右', '中', '里', '外',
]

// 介词和连接词
const PREPOSITIONS = [
  '在', '的', '放', '摆', '添加', '来', '个', '一', '一个',
]

export class ContextParser {
  /**
   * 解析包含位置关系的复杂句子
   * @param text 输入文本
   * @returns 上下文信息
   */
  parseContext(text: string): ContextInfo | null {
    logger.log('上下文解析:', text)

    // 1. 检测是否包含位置关系
    const positionMatch = this.findPositionRelation(text)
    if (!positionMatch) {
      logger.log('未检测到位置关系')
      return null
    }

    logger.log('位置关系:', positionMatch.relation, '位置:', positionMatch.index)

    // 2. 提取参考对象（位置词之前的家具）
    const beforePosition = text.substring(0, positionMatch.index)
    const referenceObject = this.extractFurniture(beforePosition)

    // 3. 提取主要对象（位置词之后的家具）
    const afterPosition = text.substring(positionMatch.index + positionMatch.relation.length)
    const mainObject = this.extractFurniture(afterPosition)

    logger.log('参考对象:', referenceObject)
    logger.log('主要对象:', mainObject)

    if (!mainObject) {
      logger.warn('未找到主要对象')
      return null
    }

    const context: ContextInfo = {
      mainObject,
      referenceObject: referenceObject ?? null,
      position: positionMatch.relation,
      quantity: null,
      modifiers: [],
    }

    logger.log('上下文解析完成:', context)
    return context
  }

  /**
   * 查找位置关系词（优先匹配更长的词）
   */
  private findPositionRelation(text: string): { relation: string; index: number } | null {
    const sortedRelations = [...POSITION_RELATIONS].sort((a, b) => b.length - a.length)

    for (const relation of sortedRelations) {
      const index = text.indexOf(relation)
      if (index !== -1) {
        return { relation, index }
      }
    }
    return null
  }

  /**
   * 从文本中提取家具名称（优先匹配更长的词）
   */
  private extractFurniture(text: string): string | null {
    // 清理文本
    let cleaned = text
    for (const prep of PREPOSITIONS) {
      cleaned = cleaned.replace(new RegExp(prep, 'g'), ' ')
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim()

    logger.log('  清理后的文本:', cleaned)

    // 完全匹配 (O(1))
    if (KJL_FURNITURE_SET.has(cleaned)) {
      return cleaned
    }

    // 包含匹配（KJL_FURNITURE_NAMES 已按长度降序排序）
    for (const name of KJL_FURNITURE_NAMES) {
      if (cleaned.includes(name)) {
        return name
      }
    }

    // 返回清理后的文本（可能是自定义家具）
    if (cleaned.length > 0 && cleaned.length <= 15) {
      return cleaned
    }

    return null
  }
}

/**
 * 智能关键词提取器
 */
export class SmartKeywordExtractor {
  private contextParser: ContextParser

  constructor() {
    this.contextParser = new ContextParser()
  }

  /**
   * 从复杂句子中提取核心操作对象
   * @param text 输入文本
   * @returns 提取的关键词
   */
  extract(text: string): string {
    logger.log('智能关键词提取:', text)

    // 1. 尝试上下文解析
    const context = this.contextParser.parseContext(text)
    if (context && context.mainObject) {
      logger.log('从上下文提取主要对象:', context.mainObject)
      return context.mainObject
    }

    // 2. 如果没有上下文，返回原文本
    logger.log('无上下文，返回原文本')
    return text
  }

  /**
   * 判断是否为复杂句子（包含位置关系）
   */
  isComplexSentence(text: string): boolean {
    return POSITION_RELATIONS.some(relation => text.includes(relation))
  }
}
