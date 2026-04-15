// ========================================
// 方言音近误识别纠错
// ========================================

import { pinyinMatch, similarityScore } from './utils'

export interface DialectPhoneticCorrection {
  standard: string
  variants: string[]
}

export const DIALECT_PHONETIC_CORRECTIONS: DialectPhoneticCorrection[] = [
  { standard: '头', variants: ['脑壳', '脑科', '老壳', '脑咳'] },
  { standard: '旁边', variants: ['旁哈', '膀边', '绑边', '隔离'] },
  { standard: '前面', variants: ['前头', '钱面', '前便'] },
  { standard: '后面', variants: ['后头', '后便', '后壁'] },
  { standard: '里面', variants: ['里头', '李头'] },
  { standard: '外面', variants: ['外头'] },
  { standard: '下雨', variants: ['落雨', '老雨'] },
  { standard: '多久', variants: ['好久'] },
  { standard: '可以', variants: ['得行', '行不行', '中不'] },
  { standard: '不知道', variants: ['不晓得'] },
  { standard: '餐桌', variants: ['饭桌', '饭桌子'] },
  { standard: '茶几', variants: ['茶机', '茶鸡', '茶桌'] },
  { standard: '电视柜', variants: ['电视机柜', '电视贵', '电视桂'] },
  { standard: '床头柜', variants: ['床边柜', '床头贵', '床头桂'] },
  { standard: '椅子', variants: ['凳子', '板凳', '义子', '依子'] },
  { standard: '删除', variants: ['搞脱', '删脱', '拿脱'] },
  { standard: '放到', variants: ['摆到'] },
  { standard: '放在', variants: ['摆在', '摆喺'] },
  { standard: '怎么', variants: ['啷个', '咋个'] },
  { standard: '什么', variants: ['撒子', '啥子'] },
]

export function applyDialectPhoneticCorrections(text: string): string {
  let normalized = text

  for (const entry of DIALECT_PHONETIC_CORRECTIONS) {
    for (const variant of entry.variants) {
      if (!normalized.includes(variant)) continue
      normalized = normalized.replaceAll(variant, entry.standard)
    }
  }

  const fragments = Array.from(new Set(normalized.match(/[\u4e00-\u9fa5]{2,6}/g) || []))

  for (const fragment of fragments) {
    let bestMatch: string | null = null
    let bestScore = 0

    for (const entry of DIALECT_PHONETIC_CORRECTIONS) {
      for (const variant of entry.variants) {
        const score = pinyinMatch(fragment, variant) * 0.7 + similarityScore(fragment, variant) * 0.3
        if (score > bestScore) {
          bestScore = score
          bestMatch = entry.standard
        }
      }
    }

    if (bestMatch && bestScore >= 0.82 && fragment !== bestMatch) {
      normalized = normalized.replaceAll(fragment, bestMatch)
    }
  }

  return normalized
}

export function getDialectSignalScore(text: string): number {
  let score = 0

  for (const entry of DIALECT_PHONETIC_CORRECTIONS) {
    if (text.includes(entry.standard)) {
      score += 0.08
    }
    if (entry.variants.some((variant) => text.includes(variant))) {
      score += 0.12
    }
  }

  return Math.min(1, score)
}
