// ========================================
// 语音控制器 - 整合所有模块
// ========================================

import { EnhancedParser } from './parser'
import { SmartSelector } from './smart-selector'
import { ContextParser, SmartKeywordExtractor } from './context-parser'
import { FurnitureValidator } from './furniture-validator'
import { CustomFurnitureManager } from './custom-furniture'
import { logger } from './logger'
import type { ParseResult, RecognitionAlternative } from '../types'

export class VoiceController {
  private parser: EnhancedParser
  private smartSelector: SmartSelector
  private contextParser: ContextParser
  private keywordExtractor: SmartKeywordExtractor
  private validator: FurnitureValidator
  private customFurniture: CustomFurnitureManager

  constructor() {
    this.parser = new EnhancedParser()
    this.smartSelector = new SmartSelector()
    this.contextParser = new ContextParser()
    this.keywordExtractor = new SmartKeywordExtractor()
    this.validator = new FurnitureValidator()
    this.customFurniture = new CustomFurnitureManager()

    logger.log('VoiceController 初始化完成')
  }

  /**
   * 处理语音识别结果（主入口）
   * @param text 识别的文本
   * @param alternatives 多个候选结果（可选）
   * @returns 解析结果
   */
  process(text: string, alternatives?: RecognitionAlternative[]): ParseResult {
    logger.log('VoiceController 开始处理:', text)
    logger.log('候选数量:', alternatives?.length || 0)

    // 1. 如果有多个候选，使用智能选择器
    if (alternatives && alternatives.length > 1) {
      logger.log('使用智能选择器')
      const result = this.smartSelector.selectBest(alternatives)

      // 尝试上下文解析
      if (result.model) {
        const context = this.contextParser.parseContext(text)
        if (context) {
          result.context = context
          if (context.mainObject && context.mainObject !== result.model) {
            logger.log('使用上下文中的主要对象:', context.mainObject)
            const contextResult = this.parser.parse(context.mainObject)
            if (contextResult.model) {
              result.model = contextResult.model
              result.confidence = contextResult.confidence
              result.matchType = contextResult.matchType
            }
          }
        }
      }

      return result
    }

    // 2. 单个结果或没有候选，直接解析
    logger.log('直接解析')
    const result = this.parseText(text)
    const context = this.contextParser.parseContext(text)

    if (context) {
      result.context = context

      if ((!result.model || result.confidence < 75) && context.mainObject) {
        const contextResult = this.parser.parse(context.mainObject)
        if (contextResult.model) {
          result.model = contextResult.model
          result.confidence = Math.max(result.confidence, contextResult.confidence)
          result.matchType =
            result.matchType === '无匹配'
              ? `上下文${contextResult.matchType}`
              : `${result.matchType}+上下文`
          result.candidates = contextResult.candidates.length > 0
            ? contextResult.candidates
            : result.candidates
        }
      }
    }

    return result
  }

  /**
   * 解析文本（内部方法）
   */
  private parseText(text: string): ParseResult {
    // 1. 检查是否为复杂句子
    if (this.keywordExtractor.isComplexSentence(text)) {
      logger.log('检测到复杂句子，进行上下文解析')
      const context = this.contextParser.parseContext(text)

      if (context && context.mainObject) {
        const result = this.parser.parse(context.mainObject)
        result.context = context
        return result
      }
    }

    // 2. 普通句子，直接解析
    return this.parser.parse(text)
  }

  /**
   * 添加自定义家具
   */
  addCustomFurniture(name: string, keywords: string[] = []): {
    success: boolean
    message: string
  } {
    const validation = this.validator.validate(name)
    if (!validation.isValid) {
      return { success: false, message: validation.reason }
    }
    return this.customFurniture.add(name, keywords)
  }

  /**
   * 删除自定义家具
   */
  removeCustomFurniture(name: string): { success: boolean; message: string } {
    return this.customFurniture.remove(name)
  }

  /**
   * 获取所有自定义家具
   */
  getCustomFurniture() {
    return this.customFurniture.getAll()
  }

  /**
   * 获取自定义家具数量
   */
  getCustomFurnitureCount(): number {
    return this.customFurniture.getCount()
  }

  /**
   * 检查家具是否存在
   */
  hasFurniture(name: string): boolean {
    return this.parser.hasFurniture(name) || this.customFurniture.exists(name)
  }

  /**
   * 验证家具名称
   */
  validateFurniture(name: string) {
    return this.validator.validate(name)
  }

  /**
   * 导出自定义家具
   */
  exportCustomFurniture(): string {
    return this.customFurniture.export()
  }

  /**
   * 导入自定义家具
   */
  importCustomFurniture(jsonString: string) {
    return this.customFurniture.import(jsonString)
  }

  /**
   * 清空自定义家具
   */
  clearCustomFurniture(): void {
    this.customFurniture.clear()
  }

  /**
   * 完整执行流程（解析 + 执行）
   * @param text 语音文本
   * @param alternatives 候选结果
   * @returns 执行结果
   */
  async execute(
    text: string,
    alternatives?: RecognitionAlternative[],
  ): Promise<ParseResult> {
    try {
      const result = this.process(text, alternatives)

      if (!result || !result.model) {
        throw new Error('无法识别有效的家具指令')
      }

      await this.executeFurnitureAction(result)
      return result
    } catch (error) {
      logger.error('执行错误:', error)
      throw error
    }
  }

  /**
   * 执行家具操作（对接酷家乐API）
   * @param result 解析结果
   * @returns 是否执行成功
   */
  async executeFurnitureAction(result: ParseResult): Promise<boolean> {
    logger.log(`执行操作: ${result.action} ${result.model}`)

    try {
      if (typeof window !== 'undefined' && window.kujialeAPI) {
        const api = window.kujialeAPI

        const actionMap: Record<
          string,
          {
            method: string
            name: string
            params: any[]
          }
        > = {
          place: {
            method: 'searchAndPlaceModel',
            name: '放置',
            params: [
              result.model,
              {
                position: result.context?.position,
                referenceObject: result.context?.referenceObject,
              },
            ],
          },
          delete: {
            method: 'deleteModel',
            name: '删除',
            params: [result.model],
          },
          rotate: {
            method: 'rotateModel',
            name: '旋转',
            params: [result.model, 90],
          },
          move: {
            method: 'moveModel',
            name: '移动',
            params: [result.model],
          },
          scale: {
            method: 'scaleModel',
            name: '缩放',
            params: [result.model],
          },
          clear: {
            method: 'clearAllModels',
            name: '清空',
            params: [],
          },
        }

        const action = actionMap[result.action]
        if (action && (api as any)[action.method]) {
          const targetName = result.model || '所有'
          logger.log(`${action.name}家具: ${targetName}`)
          await (api as any)[action.method](...action.params)
          return true
        }

        logger.warn(`未知操作类型: ${result.action}`)
        return false
      } else {
        // 酷家乐API不可用（开发/测试环境）
        logger.log('酷家乐API未加载，模拟执行')
        await new Promise((resolve) => setTimeout(resolve, 100))
        return true
      }
    } catch (error) {
      logger.error('执行家具操作失败:', error)
      throw error
    }
  }
}

// 创建单例
let controllerInstance: VoiceController | null = null

/**
 * 获取控制器实例（单例模式）
 */
export function getVoiceController(): VoiceController {
  if (!controllerInstance) {
    controllerInstance = new VoiceController()
  }
  return controllerInstance
}
