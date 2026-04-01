// ========================================
// API自动发现服务 (来自Dbao)
// 扫描 localhost 端口 8000-8010 找到后端
// ========================================

import { logger } from '../utils/logger'
import { BACKEND_PORT_RANGE, ASR_CONFIG } from '../utils/constants'
import type { HealthResponse } from '../types'

let resolvedBase: string | null = null
let resolving: Promise<string | null> | null = null

/**
 * 带超时的fetch
 */
async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs: number = ASR_CONFIG.HEALTH_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

/**
 * 尝试对指定 base URL 进行健康检查
 */
async function tryHealth(base: string): Promise<boolean> {
  try {
    const url = new URL('/health', base).toString()
    const resp = await fetchWithTimeout(
      url,
      { method: 'GET', cache: 'no-store' },
      ASR_CONFIG.PORT_SCAN_TIMEOUT,
    )
    const ct = resp.headers.get('content-type') || ''
    if (!ct.includes('application/json')) return false
    const json: HealthResponse = await resp.json()
    return resp.ok && json?.status === 'ok'
  } catch {
    return false
  }
}

/**
 * 自动发现后端API
 * 1. 如果指定了 hint（用户设置的地址），先尝试
 * 2. 否则扫描 localhost 8000-8010
 * 返回发现的 base URL 或 null
 */
export async function discoverBackend(hint?: string): Promise<string | null> {
  // 已发现过，直接返回
  if (resolvedBase) return resolvedBase

  // 防止并发扫描
  if (resolving) return resolving

  resolving = (async () => {
    // 先试 hint
    if (hint) {
      const ok = await tryHealth(hint)
      if (ok) {
        resolvedBase = hint
        logger.log(`后端发现（用户指定）: ${hint}`)
        return hint
      }
    }

    // 扫描端口
    for (let p = BACKEND_PORT_RANGE.start; p <= BACKEND_PORT_RANGE.end; p++) {
      for (const host of ['127.0.0.1', 'localhost']) {
        const base = `http://${host}:${p}`
        const ok = await tryHealth(base)
        if (ok) {
          resolvedBase = base
          logger.log(`后端自动发现: ${base}`)
          return base
        }
      }
    }

    logger.log('未发现后端，将使用浏览器原生ASR')
    return null
  })()

  try {
    return await resolving
  } finally {
    resolving = null
  }
}

/**
 * 重置已发现的后端（用于重新扫描）
 */
export function resetDiscovery(): void {
  resolvedBase = null
  resolving = null
}

/**
 * 获取当前已发现的后端地址
 */
export function getResolvedBase(): string | null {
  return resolvedBase
}

/**
 * 带超时和网络错误提示的 API fetch
 */
export async function apiFetch(
  path: string,
  opts: RequestInit = {},
  timeoutMs: number = 120000,
): Promise<Response> {
  const base = resolvedBase
  if (!base) {
    throw new Error('后端未连接')
  }
  const url = new URL(path, base).toString()
  try {
    return await fetchWithTimeout(url, { cache: 'no-store', ...opts }, timeoutMs)
  } catch (err: any) {
    const msg = (err?.message || String(err)).toLowerCase()
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
      throw new Error(`网络错误：后端可能已停止或端口变更，请刷新页面。(${err.message})`)
    }
    throw err
  }
}

/**
 * 安全读取 JSON 响应
 */
export async function readJsonSafe<T = any>(
  resp: Response,
  opts: { throwOnHttpError?: boolean } = {},
): Promise<T> {
  const { throwOnHttpError = true } = opts
  const ct = resp.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const text = await resp.text()
    const head = (text || '').slice(0, 200).replace(/\s+/g, ' ')
    throw new Error(`HTTP ${resp.status} 非JSON响应: ${head || '(empty)'}`)
  }
  const json = await resp.json()
  if (throwOnHttpError && !resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${json?.message || '请求失败'}`)
  }
  return json as T
}
