// ========================================
// 设置面板组件 (Pro版 - 4个标签页)
// 通用 | 自定义家具 | ASR引擎 | 测试
// ========================================

import { useState, useEffect } from 'react'
import { getVoiceController } from '../../utils/controller'
import { getSettingsManager } from '../../utils/settings-manager'
import { buildAudioConstraints } from '../../utils/audio'
import { DIALECT_REGION_PACKS } from '../../utils/dialect-lexicon'
import { DIALECT_TEST_CORPUS } from '../../utils/dialect-test-corpus'
import { normalizeTranscript, stripTranscriptPunctuation } from '../../utils/transcript-normalizer'
import { loadReplacementMap } from '../../utils/utils'
import type { AppSettings, SettingsTab, AsrEngine } from '../../types'
import styles from './index.module.css'

interface SettingsProps {
  show: boolean
  onClose: () => void
  onShowAddFurniture: () => void
  onShowFurnitureList: () => void
  customFurnitureCount: number
  onUpdateCount: () => void
  onShowToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
  /** 当前活跃的ASR引擎 */
  activeEngine: AsrEngine
  /** 后端是否可用 */
  backendAvailable: boolean
  /** 切换引擎回调 */
  onSwitchEngine: (engine: AsrEngine) => Promise<void>
  /** 重新扫描后端回调 */
  onRescanBackend: () => Promise<boolean>
  /** 同步运行时设置 */
  onSettingsChange: () => void
}

export function Settings({
  show,
  onClose,
  onShowAddFurniture,
  onShowFurnitureList,
  customFurnitureCount,
  onUpdateCount,
  onShowToast,
  activeEngine,
  backendAvailable,
  onSwitchEngine,
  onRescanBackend,
  onSettingsChange,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [settings, setSettings] = useState<AppSettings>(() =>
    getSettingsManager().getSettings()
  )
  const [isScanning, setIsScanning] = useState(false)
  const [selectedDialectCategory, setSelectedDialectCategory] = useState(
    DIALECT_TEST_CORPUS[0]?.category || ''
  )
  const [replacementMap, setReplacementMap] = useState<Map<string, string>>(new Map())
  const [debugPanel, setDebugPanel] = useState<{
    original: string
    normalized: string
    result: string
  } | null>(null)

  const controller = getVoiceController()
  const settingsManager = getSettingsManager()

  // 加载设置
  useEffect(() => {
    if (show) {
      setSettings(settingsManager.getSettings())
    }
  }, [show])

  useEffect(() => {
    loadReplacementMap('/data/asr_replace_zh.txt').then(setReplacementMap)
  }, [])

  if (!show) return null

  // 更新设置
  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    settingsManager.set(key, value)
    setSettings(settingsManager.getSettings())
    onSettingsChange()
    onShowToast('设置已保存', 'success')
  }

  const toggleDialectRegion = (regionId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...settings.enabledDialectRegions, regionId]))
      : settings.enabledDialectRegions.filter((item) => item !== regionId)

    updateSetting('enabledDialectRegions', next)
  }

  const selectedDialectSamples =
    DIALECT_TEST_CORPUS.find((item) => item.category === selectedDialectCategory)?.samples || []

  // 测试麦克风
  const testMicrophone = async () => {
    onShowToast('正在测试麦克风...', 'info')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints({
          enableAudioEnhancement: settings.enableAudioEnhancement,
        }),
      })
      onShowToast('麦克风测试成功', 'success')
      stream.getTracks().forEach(track => track.stop())
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      onShowToast('麦克风测试失败: ' + message, 'error')
    }
  }

  // 测试语音识别
  const testVoice = (text: string) => {
    try {
      const normalized = normalizeTranscript(text, {
        replacementMap,
        enableCleanup: settings.enableTranscriptCleanup,
        enableDomainHotwords: settings.enableDomainHotwords,
        enableDialectNormalization: settings.enableDialectNormalization,
        enabledDialectRegions: settings.enabledDialectRegions,
        customDialectMappings: settings.customDialectMappings,
        customFurniture: controller.getCustomFurniture(),
      })
      const result = controller.process(stripTranscriptPunctuation(normalized), undefined)

      if (settings.showDialectVisualizationPanel) {
        setDebugPanel({
          original: text,
          normalized,
          result: JSON.stringify(result, null, 2),
        })
      } else {
        setDebugPanel(null)
      }

      if (result && result.model) {
        const confidence = result.confidence
        onShowToast(
          `解析成功：${result.model} (${confidence}%)`,
          'success',
        )
      } else {
        onShowToast('无法识别该指令', 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '解析失败'
      onShowToast('解析失败: ' + message, 'error')
    }
  }

  // 清空所有自定义家具
  const clearAllCustomFurniture = () => {
    const list = controller.getCustomFurniture()
    if (list.length === 0) {
      onShowToast('没有自定义家具需要清空', 'warning')
      return
    }

    if (
      confirm(
        `确定要清空所有 ${list.length} 个自定义家具吗？此操作无法撤销！`,
      )
    ) {
      controller.clearCustomFurniture()
      onShowToast('已清空所有自定义家具', 'success')
      onUpdateCount()
    }
  }

  // 重新扫描后端
  const handleRescan = async () => {
    setIsScanning(true)
    onShowToast('正在扫描后端服务...', 'info')
    try {
      const available = await onRescanBackend()
      if (available) {
        onShowToast('已找到后端ASR服务', 'success')
      } else {
        onShowToast('未找到后端ASR服务，使用浏览器识别', 'warning')
      }
    } finally {
      setIsScanning(false)
    }
  }

  // 切换ASR引擎
  const handleEngineSwitch = async (engine: AsrEngine) => {
    if (engine === 'backend-whisper' && !backendAvailable) {
      onShowToast('后端ASR不可用，请先启动服务', 'warning')
      return
    }
    await onSwitchEngine(engine)
    updateSetting('preferredAsrEngine', engine)
  }

  // 主题切换
  const handleThemeChange = (mode: 'auto' | 'light' | 'dark') => {
    updateSetting('enableDarkMode', mode)
    if (mode === 'auto') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', mode)
    }
  }

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>系统设置</div>
          <button className={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>

        {/* 标签页切换 (4 tabs) */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'general' ? styles.active : ''}`}
            onClick={() => setActiveTab('general')}
          >
            通用
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'furniture' ? styles.active : ''}`}
            onClick={() => setActiveTab('furniture')}
          >
            自定义家具
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'asr' ? styles.active : ''}`}
            onClick={() => setActiveTab('asr')}
          >
            ASR引擎
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'test' ? styles.active : ''}`}
            onClick={() => setActiveTab('test')}
          >
            测试
          </button>
        </div>

        {/* ====== 通用设置 ====== */}
        {activeTab === 'general' && (
          <div className={styles.tabContent}>
            {/* 快捷键设置 */}
            <div className={styles.section}>
              <h3>快捷键</h3>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>空格键快捷键</label>
                  <p className={styles.settingDesc}>
                    长按空格键开始录音，松开停止
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableSpaceHotkey}
                    onChange={(e) =>
                      updateSetting('enableSpaceHotkey', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>F9 快捷键</label>
                  <p className={styles.settingDesc}>
                    按 F9 切换录音开始/停止
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableF9Hotkey}
                    onChange={(e) =>
                      updateSetting('enableF9Hotkey', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>

            {/* 录音设置 */}
            <div className={styles.section}>
              <h3>录音</h3>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>自动执行API</label>
                  <p className={styles.settingDesc}>
                    识别成功后自动调用酷家乐API
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.autoExecuteAPI}
                    onChange={(e) =>
                      updateSetting('autoExecuteAPI', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>自动停止秒数</label>
                  <p className={styles.settingDesc}>
                    录音超过该时长自动停止 ({settings.maxRecordingSeconds}秒)
                  </p>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={settings.maxRecordingSeconds}
                  onChange={(e) =>
                    updateSetting('maxRecordingSeconds', Number(e.target.value))
                  }
                  className={styles.rangeInput}
                />
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>音频增强</label>
                  <p className={styles.settingDesc}>
                    开启降噪、回声消除、自动增益和单声道采集
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableAudioEnhancement}
                    onChange={(e) =>
                      updateSetting('enableAudioEnhancement', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>静音自动停录</label>
                  <p className={styles.settingDesc}>
                    后端 Whisper 录音时，检测到持续静音后自动结束录音
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableAutoStopOnSilence}
                    onChange={(e) =>
                      updateSetting('enableAutoStopOnSilence', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>静音判定时长</label>
                  <p className={styles.settingDesc}>
                    持续静音达到该时长后自动停录 ({(settings.silenceDurationMs / 1000).toFixed(1)}秒)
                  </p>
                </div>
                <input
                  type="range"
                  min="800"
                  max="4000"
                  step="200"
                  value={settings.silenceDurationMs}
                  disabled={!settings.enableAutoStopOnSilence}
                  onChange={(e) =>
                    updateSetting('silenceDurationMs', Number(e.target.value))
                  }
                  className={styles.rangeInput}
                />
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>口语清洗</label>
                  <p className={styles.settingDesc}>
                    自动清理语气词、重复词和多余标点，提升短指令可解析性
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableTranscriptCleanup}
                    onChange={(e) =>
                      updateSetting('enableTranscriptCleanup', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>领域热词纠正</label>
                  <p className={styles.settingDesc}>
                    基于内置家具库和自定义家具，对同音或近音词做优先纠正
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableDomainHotwords}
                    onChange={(e) =>
                      updateSetting('enableDomainHotwords', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>方言语言强化</label>
                  <p className={styles.settingDesc}>
                    将常见方言动作词、方位词、家具叫法归一成标准中文，提升方言转文字后的可解析性
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableDialectNormalization}
                    onChange={(e) =>
                      updateSetting('enableDialectNormalization', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>方言三段可视化面板</label>
                  <p className={styles.settingDesc}>
                    在测试页显示归一化前、归一化后和最终解析结果，便于定位方言识别问题
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showDialectVisualizationPanel}
                    onChange={(e) =>
                      updateSetting('showDialectVisualizationPanel', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>方言地区包</label>
                  <p className={styles.settingDesc}>
                    选择需要强化的地区口语，通用口语包始终开启
                  </p>
                </div>
                <div className={styles.checkboxGroup}>
                  {DIALECT_REGION_PACKS.filter((item) => item.id !== 'common').map((pack) => (
                    <label key={pack.id} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={settings.enabledDialectRegions.includes(pack.id)}
                        disabled={!settings.enableDialectNormalization}
                        onChange={(e) => toggleDialectRegion(pack.id, e.target.checked)}
                      />
                      <span>{pack.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>自定义方言映射</label>
                  <p className={styles.settingDesc}>
                    每行一条，格式如 `搞快点=快一点` 或 `床边桌=床头柜`
                  </p>
                </div>
                <textarea
                  className={styles.textareaInput}
                  rows={5}
                  value={settings.customDialectMappings}
                  placeholder={'搞快点=快一点\n床边桌=床头柜'}
                  disabled={!settings.enableDialectNormalization}
                  onChange={(e) => updateSetting('customDialectMappings', e.target.value)}
                />
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>混合双通道识别</label>
                  <p className={styles.settingDesc}>
                    后端 Whisper 录音时并行启用浏览器识别，优先显示更快的 interim，最终结果以后端为准
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableHybridAsr}
                    onChange={(e) =>
                      updateSetting('enableHybridAsr', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>

            {/* 解析器设置 */}
            <div className={styles.section}>
              <h3>解析器</h3>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>模糊匹配</label>
                  <p className={styles.settingDesc}>
                    使用相似度算法匹配家具名称
                  </p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enableFuzzyMatch}
                    onChange={(e) =>
                      updateSetting('enableFuzzyMatch', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>拼音匹配</label>
                  <p className={styles.settingDesc}>支持拼音输入和同音字</p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.enablePinyinMatch}
                    onChange={(e) =>
                      updateSetting('enablePinyinMatch', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>

            {/* 界面设置 */}
            <div className={styles.section}>
              <h3>界面</h3>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>显示置信度</label>
                  <p className={styles.settingDesc}>显示识别置信度进度条</p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showConfidence}
                    onChange={(e) =>
                      updateSetting('showConfidence', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>显示候选结果</label>
                  <p className={styles.settingDesc}>显示其他可能的识别结果</p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showCandidates}
                    onChange={(e) =>
                      updateSetting('showCandidates', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>显示关键词</label>
                  <p className={styles.settingDesc}>显示关键词提取面板</p>
                </div>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={settings.showKeywords}
                    onChange={(e) =>
                      updateSetting('showKeywords', e.target.checked)
                    }
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>主题模式</label>
                  <p className={styles.settingDesc}>自动跟随系统 / 浅色 / 深色</p>
                </div>
                <div className={styles.themeSelector}>
                  {(['auto', 'light', 'dark'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`${styles.themeBtn} ${settings.enableDarkMode === mode ? styles.active : ''}`}
                      onClick={() => handleThemeChange(mode)}
                    >
                      {mode === 'auto' ? '自动' : mode === 'light' ? '浅色' : '深色'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== 自定义家具 ====== */}
        {activeTab === 'furniture' && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3>自定义家具管理</h3>
                <div className={styles.furnitureCount}>
                  已添加 {customFurnitureCount} 个
                </div>
              </div>
              <div className={styles.furnitureActions}>
                <button
                  className={`${styles.actionBtn} ${styles.primary}`}
                  onClick={onShowAddFurniture}
                >
                  <span>+</span> 添加家具
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={onShowFurnitureList}
                >
                  <span>列</span> 查看列表
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.danger}`}
                  onClick={clearAllCustomFurniture}
                >
                  <span>x</span> 清空全部
                </button>
              </div>
              <div className={styles.tips}>
                <p>提示：</p>
                <ul>
                  <li>只有系统不存在的家具才会被添加</li>
                  <li>添加时会自动验证是否为有效的家居物品</li>
                  <li>支持添加别名提高识别准确率</li>
                </ul>
              </div>
            </div>

            {/* 系统信息 */}
            <div className={styles.section}>
              <h3>系统信息</h3>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>版本</span>
                <span className={styles.infoValue}>v1.0.0 Pro</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>内置家具</span>
                <span className={styles.infoValue}>1329 种 (酷家乐)</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>自定义家具</span>
                <span className={styles.infoValue}>{customFurnitureCount} 种</span>
              </div>
            </div>
          </div>
        )}

        {/* ====== ASR引擎设置 (新增标签页，来自Dbao) ====== */}
        {activeTab === 'asr' && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <h3>ASR引擎选择</h3>
              <p className={styles.sectionDesc}>
                选择语音识别引擎。后端ASR (faster-whisper) 准确度更高，但需要启动后端服务。
              </p>

              <div className={styles.engineCards}>
                <div
                  className={`${styles.engineCard} ${activeEngine === 'web-speech' ? styles.activeCard : ''}`}
                  onClick={() => handleEngineSwitch('web-speech')}
                >
                  <div className={styles.engineHeader}>
                    <span className={styles.engineName}>Web Speech API</span>
                    {activeEngine === 'web-speech' && (
                      <span className={styles.activeBadge}>当前</span>
                    )}
                  </div>
                  <p className={styles.engineDesc}>浏览器原生识别，零配置，延迟低</p>
                  <div className={styles.engineStatus}>
                    <span className={`${styles.statusDot} ${styles.online}`}></span>
                    始终可用
                  </div>
                </div>

                <div
                  className={`${styles.engineCard} ${activeEngine === 'backend-whisper' ? styles.activeCard : ''} ${!backendAvailable ? styles.disabledCard : ''}`}
                  onClick={() => handleEngineSwitch('backend-whisper')}
                >
                  <div className={styles.engineHeader}>
                    <span className={styles.engineName}>Backend Whisper</span>
                    {activeEngine === 'backend-whisper' && (
                      <span className={styles.activeBadge}>当前</span>
                    )}
                  </div>
                  <p className={styles.engineDesc}>faster-whisper 后端，准确度高，支持实时+终版双模式</p>
                  <div className={styles.engineStatus}>
                    <span className={`${styles.statusDot} ${backendAvailable ? styles.online : styles.offline}`}></span>
                    {backendAvailable ? '已连接' : '未连接'}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h3>后端配置</h3>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>API 地址</label>
                  <p className={styles.settingDesc}>
                    留空则自动扫描 8000-8010 端口
                  </p>
                </div>
                <input
                  type="text"
                  className={styles.textInput}
                  value={settings.backendApiBase}
                  onChange={(e) => updateSetting('backendApiBase', e.target.value)}
                  placeholder="http://127.0.0.1:8000"
                />
              </div>

              <button
                className={`${styles.actionBtn} ${styles.primary} ${styles.fullWidth}`}
                onClick={handleRescan}
                disabled={isScanning}
              >
                {isScanning ? '扫描中...' : '重新扫描后端'}
              </button>
            </div>
          </div>
        )}

        {/* ====== 测试功能 ====== */}
        {activeTab === 'test' && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <h3>麦克风测试</h3>
              <button
                className={`${styles.testBtn} ${styles.primary}`}
                onClick={testMicrophone}
              >
                测试麦克风权限
              </button>
              <p className={styles.testDesc}>检查浏览器是否能访问麦克风</p>
            </div>

            <div className={styles.section}>
              <h3>快速识别测试</h3>
              <div className={styles.testButtons}>
                <button
                  className={styles.testBtn}
                  onClick={() => testVoice('放个三人沙发')}
                >
                  放个三人沙发
                </button>
                <button
                  className={styles.testBtn}
                  onClick={() => testVoice('在沙发的旁边放一个抱枕')}
                >
                  在沙发旁边放抱枕
                </button>
                <button
                  className={styles.testBtn}
                  onClick={() => testVoice('我想要一个茶机')}
                >
                  茶机（同音字）
                </button>
                <button
                  className={styles.testBtn}
                  onClick={() => testVoice('来个衣桂')}
                >
                  衣桂（同音字）
                </button>
              </div>
              <p className={styles.testDesc}>测试语音识别和同音字纠正功能</p>
            </div>

            <div className={styles.section}>
              <h3>全场景方言测试</h3>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <label className={styles.settingLabel}>测试场景</label>
                  <p className={styles.settingDesc}>
                    覆盖家居、日常、导航、办公、购物、餐饮、聊天、设备控制等方言样例
                  </p>
                </div>
                <select
                  className={styles.selectInput}
                  value={selectedDialectCategory}
                  onChange={(e) => setSelectedDialectCategory(e.target.value)}
                >
                  {DIALECT_TEST_CORPUS.map((item) => (
                    <option key={item.category} value={item.category}>
                      {item.category}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.testButtons}>
                {selectedDialectSamples.map((sample) => (
                  <button
                    key={sample}
                    className={styles.testBtn}
                    onClick={() => testVoice(sample)}
                  >
                    {sample}
                  </button>
                ))}
              </div>
              <p className={styles.testDesc}>一键验证不同方言场景下的归一化和解析表现</p>

              {settings.showDialectVisualizationPanel && debugPanel && (
                <div className={styles.debugPanel}>
                  <div className={styles.debugBlock}>
                    <div className={styles.debugTitle}>归一化前</div>
                    <pre className={styles.debugContent}>{debugPanel.original}</pre>
                  </div>
                  <div className={styles.debugBlock}>
                    <div className={styles.debugTitle}>归一化后</div>
                    <pre className={styles.debugContent}>{debugPanel.normalized}</pre>
                  </div>
                  <div className={styles.debugBlock}>
                    <div className={styles.debugTitle}>解析结果</div>
                    <pre className={styles.debugContent}>{debugPanel.result}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
