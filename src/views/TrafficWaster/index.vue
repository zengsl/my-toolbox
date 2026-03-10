<script setup lang="ts">
import type { InitialConfig } from './logic'
import {
  Cellphone,
  Clock,
  Close,
  Connection,
  CopyDocument,
  Link,
  Refresh,
  Timer,
  VideoPause,
  VideoPlay,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
// 【新增】引入保活工具
import { isKeepAliveActive, startKeepAlive, stopKeepAlive, updateKeepAliveStatus } from '@/utils/iosKeepAlive'
// 【新增】引入保活工具
import { useTrafficWaster } from './logic'

// ... (接口定义保持不变) ...
interface UrlOption {
  label: string
  value: string
}

type ButtonType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

interface LocalConfig {
  threads: number
  customUrlInput: string
  resourceUrlInput: string
}

const urlOptions: UrlOption[] = [
  { label: '移动云盘 1 图片', value: 'yd1' },
  { label: '移动云盘 2 示例 (2.43GB)', value: 'yd2' },
  { label: '移动云盘 3 图片', value: 'yd3' },
  { label: '移动云盘 4 图片', value: 'yd4' },
  { label: '🔗 自定义输入...', value: 'custom' },
]

const urlMap: Record<string, string> = {
  yd1: 'https://img.mcloud.139.com/material_prod/material_media/20221128/1669626861087.png',
  yd2: 'https://yun.mcloud.139.com/hongseyunpan/2.43G.zip',
  yd3: 'https://open.yun.139.com/static/img/case_bg_1.16716f8f.png',
  yd4: 'https://img.mcloud.139.com/material_prod/material_media/20230605/1685935277971.jpg',
}

const getQueryParam = (p: string) => new URLSearchParams(window.location.search).get(p)

function parseTargetParam(v: string | null) {
  if (!v)
    return 1
  if (v.toLowerCase() === 'infinity' || v === '0')
    return 'infinity'
  const n = Number.parseFloat(v)
  return Number.isNaN(n) ? 1 : n
}

function parseThreadsParam(v: string | null) {
  if (!v)
    return 6
  const n = Number.parseInt(v, 10)
  return Number.isNaN(n) || n < 1 ? 2 : n
}

const parseBoolParam = (v: string | null) => v === 'true' || v === '1'

const initTarget = parseTargetParam(getQueryParam('target'))
const initThreads = parseThreadsParam(getQueryParam('threads'))
const initAutoStart = parseBoolParam(getQueryParam('autoStart'))
const initBackground = parseBoolParam(getQueryParam('background'))
const initResourceParam = getQueryParam('resource')

let initResourceUrl = urlMap.yd1
let initSelectedUrlMode = 'yd1'
if (initResourceParam) {
  if (urlMap[initResourceParam]) {
    initResourceUrl = urlMap[initResourceParam]
    initSelectedUrlMode = initResourceParam
  }
  else if (initResourceParam.startsWith('http')) {
    initResourceUrl = initResourceParam
    initSelectedUrlMode = 'custom'
  }
}

const DEFAULT_CONFIG: InitialConfig = { targetGB: initTarget, resourceUrl: initResourceUrl, threads: initThreads }
const { state, start, pause, stop, reset, updateConfig, subscribe, formatSize } = useTrafficWaster(DEFAULT_CONFIG)

const selectedUrlMode = ref<string>(initSelectedUrlMode)
const selectedTargetMode = ref<number | 'infinity' | 'custom'>(typeof initTarget === 'number' && ![0.5, 1, 2, 5, 10, 20, 50, 100, 200, 400].includes(initTarget) ? 'custom' : initTarget)
const customTargetValue = ref<number>(typeof initTarget === 'number' ? initTarget : 1)
const config = reactive<LocalConfig>({
  threads: state.threads,
  customUrlInput: initSelectedUrlMode === 'custom' ? initResourceUrl : '',
  resourceUrlInput: initResourceUrl,
})

const totalDownloaded = ref(0)
const currentSpeed = ref(0)
const activeThreads = ref(0)
const status = ref<typeof state.status>('idle')
const requestCount = ref(0)
const errorCount = ref(0)
const lastError = ref<string | null>(null)
const avgSpeed = ref(0)
const isIOSBackgroundEnabled = ref(initBackground)

let timerInterval: number | null = null
const currentTime = ref(Date.now())
let unsubscribe: (() => void) | null = null
const isMobile = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}

const isRunningState = computed(() => ['starting', 'running', 'paused'].includes(status.value))
const effectiveTargetGB = computed(() => selectedTargetMode.value === 'custom' ? customTargetValue.value : selectedTargetMode.value)
const currentResourceUrl = computed(() => config.resourceUrlInput || '未选择')

// 处理鼠标移动事件，计算悬停位置
function handleChartMouseMove(event: MouseEvent, dataLength: number) {
  if (!dataLength)
    return
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  const x = event.clientX - rect.left
  const width = rect.width

  // 计算鼠标对应的是第几个数据点
  const index = Math.min(
    dataLength - 1,
    Math.max(0, Math.floor((x / width) * dataLength)),
  )

  hoverIndex.value = index
  tooltipPos.value = { x: event.clientX, y: event.clientY }
}

function handleChartLeave() {
  hoverIndex.value = null
  isChartHovered.value = false
}

function handleChartEnter() {
  isChartHovered.value = true
}

const showChart = ref(false)
const maxSpeed = computed(() => {
  // 【保护】如果开关关闭或无数据，直接返回 0
  if (!showChart.value || !state.speedHistory || state.speedHistory.length === 0)
    return 0
  const max = Math.max(...state.speedHistory.map(d => d?.speed || 0))
  return max > 0 ? max : 1000
})

const sparklinePoints = computed(() => {
  // 【保护】开关关闭直接返回空，不执行任何计算
  if (!showChart.value)
    return ''

  const history = state.speedHistory
  if (!history || history.length < 2)
    return ''

  const width = 100
  const height = 50
  const maxVal = maxSpeed.value

  const len = history.length - 1
  if (len === 0)
    return ''

  return history.map((d, index) => {
    if (!d || typeof d.speed !== 'number')
      return ''
    const x = (index / len) * width
    const y = height - ((d.speed / maxVal) * height)
    return `${x},${y}`
  }).filter(p => p !== '').join(' ')
})

const hoverData = computed(() => {
  // 【保护】开关关闭直接返回 null
  if (!showChart.value)
    return null
  if (hoverIndex.value === null)
    return null
  if (!state.speedHistory || hoverIndex.value >= state.speedHistory.length)
    return null

  const data = state.speedHistory[hoverIndex.value]
  if (!data || typeof data.speed !== 'number')
    return null

  return {
    speed: data.speed,
    time: new Date(data.time),
    speedStr: formatSpeed(data.speed),
    timeStr: data.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
})

const displayTarget = computed(() => {
  if (selectedTargetMode.value === 'infinity')
    return '∞'
  if (selectedTargetMode.value === 'custom')
    return `${customTargetValue.value} GB`
  return `${selectedTargetMode.value} GB`
})

const exampleUrl = computed(() => {
  const origin = window.location.origin
  const path = window.location.pathname
  let targetParam = '1'
  if (selectedTargetMode.value === 'infinity')
    targetParam = 'infinity'
  else if (selectedTargetMode.value === 'custom')
    targetParam = String(customTargetValue.value)
  else targetParam = String(selectedTargetMode.value)

  let resourceParam = selectedUrlMode.value
  if (!Object.keys(urlMap).includes(selectedUrlMode.value))
    resourceParam = 'yd1'

  const params = new URLSearchParams({
    target: targetParam,
    threads: String(config.threads),
    autoStart: 'true',
    background: isIOSBackgroundEnabled.value ? 'true' : 'false',
    resource: resourceParam,
  })
  return `${origin}${path}?${params.toString()}`
})

function copyExampleUrl() {
  navigator.clipboard.writeText(exampleUrl.value)
  ElMessage.success('当前配置链接已复制！')
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  unsubscribe = subscribe((newState) => {
    totalDownloaded.value = newState.totalDownloaded
    currentSpeed.value = newState.currentSpeed
    activeThreads.value = newState.activeThreads
    status.value = newState.status
    requestCount.value = newState.requestCount
    errorCount.value = newState.errorCount
    lastError.value = newState.lastError

    if (newState.startTime) {
      const d = (Date.now() - newState.startTime) / 1000
      avgSpeed.value = d > 0 ? newState.totalDownloaded / d : 0
    }
    else {
      avgSpeed.value = 0
    }

    // 【新增】如果开启了保活，实时更新锁屏显示的速度
    // 【关键修改】调用更新函数
    if (isIOSBackgroundEnabled.value) {
      const isRunning = newState.status === 'running'
      updateKeepAliveStatus(
        formatSpeed(newState.currentSpeed),
        newState.totalDownloaded,
        isRunning,
      )
    }
  })

  timerInterval = window.setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)

  if (initAutoStart)
    setTimeout(handleStart, 500)
  if (initBackground)
    toggleIOSBackground(true)
})

onUnmounted(() => {
  if (unsubscribe)
    unsubscribe()
  if (timerInterval)
    clearInterval(timerInterval)
  stop()

  // 【清理】调用工具函数的停止方法
  stopKeepAlive()

  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('resize', checkMobile)
})

const formatMbps = (b: number) => b <= 0 ? '0 Mbps' : `${((b * 8) / (1024 * 1024)).toFixed(2)} Mbps`
const formatSpeed = (b: number) => `${formatSize(b)}/s`
const elapsedTimeStr = computed(() => {
  // 1. 如果没有开始时间，返回 0
  if (!state.startTime)
    return '00:00:00'

  // 2. 【核心修改】如果任务已结束、停止或出错，使用“结束时间”而非“当前时间”
  // 这样计时器就会定格在任务结束的那一刻
  const isFinishedState = ['finished', 'stopped', 'error'].includes(status.value)

  let endTime = currentTime.value // 默认使用当前时间（运行时）

  if (isFinishedState && state.lastCheckTime) {
    // 如果处于结束状态，且有最后检查时间，则使用该时间作为结束点
    // 注意：lastCheckTime 在 logic.ts 的定时器中每秒更新，非常接近实际结束时间
    endTime = state.lastCheckTime
  }
  else if (isFinishedState && !state.lastCheckTime) {
    // 极端情况：如果刚启动就报错没有 lastCheckTime，fallback 到 startTime
    endTime = state.startTime
  }

  return formatDuration(endTime - state.startTime)
})
const estimatedEndTimeStr = computed(() => {
  if (effectiveTargetGB.value === 'infinity' || currentSpeed.value <= 0 || status.value !== 'running')
    return '-'
  const target = (effectiveTargetGB.value as number) * 1024 * 1024 * 1024
  const rem = target - totalDownloaded.value
  if (rem <= 0)
    return '即将完成'
  const etaSeconds = rem / currentSpeed.value
  if (etaSeconds < 10)
    return '即将完成'
  return new Date(currentTime.value + etaSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * 切换 iOS 后台保活开关
 */
function toggleIOSBackground(enabled?: boolean) {
  const shouldEnable = enabled !== undefined ? enabled : isIOSBackgroundEnabled.value
  if (!shouldEnable) {
    stopKeepAlive()
    return
  }
  try {
    startKeepAlive({
      volume: 0.05,
      onPlay: () => {
        if (['paused', 'idle'].includes(status.value))
          handleStart()
      },
      onPause: () => {
        if (status.value === 'running')
          handlePauseToggle()
      },
    })
    ElMessage.success('后台保活已开启')
  }
  catch (e) {
    ElMessage.warning('启动失败，请点击页面后再试')
    isIOSBackgroundEnabled.value = false
  }
}
function handleTargetModeChange(v: any) {
  selectedTargetMode.value = v
  updateConfig('targetGB', v === 'custom' ? customTargetValue.value : v)
}

const handleCustomTargetChange = (v: number | undefined, p: number | undefined) => updateConfig('targetGB', v)

function handleUrlModeChange(v: string) {
  if (v === 'custom') {
    if (!config.customUrlInput)
      config.customUrlInput = 'https://'
    handleCustomUrlInput(config.customUrlInput)
  }
  else {
    const rawUrl = urlMap[v] || v
    const cleanUrl = rawUrl.trim()
    config.resourceUrlInput = cleanUrl
    updateConfig('resourceUrl', cleanUrl)
  }
}

function handleCustomUrlInput(v: string) {
  const u = v
  config.resourceUrlInput = u
  updateConfig('resourceUrl', u)
}

function copyUrl() {
  if (!currentResourceUrl.value || currentResourceUrl.value === '未选择')
    return
  navigator.clipboard.writeText(currentResourceUrl.value)
  ElMessage.success('URL 已复制')
}

const progressPercent = computed(() => {
  const t = effectiveTargetGB.value
  if (t === 'infinity')
    return 0
  const tb = (t as number) * 1024 * 1024 * 1024
  return tb === 0 ? 0 : Math.min(100, (totalDownloaded.value / tb) * 100)
})
const statusText = computed(() => ({
  idle: '就绪',
  starting: '启动中',
  running: '运行中',
  paused: '已暂停',
  stopped: '已停止',
  finished: '已完成',
  error: '出错了',
}[status.value] || status.value))
const statusTagType = computed(() => ({
  idle: 'info',
  starting: 'primary',
  running: 'success',
  paused: 'warning',
  stopped: 'info',
  finished: 'success',
  error: 'danger',
}[status.value] || 'info'))
const customProgressColor = computed(() => {
  if (status.value === 'error')
    return '#F56C6C'
  if (status.value === 'paused')
    return '#E6A23C'
  if (effectiveTargetGB.value === 'infinity')
    return '#409EFF'
  const p = progressPercent.value
  return p < 50 ? '#409EFF' : p < 80 ? '#67C23A' : '#E6A23C'
})
const startTimeStr = computed(() => state.startTime ? new Date(state.startTime).toLocaleTimeString() : '-')

function handleStart() {
  // 【关键】如果是 iOS 且开启了保活，先启动音频
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && isIOSBackgroundEnabled.value) {
    toggleIOSBackground(true)
  }

  if (selectedUrlMode.value === 'custom' && !config.customUrlInput.trim()) {
    ElMessage.warning('请输入自定义资源 URL')
    return
  }
  if (selectedUrlMode.value === 'custom')
    handleCustomUrlInput(config.customUrlInput)
  if (!config.resourceUrlInput) {
    ElMessage.warning('资源 URL 不能为空')
    return
  }

  requestCount.value = 0
  errorCount.value = 0
  lastError.value = null
  start()
  ElMessage.success(effectiveTargetGB.value === 'infinity' ? '任务已启动 (无限制)' : '任务已启动')
}

function handlePauseToggle() {
  if (status.value === 'running') {
    pause()
    ElMessage.info('任务已暂停')
  }
  else if (status.value === 'paused') {
    start()
    ElMessage.success('任务已继续')
  }
}

function handleStop() {
  stop()
  ElMessage.warning('任务已停止')
}

function handleReset() {
  reset()
  ElMessage.success('数据已重置')
}

// 图表相关变量 (原代码中缺失，补充以防报错)
const hoverIndex = ref<number | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })
const isChartHovered = ref(false)

function handleVisibilityChange() {
  if (!document.hidden) {
    console.log('👁️ 页面回到前台')
    // 使用 <audio> 标签通常会自动恢复，但如果发现暂停了，可以尝试提示用户
    if (isIOSBackgroundEnabled.value && !isKeepAliveActive()) {
      console.log('⚠️ 检测到保活中断，可能需要用户再次交互')
    }
  }
}
</script>

<template>
  <div class="tool-page">
    <div class="page-header">
      <h2>
        <el-icon>
          <Wallet />
        </el-icon>
        流量消耗器
      </h2>
      <p class="page-desc">
        通过不断下载资源来测试或消耗网络流量
      </p>
    </div>

    <!-- 示例链接展示区 -->
    <div class="example-banner">
      <div class="banner-content">
        <span class="banner-label">
          <el-icon><Connection /></el-icon>
          <strong>快速启动示例：</strong>
        </span>
        <div class="url-box">
          <code class="url-text">{{ exampleUrl }}</code>
          <el-button
            type="primary"
            link
            class="copy-btn"
            @click="copyExampleUrl"
          >
            <el-icon>
              <CopyDocument />
            </el-icon>
            复制
          </el-button>
        </div>
      </div>
      <div class="banner-tip">
        提示：链接已同步当前配置 (目标：{{ displayTarget }}, 线程：{{ config.threads }})。
      </div>
    </div>

    <!-- 修改点：添加 class="height-equal-row" 用于控制高度对齐 -->
    <el-row :gutter="20" class="height-equal-row">
      <!-- 左侧：配置面板 -->
      <el-col :xs="24" :sm="24" :md="24" :lg="8">
        <el-card shadow="always" class="config-card full-height-card">
          <template #header>
            <span class="card-title">⚙️ 配置设置</span>
          </template>

          <el-form label-position="top" size="large">
            <el-form-item label="目标流量">
              <el-select
                v-model="selectedTargetMode" style="width: 100%" :disabled="isRunningState"
                @change="handleTargetModeChange"
              >
                <el-option label="♾️ 无限制 (手动停止)" value="infinity" />
                <el-option label="0.5 GB" :value="0.5" />
                <el-option label="1 GB" :value="1" />
                <el-option label="2 GB" :value="2" />
                <el-option label="5 GB" :value="5" />
                <el-option label="10 GB" :value="10" />
                <el-option label="20 GB" :value="20" />
                <el-option label="50 GB" :value="50" />
                <el-option label="100 GB" :value="100" />
                <el-option label="200 GB" :value="200" />
                <el-option label="400 GB" :value="400" />
                <el-option label="📝 自定义输入..." value="custom" />
              </el-select>
              <div v-if="selectedTargetMode === 'custom'" class="custom-input-wrapper">
                <el-input-number
                  v-model.number="customTargetValue" :min="0.1" :max="10000" :step="0.1"
                  style="width: 100%" @change="handleCustomTargetChange"
                >
                  <template #suffix>
                    GB
                  </template>
                </el-input-number>
              </div>
              <div
                v-else-if="selectedTargetMode === 'infinity'" class="form-tip"
                style="color: #E6A23C; margin-top: 5px;"
              >
                <el-icon>
                  <Warning />
                </el-icon>
                任务将一直运行，直到您点击“停止”。
              </div>
            </el-form-item>

            <el-form-item label="并发线程数">
              <el-input-number
                v-model.number="config.threads" :min="1" :max="50" style="width: 100%"
                :disabled="isRunningState" @change="updateConfig('threads', config.threads)"
              />
            </el-form-item>

            <el-form-item label="资源 URL">
              <el-select
                v-model="selectedUrlMode" style="width: 100%" :disabled="isRunningState"
                @change="handleUrlModeChange"
              >
                <el-option v-for="item in urlOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <div v-if="selectedUrlMode === 'custom'" class="custom-input-wrapper">
                <el-input
                  v-model="config.customUrlInput" placeholder="请输入网址" clearable
                  @input="handleCustomUrlInput"
                >
                  <template #prefix>
                    <el-icon>
                      <Link />
                    </el-icon>
                  </template>
                </el-input>
              </div>
            </el-form-item>

            <el-form-item label="iOS Safari 后台保活">
              <div class="ios-bg-switch">
                <el-switch
                  v-model="isIOSBackgroundEnabled" inline-prompt active-text="开" inactive-text="关"
                  style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                  @change="toggleIOSBackground"
                />
                <div class="form-tip" style="margin-top: 5px;">
                  <el-icon>
                    <Cellphone />
                  </el-icon>
                  开启后播放静音音频，并在锁屏/灵动岛显示速度
                </div>
              </div>
            </el-form-item>

            <div class="action-area">
              <el-button
                v-if="status === 'idle' || status === 'stopped' || status === 'finished' || status === 'error'"
                type="primary" size="large" :loading="status === 'starting'" style="width: 100%"
                @click="handleStart"
              >
                <el-icon>
                  <VideoPlay />
                </el-icon>
                开始消耗
              </el-button>
              <template v-else-if="status === 'running' || status === 'paused'">
                <div class="btn-row">
                  <el-button
                    :type="status === 'running' ? 'warning' : 'success'" size="large"
                    style="flex: 1;" @click="handlePauseToggle"
                  >
                    <el-icon>
                      <VideoPause v-if="status === 'running'" />
                      <VideoPlay v-else />
                    </el-icon>
                    {{ status === 'running' ? '暂停' : '继续' }}
                  </el-button>
                  <el-button type="danger" size="large" style="flex: 1; margin-left: 10px;" @click="handleStop">
                    <el-icon>
                      <Close />
                    </el-icon>
                    停止
                  </el-button>
                </div>
              </template>
              <div class="button-group-container">
                <el-button style="flex: 1;" :disabled="isRunningState && status !== 'paused'" @click="handleReset">
                  <el-icon>
                    <Refresh />
                  </el-icon>
                  重置数据
                </el-button>
              </div>
              <el-alert
                v-if="status === 'error' && lastError" title="任务出错" type="error" show-icon :closable="false"
                style="margin-top: 15px;"
              >
                <template #default>
                  <span>{{ lastError }}</span>
                </template>
              </el-alert>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：监控面板 -->
      <el-col :xs="24" :sm="24" :md="24" :lg="16">
        <el-card shadow="always" class="monitor-card full-height-card">
          <template #header>
            <span class="card-title">📊 实时监控</span>
          </template>

          <!-- 修改点：空闲状态增加 min-height 撑开高度 -->
          <div v-if="status === 'idle' && totalDownloaded === 0" class="empty-state">
            <el-empty description="点击左侧'开始消耗'按钮启动任务" :image-size="80" />
          </div>

          <!-- 修改点：运行状态增加 flex 布局以撑开高度 -->
          <div v-else class="stats-container">
            <!-- 当前 URL -->
            <div class="current-url-display">
              <span class="url-label">当前资源:</span>
              <el-tooltip :content="currentResourceUrl" placement="top" :disabled="currentResourceUrl.length < 50">
                <div class="url-text">
                  {{ currentResourceUrl }}
                </div>
              </el-tooltip>
              <el-button link type="primary" size="small" style="margin-left: 8px;" @click="copyUrl">
                复制
              </el-button>
            </div>

            <!-- 统计行 -->
            <el-row :gutter="16" class="stat-row">
              <el-col :xs="12" :sm="12" :md="12" :lg="6">
                <div class="stat-item">
                  <div class="stat-label">
                    已消耗流量
                  </div>
                  <div class="stat-value fixed-width-container">
                    {{ formatSize(totalDownloaded) }}
                    <span class="stat-suffix">/ {{
                      effectiveTargetGB === 'infinity' ? '∞' : `${effectiveTargetGB} GB`
                    }}</span>
                  </div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="12" :md="12" :lg="6">
                <div class="stat-item">
                  <div class="stat-label">
                    实时速度
                  </div>
                  <div class="stat-value fixed-width-container">
                    {{ formatSpeed(currentSpeed) }}
                    <span class="stat-suffix-small">{{ formatMbps(currentSpeed) }}</span>
                  </div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="12" :md="12" :lg="6">
                <div class="stat-item">
                  <div class="stat-label">
                    活跃线程
                  </div>
                  <div class="stat-value fixed-width-container">
                    {{ activeThreads }}
                  </div>
                </div>
              </el-col>
              <el-col :xs="12" :sm="12" :md="12" :lg="6">
                <div class="stat-item">
                  <div class="stat-label">
                    状态
                  </div>
                  <div class="stat-value">
                    <el-tag :type="statusTagType" effect="dark" size="default">
                      {{ statusText }}
                    </el-tag>
                  </div>
                </div>
              </el-col>
            </el-row>

            <!-- 【优化版】速率趋势图表区域 -->
            <div v-if="showChart && state.speedHistory && state.speedHistory.length > 0" class="chart-container">
              <div class="chart-header">
                <span class="chart-title">📈 实时速率趋势</span>
                <span class="chart-max">
                  峰值：<b>{{ formatSpeed(maxSpeed) }}</b>
                  <span v-if="hoverData" class="hover-info">
                    | 当前指向：{{ hoverData.speedStr }} ({{ hoverData.timeStr }})
                  </span>
                </span>
              </div>

              <div
                class="chart-body"
                @mouseenter="handleChartEnter"
                @mouseleave="handleChartLeave"
                @mousemove="handleChartMouseMove($event, state.speedHistory.length)"
              >
                <svg viewBox="0 0 100 50" class="sparkline" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#409EFF" stop-opacity="0.6" />
                      <stop offset="100%" stop-color="#409EFF" stop-opacity="0.05" />
                    </linearGradient>
                  </defs>

                  <!-- 填充区域 -->
                  <polygon
                    v-if="sparklinePoints"
                    :points="`0,50 ${sparklinePoints} 100,50`"
                    fill="url(#speedGradient)"
                  />

                  <!-- 折线 -->
                  <polyline
                    v-if="sparklinePoints"
                    :points="sparklinePoints"
                    fill="none"
                    stroke="#409EFF"
                    stroke-width="1.5"
                    vector-effect="non-scaling-stroke"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />

                  <!-- 【新增】悬停竖线 -->
                  <line
                    v-if="hoverIndex !== null"
                    :x1="(hoverIndex / (state.speedHistory.length - 1 || 1)) * 100"
                    y1="0"
                    :x2="(hoverIndex / (state.speedHistory.length - 1 || 1)) * 100"
                    y2="50"
                    stroke="#909399"
                    stroke-width="0.5"
                    stroke-dasharray="2,2"
                    vector-effect="non-scaling-stroke"
                  />

                  <!-- 【新增】悬停圆点 -->
                  <circle
                    v-if="hoverIndex !== null && sparklinePoints"
                    :cx="(hoverIndex / (state.speedHistory.length - 1 || 1)) * 100"
                    :cy="50 - ((state.speedHistory[hoverIndex].speed / maxSpeed) * 50)"
                    r="2"
                    fill="#fff"
                    stroke="#409EFF"
                    stroke-width="1.5"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>

                <!-- 【新增】自定义 Tooltip (跟随鼠标) -->
                <div
                  v-if="hoverData"
                  class="chart-tooltip"
                  :style="{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y - 60}px` }"
                >
                  <div class="tooltip-time">
                    {{ hoverData.timeStr }}
                  </div>
                  <div class="tooltip-speed">
                    {{ hoverData.speedStr }}
                  </div>
                  <div class="tooltip-mbps">
                    {{ formatMbps(hoverData.speed) }}
                  </div>
                </div>
              </div>

              <!-- 横坐标时间轴 (简化版：显示开始和结束时间) -->
              <div class="chart-axis">
                <span v-if="state.speedHistory.length > 1">
                  {{
                    new Date(state.speedHistory[0].time).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
                  }}
                </span>
                <span>
                  {{
                    new Date(state.speedHistory[state.speedHistory.length - 1].time).toLocaleTimeString([], {
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  }}
                </span>
              </div>
            </div>
            <!-- 时间信息行 -->
            <div class="time-info-row">
              <!-- 已耗时 (始终显示) -->
              <div class="time-item main-time">
                <el-icon>
                  <Timer />
                </el-icon>
                <span class="time-label">已耗时:</span>
                <span class="time-value tabular-nums">{{ elapsedTimeStr }}</span>
              </div>

              <!-- 分割线 -->
              <div v-if="effectiveTargetGB !== 'infinity'" class="time-divider" />

              <!-- 【修复】预计结束时间：统一显示，移除移动端重复块 -->
              <div v-if="effectiveTargetGB !== 'infinity' && status === 'running'" class="time-item">
                <el-icon>
                  <Clock />
                </el-icon>
                <span class="time-label">预计结束:</span>
                <span class="time-value tabular-nums">{{ estimatedEndTimeStr }}</span>
              </div>

              <!-- 无限模式标签 -->
              <div v-if="effectiveTargetGB === 'infinity'" class="time-item">
                <span class="infinity-symbol">∞</span>
                <span class="time-label">模式:</span>
                <el-tag type="warning" size="small" effect="plain">
                  无限运行
                </el-tag>
              </div>
            </div>

            <!-- 进度条 -->
            <div class="progress-section">
              <div class="progress-labels">
                <span>总进度</span>
                <span v-if="effectiveTargetGB === 'infinity'">∞ 运行中</span>
                <span v-else>{{ progressPercent.toFixed(2) }}%</span>
              </div>
              <el-progress
                :percentage="effectiveTargetGB === 'infinity' ? 100 : progressPercent"
                :stroke-width="24"
                :show-text="false"
                :color="customProgressColor"
                :status="status === 'error' ? 'exception' : (effectiveTargetGB === 'infinity' ? 'success' : undefined)"
                :indeterminate="effectiveTargetGB === 'infinity' && status === 'running'"
              />
            </div>

            <!-- 任务详情 -->
            <div class="log-section">
              <div class="detail-header">
                任务详情
              </div>
              <div class="fixed-grid-table">
                <div class="grid-row">
                  <div class="grid-label">
                    开始时间
                  </div>
                  <div class="grid-value">
                    <span class="tabular-nums">{{ startTimeStr }}</span>
                  </div>
                </div>
                <div class="grid-row">
                  <div class="grid-label">
                    平均速度
                  </div>
                  <div class="grid-value">
                    <span class="tabular-nums">{{ formatSize(avgSpeed) }}/s</span>
                  </div>
                </div>
                <div class="grid-row">
                  <div class="grid-label">
                    总请求数
                  </div>
                  <div class="grid-value">
                    <span class="tabular-nums">{{ requestCount }}</span>
                  </div>
                </div>
                <div class="grid-row">
                  <div class="grid-label">
                    错误次数
                  </div>
                  <div class="grid-value">
                    <span class="tabular-nums">{{ errorCount }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.tool-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 10px;
}

.page-header {
  margin-bottom: 20px;
  text-align: center;
}

.page-header h2 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #1f2937;
  font-size: 1.5rem;
}

.page-desc {
  color: #6b7280;
  margin-top: 5px;
  font-size: 0.9rem;
}

.example-banner {
  background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%);
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
}

.banner-content {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.banner-label {
  font-weight: 700;
  color: #0369a1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
}

.url-box {
  display: flex;
  align-items: center;
  background: #fff;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px dashed #0ea5e9;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  width: 100%;
}

.url-text {
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 0.8rem;
  color: #334155;
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
  flex: 1;
  min-width: 0;
}

.copy-btn {
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 0 8px;
}

.banner-tip {
  font-size: 0.75rem;
  color: #64748b;
  text-align: right;
  font-style: italic;
}

.card-title {
  font-weight: bold;
  font-size: 1.1rem;
}

.form-tip {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.custom-input-wrapper {
  margin-top: 10px;
  animation: slideDown 0.3s ease-out;
}

.action-area {
  margin-top: 20px;
}

.btn-row {
  display: flex;
  gap: 10px;
  width: 100%;
}

.button-group-container {
  display: flex;
  width: 100%;
  margin-top: 10px;
}

/* --- 核心修改开始：高度对齐逻辑 --- */

/* 1. 让 Row 在桌面端表现为 Flex 容器，使列等高 */
@media (min-width: 992px) {
  .height-equal-row {
    display: flex;
    align-items: stretch;
  }

  /* 确保 Card 填满列的高度 */
  .full-height-card {
    height: 100%;
    display: flex;
    flex-direction: column;

    :deep(.el-card__body) {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px;
    }
  }

  /* 2. 空闲状态：强制撑开高度 */
  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 450px; /* 根据左侧表单大概高度设定 */
    width: 100%;
  }

  /* 3. 运行状态：内容区域弹性拉伸 */
  .stats-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;

    /* 将底部的日志区域推到底部 */
    .log-section {
      margin-top: auto;
    }
  }
}

/* --- 核心修改结束 --- */

.empty-state {
  padding: 40px 0;
  text-align: center;
}

.stats-container {
  animation: fadeIn 0.3s ease-in-out;
}

.current-url-display {
  display: flex;
  align-items: center;
  background-color: #f5f7fa;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 16px;
  border: 1px solid #e4e7ed;

  .url-label {
    font-weight: bold;
    color: #606266;
    margin-right: 8px;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  .url-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #303133;
    font-family: monospace;
    font-size: 0.85rem;
  }
}

.stat-row {
  margin-bottom: 16px;
}

.stat-item {
  background: #f9fafb;
  padding: 10px 5px;
  border-radius: 6px;
  text-align: center;
  border: 1px solid #e5e7eb;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.stat-label {
  font-size: 0.8rem;
  color: #6b7280;
  margin-bottom: 6px;
  font-weight: 500;
  white-space: nowrap;
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  min-width: 12ch;
  display: inline-block;
  word-break: break-word;
}

.fixed-width-container {
  min-width: 14ch;
}

.stat-suffix {
  font-size: 0.7rem;
  color: #9ca3af;
  font-weight: normal;
  margin-left: 4px;
  white-space: nowrap;
}

.stat-suffix-small {
  display: block;
  font-size: 0.7rem;
  color: #10b981;
  font-weight: 600;
  margin-top: 2px;
  white-space: nowrap;
}

.time-info-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: linear-gradient(to right, #eff6ff, #f0f9ff);
  padding: 12px 16px;
  border-radius: 8px;
  margin: 24px 0;
  border: 1px solid #dbeafe;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  flex-wrap: wrap;
  gap: 10px;
  position: relative;
}

.time-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  color: #374151;
}

.time-item .el-icon {
  color: #409EFF;
  font-size: 1rem;
}

.time-label {
  font-weight: 600;
  color: #6b7280;
  white-space: nowrap;
}

.time-value {
  font-weight: 700;
  color: #1f2937;
  font-size: 1rem;
}

.infinity-symbol {
  font-size: 1.2rem;
  color: #E6A23C;
  font-weight: bold;
  line-height: 1;
  margin-right: 2px;
}

.time-divider {
  width: 1px;
  height: 20px;
  background-color: #cbd5e1;
  margin: 0 10px;
}

.progress-section {
  margin: 16px 0;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.85rem;
  color: #4b5563;
  font-weight: 500;
}

.log-section {
  margin-top: 20px;
}

.detail-header {
  font-size: 0.95rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 10px;
  padding-left: 4px;
  border-left: 4px solid #409EFF;
  line-height: 1.5;
}

.fixed-grid-table {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 8px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
}

.grid-row {
  display: contents;
}

.grid-label {
  font-size: 0.85rem;
  color: #6b7280;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  text-align: right;
  padding-right: 10px;
  border-right: 1px solid #f3f4f6;
  white-space: nowrap;
}

.grid-value {
  font-size: 0.9rem;
  color: #1f2937;
  font-weight: 700;
  display: flex;
  align-items: center;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  padding-left: 10px;
  word-break: break-all;
}

@media (max-width: 768px) {
  .tool-page {
    padding: 0 5px;
  }
  .page-header {
    margin-bottom: 15px;
  }
  .page-header h2 {
    font-size: 1.25rem;
  }

  .banner-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .url-box {
    width: 100%;
    box-sizing: border-box;
  }
  .banner-tip {
    text-align: left;
    width: 100%;
  }

  .monitor-card {
    margin-top: 15px !important;
  }

  .stat-row {
    gap: 10px !important;
    margin-bottom: 12px;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .stat-row > .el-col {
    width: 48% !important;
    max-width: 48% !important;
    flex: 0 0 48%;
  }

  .stat-item {
    padding: 8px 2px;
  }
  .stat-label {
    font-size: 0.75rem;
  }
  .stat-value {
    font-size: 0.95rem;
    min-width: 9ch;
  }
  .fixed-width-container {
    min-width: 10ch;
  }

  .time-info-row {
    flex-direction: row;
    flex-wrap: wrap;
    padding: 10px;
    margin: 16px 0;
    justify-content: flex-start;
  }
  .time-divider {
    display: none;
  }
  .time-item {
    width: 48%;
    font-size: 0.85rem;
    margin-bottom: 4px;
  }
  .main-time {
    width: 100%;
    margin-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
  }

  .fixed-grid-table {
    grid-template-columns: 70px 1fr;
    padding: 10px;
    gap: 6px 8px;
  }
  .grid-label {
    font-size: 0.8rem;
    padding-right: 6px;
  }
  .grid-value {
    font-size: 0.85rem;
    padding-left: 6px;
  }

  /* 手机端不需要强制等高，恢复自然流 */
  .empty-state {
    min-height: 200px;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
    max-height: 0;
  }
  to {
    opacity: 1;
    transform: translateY(0);
    max-height: 100px;
  }
}

/* 图表容器优化 */
.chart-container {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  position: relative; /* 为 tooltip 定位参考 */
  animation: fadeIn 0.3s ease-in-out;

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.85rem;
    flex-wrap: wrap;
    gap: 5px;

    .chart-title {
      font-weight: 600;
      color: #606266;
    }

    .chart-max {
      color: #909399;
      font-size: 0.8rem;

      b {
        color: #67C23A;
        font-weight: 700;
      }

      .hover-info {
        color: #409EFF;
        margin-left: 8px;
        font-weight: 600;
        animation: fadeIn 0.2s;
      }
    }
  }

  .chart-body {
    height: 70px; /* 稍微增高一点 */
    width: 100%;
    position: relative;
    cursor: crosshair; /* 鼠标变为十字准星 */

    .sparkline {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }
  }

  /* 横坐标轴 */
  .chart-axis {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-size: 0.7rem;
    color: #c0c4cc;
    padding: 0 2px;
  }

  /* 【新增】Tooltip 样式 */
  .chart-tooltip {
    position: fixed; /* 使用 fixed 防止溢出容器 */
    z-index: 9999;
    background: rgba(30, 30, 30, 0.95);
    color: #fff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    pointer-events: none; /* 鼠标穿透 */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(4px);
    transform: translateX(-50%); /* 居中 */
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.1);

    .tooltip-time {
      color: #a0cfff;
      font-size: 0.75rem;
      margin-bottom: 4px;
      text-align: center;
    }

    .tooltip-speed {
      font-weight: 700;
      font-size: 1rem;
      color: #67C23A;
      text-align: center;
    }

    .tooltip-mbps {
      font-size: 0.7rem;
      color: #ddd;
      text-align: center;
      margin-top: 2px;
      font-family: monospace;
    }
  }
}
</style>
