// ========================================
// 智能选择器 - 多候选智能选择
// ========================================

import { logger } from './logger'
import type { RecognitionAlternative, ParseResult } from '../types'
import { EnhancedParser } from './parser'
import { ContextParser, POSITION_RELATIONS } from './context-parser'

interface CandidateScore {
  alternative: RecognitionAlternative
  parseResult: ParseResult
  voiceConfidence: number
  parseConfidence: number
  contextScore: number
  spatialScore: number
  completenessScore: number
  combinedScore: number
}

export class SmartSelector {
  private parser: EnhancedParser
  private contextParser: ContextParser

  constructor() {
    this.parser = new EnhancedParser()
    this.contextParser = new ContextParser()
    logger.log('SmartSelector 初始化完成')
  }

  /**
   * 从多个候选中选择最佳结果
   * @param alternatives 语音识别的多个候选结果
   * @returns 最佳解析结果
   */
  selectBest(alternatives: RecognitionAlternative[]): ParseResult {
    logger.log('智能选择器开始工作，候选数量:', alternatives.length)

    if (alternatives.length === 0) {
      logger.warn('没有候选结果')
      return this.parser.parse('')
    }

    if (alternatives.length === 1) {
      logger.log('只有一个候选，直接解析')
      const result = this.parser.parse(alternatives[0].transcript)
      result.voiceConfidence = Math.round(alternatives[0].confidence * 100)
      return result
    }

    // 计算每个候选的综合评分
    const scores: CandidateScore[] = alternatives.map(alt => {
      const parseResult = this.parser.parse(alt.transcript)
      const context = this.contextParser.parseContext(alt.transcript)
      const transcript = alt.transcript.trim()
      const voiceConfidence = alt.confidence
      const parseConfidence = parseResult.confidence / 100
      const contextScore = context?.mainObject
        ? Math.min(1, 0.45 + (context.referenceObject ? 0.3 : 0) + (context.position ? 0.25 : 0))
        : 0
      const hasSpatialLanguage = POSITION_RELATIONS.some((relation) => transcript.includes(relation))
      const spatialScore = hasSpatialLanguage
        ? context?.position && context.referenceObject && context.mainObject
          ? 1
          : context?.position && context.mainObject
            ? 0.7
            : 0.25
        : 0.5
      const completenessScore = this.getCompletenessScore(transcript, parseResult, context)

      // 综合评分 = 语音置信度 + 解析置信度 + 上下文完整度 + 方位一致性 + 句式完整度
      const combinedScore =
        voiceConfidence * 0.25 +
        parseConfidence * 0.35 +
        contextScore * 0.18 +
        spatialScore * 0.12 +
        completenessScore * 0.1

      parseResult.context = context ?? parseResult.context ?? null

      return {
        alternative: alt,
        parseResult,
        voiceConfidence,
        parseConfidence,
        contextScore,
        spatialScore,
        completenessScore,
        combinedScore,
      }
    })

    // 按综合评分排序
    scores.sort((a, b) => b.combinedScore - a.combinedScore)

    // 输出评分详情
    logger.log('候选评分:')
    scores.forEach((score, index) => {
      logger.log(
        `  ${index + 1}. "${score.alternative.transcript}"`,
        `| 语音: ${(score.voiceConfidence * 100).toFixed(1)}%`,
        `| 解析: ${(score.parseConfidence * 100).toFixed(1)}%`,
        `| 上下文: ${(score.contextScore * 100).toFixed(1)}%`,
        `| 方位: ${(score.spatialScore * 100).toFixed(1)}%`,
        `| 完整: ${(score.completenessScore * 100).toFixed(1)}%`,
        `| 综合: ${(score.combinedScore * 100).toFixed(1)}%`,
        `| 结果: ${score.parseResult.model || '无'}`,
      )
    })

    // 选择最佳候选
    const best = scores[0]
    logger.log('选择最佳候选:', best.alternative.transcript)

    // 添加语音置信度到结果中
    const finalResult = best.parseResult
    finalResult.voiceConfidence = Math.round(best.voiceConfidence * 100)

    // 如果解析失败但语音置信度很高，尝试更宽松的匹配
    if (!finalResult.model && best.voiceConfidence > 0.8) {
      logger.log('解析失败但语音置信度高，尝试备选方案')
      for (let i = 1; i < scores.length; i++) {
        if (scores[i].parseResult.model) {
          logger.log(`使用备选方案: ${scores[i].alternative.transcript}`)
          const altResult = scores[i].parseResult
          altResult.voiceConfidence = Math.round(scores[i].voiceConfidence * 100)
          return altResult
        }
      }
    }

    return finalResult
  }

  /**
   * 设置自定义解析器（用于依赖注入）
   */
  setParser(parser: EnhancedParser) {
    this.parser = parser
  }

  private getCompletenessScore(
    transcript: string,
    parseResult: ParseResult,
    context: ParseResult['context'],
  ): number {
    let score = parseResult.model ? 0.45 : 0

    if (parseResult.action && parseResult.action !== 'place') {
      score += 0.15
    }

    if (context?.referenceObject) {
      score += 0.2
    }

    if (context?.position) {
      score += 0.1
    }

    if (transcript.length >= 4) {
      score += 0.1
    }

    return Math.min(1, score)
  }
}
