// ========================================
// 统一日志工具
// ========================================

/**
 * 是否为开发环境
 */
const isDev = import.meta.env?.DEV ?? false

/**
 * 统一的日志工具
 * 在生产环境中自动禁用 log/info/warn，仅保留 error
 */
export const logger = {
  /**
   * 普通日志 - 仅在开发环境输出
   */
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args)
    }
  },

  /**
   * 信息日志 - 仅在开发环境输出
   */
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args)
    }
  },

  /**
   * 警告日志 - 仅在开发环境输出
   */
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args)
    }
  },

  /**
   * 错误日志 - 开发和生产环境都输出
   */
  error: (...args: any[]) => {
    console.error(...args)
  },

  /**
   * 调试日志 - 仅在开发环境输出
   */
  debug: (...args: any[]) => {
    if (isDev) {
      console.debug(...args)
    }
  },
}
