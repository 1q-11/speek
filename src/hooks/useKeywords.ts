// ========================================
// 关键词提取 Hook (来自Dbao)
// 前端轻量版：基于停用词过滤 + 词频统计
// 后端版通过 ASR manager 的 onKeywords 回调
// ========================================

import { useCallback } from 'react'

/**
 * 中文停用词（精简版，完整版从 public/data/stopwords_zh.txt 加载）
 */
const STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她',
  '吗', '啊', '呢', '吧', '把', '被', '比', '别', '从', '但',
  '得', '地', '对', '而', '给', '跟', '还', '或', '几', '将',
  '就是', '可以', '来', '能', '那', '这个', '那个', '什么', '如果',
  '所以', '他们', '它', '我们', '想', '帮我', '给我', '请', '麻烦',
])

/**
 * 简单分词（按标点/空格分割 + 2-4字滑窗）
 */
function simpleTokenize(text: string): string[] {
  // 移除标点
  const cleaned = text.replace(/[，。！？、；：""''（）\[\]{}…—·\s]+/g, ' ').trim()
  const tokens: string[] = []

  // 空格分割
  const parts = cleaned.split(/\s+/).filter(Boolean)
  for (const part of parts) {
    if (part.length <= 4) {
      tokens.push(part)
    } else {
      // 滑窗提取 2-4 字词
      for (let len = 4; len >= 2; len--) {
        for (let i = 0; i <= part.length - len; i++) {
          tokens.push(part.substring(i, i + len))
        }
      }
    }
  }

  return tokens
}

/**
 * 前端关键词提取
 */
export function extractKeywordsLocal(text: string, topN: number = 8): string[] {
  if (!text.trim()) return []

  const tokens = simpleTokenize(text)
  const freq = new Map<string, number>()

  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue
    if (token.length < 2) continue
    freq.set(token, (freq.get(token) || 0) + 1)
  }

  // 按频率排序
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word)

  return sorted
}

/**
 * useKeywords hook
 */
export function useKeywords() {
  const extract = useCallback((text: string, topN?: number) => {
    return extractKeywordsLocal(text, topN)
  }, [])

  return { extractKeywords: extract }
}
