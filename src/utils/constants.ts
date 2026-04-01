// ========================================
// 常量定义
// ========================================

import type { ActionCommands } from '../types'

/**
 * 操作指令映射
 */
export const ACTION_COMMANDS: ActionCommands = {
  place: ['放', '摆', '添加', '来', '弄', '搞', '加', '增加', '布置'],
  delete: ['删', '删除', '移除', '拿走', '去掉', '清除'],
  rotate: ['旋转', '转一下', '转向', '转个方向', '换个方向'],
  move: ['移动', '挪', '挪动', '移', '搬'],
  scale: ['缩放', '放大', '缩小', '调整大小'],
  clear: ['清空', '全部删除', '删掉所有', '清除所有'],
}

/**
 * 停用词列表
 */
export const STOP_WORDS: string[] = [
  '我',
  '想',
  '要',
  '把',
  '在',
  '一个',
  '这个',
  '那个',
  '帮我',
  '给我',
  '客厅',
  '卧室',
  '这里',
  '那边',
  '请',
  '麻烦',
  '可以',
  '能不能',
  '的',
  '了',
  '吗',
  '呢',
  '啊',
]

/**
 * 默认应用设置
 */
export const DEFAULT_SETTINGS = {
  // 语音相关
  enableSpaceHotkey: true,
  enableF9Hotkey: true,
  autoExecuteAPI: true,
  maxRecordingSeconds: 15,

  // ASR引擎
  preferredAsrEngine: 'web-speech' as const,
  backendApiBase: '',

  // 解析器
  enableFuzzyMatch: true,
  enablePinyinMatch: true,

  // UI
  showConfidence: true,
  showCandidates: false,
  showKeywords: true,
  enableDarkMode: 'auto' as const,
}

/**
 * localStorage 键名
 */
export const STORAGE_KEYS = {
  SETTINGS: 'vfp_settings_v1',
  CUSTOM_FURNITURE: 'vfp_custom_furniture_v1',
}

/**
 * 后端API端口扫描范围
 */
export const BACKEND_PORT_RANGE = {
  start: 8000,
  end: 8010,
}

/**
 * ASR相关常量
 */
export const ASR_CONFIG = {
  /** 实时上传间隔 (ms) */
  UPLOAD_INTERVAL: 1500,
  /** 健康检查超时 (ms) */
  HEALTH_TIMEOUT: 2000,
  /** 端口扫描超时 (ms) */
  PORT_SCAN_TIMEOUT: 1500,
}
