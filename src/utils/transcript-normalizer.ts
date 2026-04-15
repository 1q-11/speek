// ========================================
// 语音转写归一化
// ========================================

import type { FurnitureEntity } from '../types'
import { KJL_FURNITURE_NAMES } from './kjl-furniture-db'
import { getPinyin, pinyinMatch, similarityScore } from './utils'
import { normalizeDialectText } from './dialect-normalizer'
import { applyDialectPhoneticCorrections } from './dialect-phonetic-corrections'

interface DomainTerm {
  raw: string
  pinyin: string
}

interface NormalizeTranscriptOptions {
  replacementMap: Map<string, string>
  enableCleanup: boolean
  enableDomainHotwords: boolean
  enableDialectNormalization: boolean
  enabledDialectRegions: string[]
  customDialectMappings: string
  customFurniture: FurnitureEntity[]
}

const LEADING_FILLERS = [
  '嗯',
  '呃',
  '额',
  '啊',
  '诶',
  '欸',
  '那个',
  '然后',
  '就是',
  '请问',
  '麻烦',
  '麻烦你',
]

const REPEATED_PHRASES = ['一个', '一下', '帮我', '给我', '然后', '那个', '这个']

const HOTWORD_EXCLUDE_RE = /模型|材质|包裹层|部件|组件|机房|系统|设备|参数化|辅助|后台/

const SELF_CORRECTION_MARKERS = ['不对', '不是', '算了', '改成', '重来', '重新', '换成']

function buildDomainTerms(customFurniture: FurnitureEntity[]): DomainTerm[] {
  const terms = new Set<string>()

  const addTerm = (value: string) => {
    const term = value.trim()
    if (!term) return
    if (!/^[\u4e00-\u9fa5]{2,8}$/.test(term)) return
    if (HOTWORD_EXCLUDE_RE.test(term)) return
    terms.add(term)
  }

  for (const name of KJL_FURNITURE_NAMES) {
    addTerm(name)
    name.split(/[\/()（）-]/).forEach(addTerm)
  }

  customFurniture.forEach((item) => {
    addTerm(item.name)
    item.words.forEach(addTerm)
    item.keywords.forEach(addTerm)
  })

  return Array.from(terms).map((raw) => ({ raw, pinyin: getPinyin(raw) }))
}

function cleanupTranscript(text: string): string {
  let result = text.trim().replace(/[，。！？,.!?]/g, '')

  let changed = true
  while (changed) {
    changed = false
    for (const filler of LEADING_FILLERS) {
      if (result.startsWith(filler)) {
        result = result.slice(filler.length).trim()
        changed = true
      }
    }
  }

  result = result.replace(/([\u4e00-\u9fa5])\1{2,}/g, '$1')

  for (const phrase of REPEATED_PHRASES) {
    const repeated = new RegExp(`(?:${phrase}){2,}`, 'g')
    result = result.replace(repeated, phrase)
  }

  result = result.replace(/\s+/g, '')
  return result.trim()
}

function applySelfCorrection(text: string): string {
  let normalized = text

  for (const marker of SELF_CORRECTION_MARKERS) {
    const index = normalized.lastIndexOf(marker)
    if (index !== -1) {
      const corrected = normalized.slice(index + marker.length).trim()
      if (corrected.length >= 2) {
        normalized = corrected
      }
    }
  }

  return normalized
}

function applyLightPunctuation(text: string): string {
  let normalized = text.trim()
  if (!normalized) return normalized

  const commandTail = /(吗|呢|吧|呀)$/.test(normalized) ? '？' : '。'
  normalized = normalized.replace(/[，。！？,.!?]+$/g, '')

  if (/然后|并且|再/.test(normalized) && !normalized.includes('，')) {
    normalized = normalized.replace(/(然后|并且|再)/g, '，$1')
    normalized = normalized.replace(/^，/, '')
  }

  return `${normalized}${commandTail}`
}

function findHotwordReplacement(text: string, terms: DomainTerm[]): string | null {
  const textPinyin = getPinyin(text)
  let bestTerm: string | null = null
  let bestScore = 0

  for (const term of terms) {
    if (Math.abs(term.raw.length - text.length) > 2) continue

    const similarity = similarityScore(text, term.raw)
    const pinyinScore = term.pinyin === textPinyin ? 1 : pinyinMatch(text, term.raw)
    const score = pinyinScore * 0.65 + similarity * 0.35

    if (score > bestScore) {
      bestScore = score
      bestTerm = term.raw
    }
  }

  if (!bestTerm) return null
  if (bestScore >= 0.9) return bestTerm

  return null
}

function applyDomainHotwords(text: string, customFurniture: FurnitureEntity[]): string {
  const terms = buildDomainTerms(customFurniture)
  if (terms.length === 0) return text

  const fragments = Array.from(new Set(text.match(/[\u4e00-\u9fa5]{2,8}/g) || []))
  let normalized = text

  for (const fragment of fragments.sort((a, b) => b.length - a.length)) {
    const replacement = findHotwordReplacement(fragment, terms)
    if (!replacement || replacement === fragment) continue
    normalized = normalized.replaceAll(fragment, replacement)
  }

  return normalized
}

export function normalizeTranscript(
  text: string,
  options: NormalizeTranscriptOptions,
): string {
  let normalized = text.trim()

  if (!normalized) {
    return ''
  }

  for (const [from, to] of options.replacementMap) {
    normalized = normalized.replaceAll(from, to)
  }

  if (options.enableDialectNormalization) {
    normalized = normalizeDialectText(normalized, {
      enabledRegions: options.enabledDialectRegions,
      customMappings: options.customDialectMappings,
    })
    normalized = applyDialectPhoneticCorrections(normalized)
  }

  if (options.enableCleanup) {
    normalized = cleanupTranscript(normalized)
    normalized = applySelfCorrection(normalized)
  }

  if (options.enableDomainHotwords) {
    normalized = applyDomainHotwords(normalized, options.customFurniture)
  }

  return applyLightPunctuation(normalized).trim()
}

export function stripTranscriptPunctuation(text: string): string {
  return text.replace(/[，。！？,.!?]/g, '').trim()
}
