// ========================================
// 方言词汇归一化
// ========================================

import { parseCustomDialectMappings } from './custom-dialect-mappings'
import { DIALECT_FILLERS, DIALECT_REGION_PACKS, DIALECT_REPLACEMENTS } from './dialect-lexicon'
import { FURNITURE_ALIASES } from './furniture-aliases'

interface DialectNormalizationOptions {
  enabledRegions: string[]
  customMappings?: string
}

export function normalizeDialectText(
  text: string,
  options: DialectNormalizationOptions,
): string {
  let normalized = text.trim()
  if (!normalized) return ''

  const activePacks = DIALECT_REGION_PACKS.filter(
    (pack) => pack.id === 'common' || options.enabledRegions.includes(pack.id),
  )

  const replacements = [
    ...activePacks.flatMap((pack) => pack.replacements),
    ...DIALECT_REPLACEMENTS,
    ...parseCustomDialectMappings(options.customMappings || '').map((item) => [item.from, item.to] as [string, string]),
  ]

  const fillers = [...new Set([...DIALECT_FILLERS, ...activePacks.flatMap((pack) => pack.fillers)])]

  for (const [from, to] of replacements) {
    normalized = normalized.replaceAll(from, to)
  }

  for (const [from, to] of FURNITURE_ALIASES) {
    normalized = normalized.replaceAll(from, to)
  }

  for (const filler of fillers) {
    normalized = normalized.replaceAll(filler, '')
  }

  normalized = normalized
    .replace(/给我整个/g, '给我放个')
    .replace(/帮我整个/g, '帮我放个')
    .replace(/往(左手边|右手边)/g, (_match, dir) => (dir === '左手边' ? '往左边' : '往右边'))
    .replace(/放到到/g, '放到')
    .replace(/放在在/g, '放在')
    .replace(/删删除/g, '删除')

  return normalized.replace(/\u0000/g, '').trim()
}
