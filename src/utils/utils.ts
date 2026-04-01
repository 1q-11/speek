// ========================================
// 工具函数模块
// ========================================

import { pinyin } from 'pinyin-pro'

/**
 * 计算 Levenshtein 编辑距离
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0))

  for (let i = 0; i <= len1; i++) dp[i][0] = i
  for (let j = 0; j <= len2; j++) dp[0][j] = j

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1
      }
    }
  }

  return dp[len1][len2]
}

/**
 * 计算相似度得分 (0-1)
 */
export function similarityScore(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2)
  const maxLen = Math.max(str1.length, str2.length)
  return maxLen === 0 ? 1.0 : 1.0 - distance / maxLen
}

/**
 * 获取拼音
 */
export function getPinyin(text: string): string {
  return pinyin(text, { toneType: 'none', type: 'array' }).join('')
}

/**
 * 拼音匹配得分
 */
export function pinyinMatch(text1: string, text2: string): number {
  const py1 = getPinyin(text1).toLowerCase()
  const py2 = getPinyin(text2).toLowerCase()

  if (py1 === py2) return 1.0

  // 声母韵母匹配
  const initialScore = calculateInitialMatch(py1, py2)
  const finalScore = calculateFinalMatch(py1, py2)

  return (initialScore + finalScore) / 2
}

/**
 * 计算声母匹配度
 */
function calculateInitialMatch(py1: string, py2: string): number {
  const initialMap: { [key: string]: string[] } = {
    'z': ['zh', 'j'],
    'c': ['ch', 'q'],
    's': ['sh', 'x'],
    'n': ['l'],
    'f': ['h'],
  }

  for (const [key, similar] of Object.entries(initialMap)) {
    if (
      (py1.startsWith(key) && similar.some((s) => py2.startsWith(s))) ||
      (py2.startsWith(key) && similar.some((s) => py1.startsWith(s)))
    ) {
      return 0.7
    }
  }

  return py1[0] === py2[0] ? 1.0 : 0
}

/**
 * 计算韵母匹配度
 */
function calculateFinalMatch(py1: string, py2: string): number {
  const finalMap: { [key: string]: string[] } = {
    'an': ['ang'],
    'en': ['eng'],
    'in': ['ing'],
  }

  for (const [key, similar] of Object.entries(finalMap)) {
    if (
      (py1.endsWith(key) && similar.some((s) => py2.endsWith(s))) ||
      (py2.endsWith(key) && similar.some((s) => py1.endsWith(s)))
    ) {
      return 0.8
    }
  }

  const final1 = py1.slice(1)
  const final2 = py2.slice(1)
  return final1 === final2 ? 1.0 : 0
}

/**
 * 应用离线替换映射 (来自Dbao的asr_replace_zh.txt)
 * 对ASR文本进行领域特定的纠正
 */
export async function loadReplacementMap(
  url: string = '/data/asr_replace_zh.txt',
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const res = await fetch(url)
    if (!res.ok) return map
    const text = await res.text()
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [from, to] = trimmed.split('\t')
      if (from && to) {
        map.set(from.trim(), to.trim())
      }
    }
  } catch {
    // 文件不存在或加载失败，静默降级
  }
  return map
}

/**
 * 应用替换映射到文本
 */
export function applyReplacements(
  text: string,
  replacementMap: Map<string, string>,
): string {
  let result = text
  for (const [from, to] of replacementMap) {
    result = result.replaceAll(from, to)
  }
  return result
}
