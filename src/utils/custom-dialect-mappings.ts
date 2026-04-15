// ========================================
// 用户自定义方言映射
// ========================================

export interface CustomDialectMapping {
  from: string
  to: string
}

export function parseCustomDialectMappings(input: string): CustomDialectMapping[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/=>|->|＝|=/).map((item) => item.trim())
      return {
        from: parts[0] || '',
        to: parts[1] || '',
      }
    })
    .filter((item) => item.from && item.to)
}
