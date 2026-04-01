// ========================================
// 家具验证器 - 数据质量保障
// ========================================

import { logger } from './logger'
import type { ValidationResult } from '../types'

// 白名单：常见家居物品（200+）
const WHITELIST = [
  // 座椅类
  '沙发', '椅子', '凳子', '躺椅', '摇椅', '吧椅', '办公椅', '餐椅', '折叠椅',
  // 桌类
  '茶几', '餐桌', '书桌', '办公桌', '梳妆台', '床头柜', '边桌', '吧台',
  // 柜类
  '衣柜', '书柜', '鞋柜', '电视柜', '储物柜', '展示柜', '酒柜', '玄关柜',
  // 床类
  '床', '双人床', '单人床', '上下床', '榻榻米', '婴儿床',
  // 架类
  '书架', '置物架', '衣架', '鞋架', '花架', '酒架',
  // 灯具
  '台灯', '落地灯', '吊灯', '壁灯', '射灯', '筒灯', '吸顶灯',
  // 装饰品
  '抱枕', '靠垫', '地毯', '挂画', '相框', '花瓶', '摆件', '绿植', '盆栽',
  '窗帘', '地垫', '装饰画', '时钟', '镜子', '烛台', '雕塑',
  // 电器
  '电视', '冰箱', '洗衣机', '空调', '风扇', '加湿器', '空气净化器',
  // 其他
  '沙发床', '脚凳', '换鞋凳', '收纳箱', '垃圾桶', '衣帽架', '屏风', '隔断',
]

// 黑名单：不是家居物品的词
const BLACKLIST = [
  // 人物
  '人', '男人', '女人', '小孩', '孩子', '婴儿', '老人', '客人',
  // 动物
  '狗', '猫', '鸟', '鱼', '宠物',
  // 动作词
  '放', '摆', '添加', '删除', '移除', '拿走', '旋转', '转动', '移动',
  // 方位词
  '旁边', '左边', '右边', '上面', '下面', '前面', '后面', '中间',
  '附近', '周围', '左侧', '右侧', '上方', '下方', '前方', '后方',
  // 其他无效词
  '东西', '物品', '家具', '用品', '设备', '物件',
]

// 家居类别关键词
const FURNITURE_KEYWORDS = [
  '桌', '椅', '柜', '床', '架', '台', '凳', '几',
  '沙发', '灯', '画', '镜', '毯', '帘', '垫',
]

// 家居特征词
const FURNITURE_FEATURES = [
  '木质', '金属', '玻璃', '布艺', '皮革', '实木', '藤编',
  '可折叠', '可调节', '多功能', '储物', '收纳',
  '大', '小', '长', '短', '高', '低', '宽', '窄',
]

export class FurnitureValidator {
  /**
   * 验证是否为有效的家居物品
   */
  validate(name: string): ValidationResult {
    logger.log('验证家具:', name)

    if (!name || name.trim().length === 0) {
      return { isValid: false, reason: '名称为空' }
    }

    // 1. 白名单验证
    if (WHITELIST.includes(name)) {
      logger.log('白名单验证通过')
      return { isValid: true, reason: '白名单验证', category: 'whitelist' }
    }

    // 2. 黑名单验证
    for (const blocked of BLACKLIST) {
      if (name.includes(blocked) || blocked.includes(name)) {
        logger.log('黑名单验证失败:', blocked)
        return { isValid: false, reason: `不是有效家居物品（${this.getCategoryName(blocked)}）` }
      }
    }

    // 3. 长度验证
    if (name.length < 2) {
      return { isValid: false, reason: '名称过短' }
    }

    if (name.length > 10) {
      return { isValid: false, reason: '名称过长' }
    }

    // 4. 类别关键词验证
    for (const keyword of FURNITURE_KEYWORDS) {
      if (name.includes(keyword)) {
        logger.log('包含家居类别关键词:', keyword)
        return { isValid: true, reason: '包含家居关键词', category: 'keyword' }
      }
    }

    // 5. 特征词验证
    for (const feature of FURNITURE_FEATURES) {
      if (name.includes(feature)) {
        logger.log('包含家居特征词:', feature)
        return { isValid: true, reason: '包含家居特征', category: 'feature' }
      }
    }

    // 6. 组合词验证（包含已知家具名称）
    for (const furniture of WHITELIST) {
      if (name.includes(furniture) && name !== furniture) {
        logger.log('包含已知家具名称:', furniture)
        return { isValid: true, reason: '组合家具名称', category: 'composite' }
      }
    }

    // 默认：不确定，建议用户确认
    logger.log('无法自动验证，需要用户确认')
    return {
      isValid: false,
      reason: '无法确认是否为家居物品，请手动验证',
    }
  }

  /**
   * 获取黑名单词的类别名称
   */
  private getCategoryName(word: string): string {
    const categories: Record<string, string[]> = {
      '人物': ['人', '男人', '女人', '小孩', '孩子', '婴儿', '老人', '客人'],
      '动物': ['狗', '猫', '鸟', '鱼', '宠物'],
      '动作词': ['放', '摆', '添加', '删除', '移除', '拿走', '旋转', '转动', '移动'],
      '方位词': ['旁边', '左边', '右边', '上面', '下面', '前面', '后面', '中间', '附近', '周围'],
    }

    for (const [category, words] of Object.entries(categories)) {
      if (words.includes(word)) {
        return category
      }
    }

    return '无效词'
  }

  /**
   * 批量验证
   */
  validateBatch(names: string[]): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>()
    for (const name of names) {
      results.set(name, this.validate(name))
    }
    return results
  }

  /**
   * 获取验证统计
   */
  getValidationStats(names: string[]): {
    total: number
    valid: number
    invalid: number
    validPercentage: number
  } {
    const results = this.validateBatch(names)
    const valid = Array.from(results.values()).filter(r => r.isValid).length
    const invalid = results.size - valid

    return {
      total: results.size,
      valid,
      invalid,
      validPercentage: results.size > 0 ? (valid / results.size) * 100 : 0,
    }
  }
}
