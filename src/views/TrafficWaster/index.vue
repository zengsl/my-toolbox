<!-- TrafficWaster/index.vue -->
<script setup lang="ts">
import type { InitialConfig } from './logic'
import {
  ArrowRight,
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
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { isKeepAliveActive, startKeepAlive, stopKeepAlive, updateKeepAliveStatus } from '@/utils/iosKeepAlive'
import { useTrafficWaster } from './logic'

interface UrlOption {
  label: string
  value: string
}

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
const isBannerExpanded = ref(false)

// --- 🚀 悬浮球逻辑 (核心功能) ---
const showFloatBall = ref(false)
const isFloatBallExpanded = ref(false)
const floatBallPos = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const floatBallRef = ref<HTMLElement | null>(null)
const waveOffset = ref(0) // 用于水波动画

// 核心计算属性：计算有效目标值
const effectiveTargetGB = computed(() => {
  const val = selectedTargetMode.value
  if (val === 'custom')
    return customTargetValue.value
  return val
})

// 初始化悬浮球位置
function initFloatBallPos() {
  const width = window.innerWidth
  const height = window.innerHeight
  // 默认位置：右侧，垂直居中偏上
  floatBallPos.value = {
    x: width - 70,
    y: height * 0.4,
  }
}

// 【新增】修正悬浮球位置，防止窗口缩放后溢出
function correctFloatBallPosition() {
  if (!floatBallRef.value)
    return

  const ballSize = isFloatBallExpanded.value ? 170 : 60 // 根据展开状态估算大小，或者统一按最大算
  const currentX = floatBallPos.value.x
  const currentY = floatBallPos.value.y
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  let newX = currentX
  let newY = currentY

  // 检查右边界 (如果球的最右侧超出了屏幕)
  // 注意：展开状态下球会变宽，这里保守估计留 180px 的余量
  const safeRightMargin = isFloatBallExpanded.value ? 180 : 70

  if (currentX + safeRightMargin > screenWidth) {
    newX = Math.max(10, screenWidth - safeRightMargin)
  }

  // 检查左边界
  if (currentX < 10) {
    newX = 10
  }

  // 检查下边界
  const safeBottomMargin = isFloatBallExpanded.value ? 200 : 70
  if (currentY + safeBottomMargin > screenHeight) {
    newY = Math.max(10, screenHeight - safeBottomMargin)
  }

  // 检查上边界
  if (currentY < 10) {
    newY = 10
  }

  // 只有位置发生变化时才更新，避免不必要的渲染
  if (newX !== currentX || newY !== currentY) {
    floatBallPos.value = { x: newX, y: newY }
  }
}

// 【关键】水位计算逻辑
const waterPercent = computed(() => {
  const target = effectiveTargetGB.value
  if (target === undefined || target === null)
    return 0

  // 无限模式：水位在 80% - 95% 之间波动，模拟满溢状态
  if (target === 'infinity') {
    const timeFactor = (Date.now() / 1000) % 4
    return 80 + Math.sin(timeFactor * Math.PI / 2) * 15
  }

  const numTarget = typeof target === 'number' ? target : 0
  const targetBytes = numTarget * 1024 * 1024 * 1024
  if (targetBytes === 0)
    return 0

  const percent = (totalDownloaded.value / targetBytes) * 100
  return Math.min(100, Math.max(0, percent))
})

// 拖拽开始
function handleStartDrag(event: MouseEvent | TouchEvent) {
  if (!floatBallRef.value)
    return
  isDragging.value = true
  // 如果正在展开状态，先收起，方便拖拽
  if (isFloatBallExpanded.value) {
    isFloatBallExpanded.value = false
  }

  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

  const rect = floatBallRef.value.getBoundingClientRect()
  dragOffset.value = {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

// 拖拽移动
function handleMoveDrag(event: MouseEvent | TouchEvent) {
  if (!isDragging.value)
    return
  event.preventDefault() // 防止滚动

  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

  const ballSize = 60
  const newX = clientX - dragOffset.value.x
  const newY = clientY - dragOffset.value.y

  const maxX = window.innerWidth - ballSize
  const maxY = window.innerHeight - ballSize

  floatBallPos.value.x = Math.max(0, Math.min(newX, maxX))
  floatBallPos.value.y = Math.max(0, Math.min(newY, maxY))
}

// 拖拽结束
function handleEndDrag() {
  isDragging.value = false
}

// 点击切换展开/收起
async function toggleFloatBall() {
  if (isDragging.value)
    return // 防止拖拽结束时误触点击

  if (!isFloatBallExpanded.value) {
    // 即将展开
    isFloatBallExpanded.value = true

    // 等待 DOM 更新后检查是否溢出屏幕
    await nextTick()
    if (floatBallRef.value) {
      const rect = floatBallRef.value.getBoundingClientRect()
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight

      // 右边界检查
      if (rect.right > screenWidth - 10) {
        const overflow = rect.right - screenWidth + 10
        floatBallPos.value.x = Math.max(10, floatBallPos.value.x - overflow)
      }
      // 左边界检查
      if (rect.left < 10) {
        floatBallPos.value.x = 10
      }
      // 下边界检查
      if (rect.bottom > screenHeight - 10) {
        const overflowBottom = rect.bottom - screenHeight + 10
        floatBallPos.value.y = Math.max(10, floatBallPos.value.y - overflowBottom)
      }
      // 上边界检查
      if (rect.top < 10) {
        floatBallPos.value.y = 10
      }
    }
  }
  else {
    isFloatBallExpanded.value = false
  }
}

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value) {
    isBannerExpanded.value = false
  }
  else {
    isBannerExpanded.value = true
  }
}

const isRunningState = computed(() => ['starting', 'running', 'paused'].includes(status.value))
const currentResourceUrl = computed(() => config.resourceUrlInput || '未选择')

const exampleUrl = computed(() => {
  const origin = window.location.origin
  const path = window.location.pathname
  let targetParam = '1'

  const t = effectiveTargetGB.value
  if (t === 'infinity')
    targetParam = 'infinity'
  else if (t === 'custom')
    targetParam = String(customTargetValue.value)
  else targetParam = String(t)

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

const hoverIndex = ref<number | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })
const isChartHovered = ref(false)
const showChart = ref(true)

function handleChartMouseMove(event: MouseEvent, dataLength: number) {
  if (!dataLength)
    return
  const rect = (event.target as HTMLElement).getBoundingClientRect()
  const x = event.clientX - rect.left
  const width = rect.width
  const index = Math.min(dataLength - 1, Math.max(0, Math.floor((x / width) * dataLength)))
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

const maxSpeed = computed(() => {
  if (!showChart.value || !state.speedHistory || state.speedHistory.length === 0)
    return 0
  const max = Math.max(...state.speedHistory.map(d => d?.speed || 0))
  return max > 0 ? max : 1000
})

const sparklinePoints = computed(() => {
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

const displayTarget = computed(() => {
  const t = effectiveTargetGB.value
  if (t === 'infinity')
    return '∞'
  if (t === 'custom')
    return `${customTargetValue.value} GB`
  return `${t} GB`
})

async function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch (err) {
      return fallbackCopyText(text)
    }
  }
  else {
    return fallbackCopyText(text)
  }
}

function fallbackCopyText(text: string) {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.left = '-999999px'
    textarea.style.top = '-999999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)
    return successful
  }
  catch (err) {
    return false
  }
}

async function copyExampleUrl() {
  const success = await copyToClipboard(exampleUrl.value)
  if (success)
    ElMessage.success('复制成功')
  else ElMessage.warning('复制失败，请手动复制')
}

let waveTimer: number | null = null

onMounted(() => {
  checkMobile()
  initFloatBallPos()

  window.addEventListener('resize', () => {
    checkMobile()
    // 窗口大小改变时，立即检查并修正悬浮球位置
    correctFloatBallPosition()
  })
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // 全局拖拽监听
  document.addEventListener('mousemove', handleMoveDrag)
  document.addEventListener('mouseup', handleEndDrag)
  document.addEventListener('touchmove', handleMoveDrag, { passive: false })
  document.addEventListener('touchend', handleEndDrag)

  // 水波动画定时器
  waveTimer = window.setInterval(() => {
    waveOffset.value += 0.05
  }, 50)

  // 订阅状态变化
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

    if (isIOSBackgroundEnabled.value) {
      const isRunning = newState.status === 'running'
      updateKeepAliveStatus(newState.currentSpeed, newState.totalDownloaded, isRunning)
    }

    // 【关键】根据状态控制悬浮球显示
    if (['running', 'paused', 'starting'].includes(newState.status)) {
      showFloatBall.value = true
    }
    else {
      // 延迟隐藏，避免闪烁
      setTimeout(() => {
        if (['idle', 'stopped', 'finished', 'error'].includes(status.value)) {
          showFloatBall.value = false
          isFloatBallExpanded.value = false
        }
      }, 2000)
    }
  })

  timerInterval = window.setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)

  if (initBackground)
    toggleIOSBackground(true)
  if (initAutoStart)
    setTimeout(handleStart, 500)
})

onUnmounted(() => {
  if (unsubscribe)
    unsubscribe()
  if (timerInterval)
    clearInterval(timerInterval)
  if (waveTimer)
    clearInterval(waveTimer)
  stop()
  stopKeepAlive()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('resize', checkMobile)
  document.removeEventListener('mousemove', handleMoveDrag)
  document.removeEventListener('mouseup', handleEndDrag)
  document.removeEventListener('touchmove', handleMoveDrag)
  document.removeEventListener('touchend', handleEndDrag)
})

const formatMbps = (b: number) => b <= 0 ? '0 Mbps' : `${((b * 8) / (1024 * 1024)).toFixed(2)} Mbps`
const formatSpeed = (b: number) => `${formatSize(b)}/s`

const elapsedTimeStr = computed(() => {
  if (!state.startTime)
    return '00:00:00'
  const isFinishedState = ['finished', 'stopped', 'error'].includes(status.value)
  let endTime = currentTime.value
  if (isFinishedState && state.lastCheckTime) {
    endTime = state.lastCheckTime
  }
  else if (isFinishedState && !state.lastCheckTime) {
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

function toggleIOSBackground(enabled?: boolean) {
  const shouldEnable = enabled !== undefined ? enabled : isIOSBackgroundEnabled.value
  if (!shouldEnable) {
    stopKeepAlive()
    return
  }
  try {
    startKeepAlive({
      volume: 0.05,
      targetGB: effectiveTargetGB.value,
      onPlay: () => {
        if (['paused', 'idle'].includes(status.value))
          handleStart()
      },
      onPause: () => {
        if (status.value === 'running')
          handlePauseToggle()
      },
    })
  }
  catch (e: any) {
    ElMessage.warning('启动失败，请点击页面后再试')
    isIOSBackgroundEnabled.value = false
  }
}

function handleTargetModeChange(v: any) {
  selectedTargetMode.value = v
  updateConfig('targetGB', v === 'custom' ? customTargetValue.value : v)
}

const handleCustomTargetChange = (v: number | undefined) => updateConfig('targetGB', v)

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
  if (progressPercent.value === 100) {
    ElMessage.warning('任务已完成，无需重复执行')
    return
  }

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

function handleVisibilityChange() {
  if (!document.hidden) {
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
        <el-icon><Wallet /></el-icon>
        流量消耗器
      </h2>
      <p class="page-desc">
        通过不断下载资源来测试或消耗网络流量
      </p>
    </div>

    <!-- 示例链接展示区 -->
    <div class="example-banner">
      <div v-if="!isMobile" class="banner-content-desktop">
        <span class="banner-label">
          <el-icon><Connection /></el-icon>
          <strong>快速启动示例：</strong>
        </span>
        <div class="url-box">
          <code class="url-text">{{ exampleUrl }}</code>
          <el-button type="primary" link class="copy-btn" @click="copyExampleUrl">
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </div>
        <div class="banner-tip">
          提示：链接已同步当前配置 (目标：{{ displayTarget }}, 线程：{{ config.threads }})。
        </div>
      </div>

      <div v-else class="banner-content-mobile">
        <div class="mobile-trigger" @click="isBannerExpanded = !isBannerExpanded">
          <div class="trigger-left">
            <el-icon class="trigger-icon">
              <Connection />
            </el-icon>
            <span class="trigger-text"><strong>快速启动示例</strong></span>
          </div>
          <div class="trigger-right">
            <el-icon class="arrow-icon" :class="{ 'is-expanded': isBannerExpanded }">
              <ArrowRight />
            </el-icon>
          </div>
        </div>

        <transition name="slide-fade">
          <div v-show="isBannerExpanded" class="mobile-detail-content">
            <div class="url-box-mobile" style="width: 100%; box-sizing: border-box;">
              <code class="url-text-full">{{ exampleUrl }}</code>
              <el-button type="primary" size="small" style="margin-top: 8px; width: 100%;" @click="copyExampleUrl">
                <el-icon><CopyDocument /></el-icon>
                复制链接
              </el-button>
            </div>
            <div class="banner-tip-mobile">
              目标：{{ displayTarget }} | 线程：{{ config.threads }}
            </div>
          </div>
        </transition>
      </div>
    </div>

    <el-row :gutter="20" class="height-equal-row">
      <el-col :xs="24" :sm="24" :md="24" :lg="8">
        <el-card shadow="always" class="config-card full-height-card">
          <template #header>
            <span class="card-title">⚙️ 配置设置</span>
          </template>
          <el-form label-position="top" :size="isMobile ? 'default' : 'large'" class="compact-form">
            <el-form-item label="目标流量">
              <el-select v-model="selectedTargetMode" style="width: 100%" :disabled="isRunningState" @change="handleTargetModeChange">
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
                <el-input-number v-model.number="customTargetValue" :min="0.1" :max="10000" :step="0.1" style="width: 100%" @change="handleCustomTargetChange">
                  <template #suffix>
                    GB
                  </template>
                </el-input-number>
              </div>
              <div v-else-if="selectedTargetMode === 'infinity'" class="form-tip" style="color: #E6A23C; margin-top: 5px;">
                <el-icon><Warning /></el-icon>
                任务将一直运行，直到您点击“停止”。
              </div>
            </el-form-item>
            <el-form-item label="并发线程数">
              <el-input-number v-model.number="config.threads" :min="1" :max="50" style="width: 100%" :disabled="isRunningState" @change="updateConfig('threads', config.threads)" />
            </el-form-item>
            <el-form-item label="资源 URL">
              <el-select v-model="selectedUrlMode" style="width: 100%" :disabled="isRunningState" @change="handleUrlModeChange">
                <el-option v-for="item in urlOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <div v-if="selectedUrlMode === 'custom'" class="custom-input-wrapper">
                <el-input v-model="config.customUrlInput" placeholder="请输入网址" clearable @input="handleCustomUrlInput">
                  <template #prefix>
                    <el-icon><Link /></el-icon>
                  </template>
                </el-input>
              </div>
            </el-form-item>
            <el-form-item label="iOS 后台保活" class="ios-keepalive-item">
              <div class="ios-bg-container">
                <div class="ios-bg-switch">
                  <el-switch v-model="isIOSBackgroundEnabled" inline-prompt active-text="开" inactive-text="关" style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949" @change="toggleIOSBackground" />
                </div>
                <div class="ios-bg-desc">
                  <el-icon><Cellphone /></el-icon>
                  <span>锁屏/灵动岛显示速度</span>
                </div>
              </div>
            </el-form-item>
            <div class="action-area">
              <el-button v-if="status === 'idle' || status === 'stopped' || status === 'finished' || status === 'error'" type="primary" :size="isMobile ? 'default' : 'large'" :loading="status === 'starting'" style="width: 100%" @click="handleStart">
                <el-icon><VideoPlay /></el-icon>
                开始消耗
              </el-button>
              <template v-else-if="status === 'running' || status === 'paused'">
                <div class="btn-row">
                  <el-button :type="status === 'running' ? 'warning' : 'success'" :size="isMobile ? 'default' : 'large'" style="flex: 1;" @click="handlePauseToggle">
                    <el-icon><VideoPause v-if="status === 'running'" /><VideoPlay v-else /></el-icon>
                    {{ status === 'running' ? '暂停' : '继续' }}
                  </el-button>
                  <el-button type="danger" :size="isMobile ? 'default' : 'large'" style="flex: 1; margin-left: 10px;" @click="handleStop">
                    <el-icon><Close /></el-icon>
                    停止
                  </el-button>
                </div>
              </template>
              <div class="button-group-container">
                <el-button style="flex: 1;" :size="isMobile ? 'default' : 'large'" :disabled="isRunningState && status !== 'paused'" @click="handleReset">
                  <el-icon><Refresh /></el-icon>
                  重置数据
                </el-button>
              </div>
              <el-alert v-if="status === 'error' && lastError" title="任务出错" type="error" show-icon :closable="false" style="margin-top: 15px;">
                <template #default>
                  <span>{{ lastError }}</span>
                </template>
              </el-alert>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="24" :lg="16">
        <el-card shadow="always" class="monitor-card full-height-card">
          <template #header>
            <span class="card-title">📊 实时监控</span>
          </template>
          <div v-if="status === 'idle' && totalDownloaded === 0" class="empty-state">
            <el-empty description="点击左侧'开始消耗'按钮启动任务" :image-size="80" />
          </div>
          <div v-else class="stats-container">
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
            <el-row :gutter="16" class="stat-row">
              <el-col :xs="12" :sm="12" :md="12" :lg="6">
                <div class="stat-item">
                  <div class="stat-label">
                    已消耗流量
                  </div>
                  <div class="stat-value fixed-width-container">
                    {{ formatSize(totalDownloaded) }}
                    <span class="stat-suffix">/ {{ effectiveTargetGB === 'infinity' ? '∞' : `${effectiveTargetGB} GB` }}</span>
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
            <div v-if="showChart && state.speedHistory && state.speedHistory.length > 0" class="chart-container">
              <div class="chart-header">
                <span class="chart-title">📈 实时速率趋势</span>
              </div>
              <div class="chart-body">
                <svg viewBox="0 0 100 50" class="sparkline" preserveAspectRatio="none"><polyline v-if="sparklinePoints" :points="sparklinePoints" fill="none" stroke="#409EFF" stroke-width="1.5" /></svg>
              </div>
            </div>
            <div class="time-info-row">
              <div class="time-item main-time">
                <el-icon><Timer /></el-icon>
                <span class="time-label">已耗时:</span>
                <span class="time-value tabular-nums">{{ elapsedTimeStr }}</span>
              </div>
              <div v-if="effectiveTargetGB !== 'infinity'" class="time-divider" />
              <div v-if="effectiveTargetGB !== 'infinity' && status === 'running'" class="time-item">
                <el-icon><Clock /></el-icon>
                <span class="time-label">预计结束:</span>
                <span class="time-value tabular-nums">{{ estimatedEndTimeStr }}</span>
              </div>
              <div v-if="effectiveTargetGB === 'infinity'" class="time-item">
                <span class="infinity-symbol">∞</span>
                <span class="time-label">模式:</span>
                <el-tag type="warning" size="small" effect="plain">
                  无限运行
                </el-tag>
              </div>
            </div>
            <div class="progress-section">
              <div class="progress-labels">
                <span>总进度</span>
                <span v-if="effectiveTargetGB === 'infinity'">∞ 运行中</span>
                <span v-else>{{ progressPercent.toFixed(2) }}%</span>
              </div>
              <el-progress :percentage="effectiveTargetGB === 'infinity' ? 100 : progressPercent" :stroke-width="24" :show-text="false" :color="customProgressColor" :indeterminate="effectiveTargetGB === 'infinity' && status === 'running'" />
            </div>
            <div class="log-section">
              <div class="detail-header">
                任务详情
              </div>
              <div class="fixed-grid-table">
                <div class="grid-row">
                  <div class="grid-label">
                    开始时间
                  </div><div class="grid-value">
                    <span class="tabular-nums">{{ startTimeStr }}</span>
                  </div>
                </div>
                <div class="grid-row">
                  <div class="grid-label">
                    平均速度
                  </div><div class="grid-value">
                    <span class="tabular-nums">{{ formatSize(avgSpeed) }}/s</span>
                  </div>
                </div>
                <div class="grid-row">
                  <div class="grid-label">
                    总请求数
                  </div><div class="grid-value">
                    <span class="tabular-nums">{{ requestCount }}</span>
                  </div>
                </div>
                <div class="grid-row">
                  <div class="grid-label">
                    错误次数
                  </div><div class="grid-value">
                    <span class="tabular-nums">{{ errorCount }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 🚀 悬浮球组件 (核心视觉实现) -->
    <transition name="float-ball-fade">
      <div
        v-show="showFloatBall"
        ref="floatBallRef"
        class="float-ball"
        :class="{ 'is-expanded': isFloatBallExpanded, 'is-dragging': isDragging }"
        :style="{ left: `${floatBallPos.x}px`, top: `${floatBallPos.y}px` }"
        @mousedown="handleStartDrag"
        @touchstart="handleStartDrag"
        @click="toggleFloatBall"
      >
        <!-- 水位容器 -->
        <div class="water-container" :style="{ height: `${waterPercent}%` }">
          <svg class="wave-svg" viewBox="0 0 800 200" preserveAspectRatio="none">
            <!-- 前层波浪 -->
            <path
              class="wave-path"
              :d="`M0,100 C200,${100 + Math.sin(waveOffset) * 30} 400,${100 - Math.sin(waveOffset) * 30} 600,100 C800,100 800,200 0,200 Z`"
              fill="rgba(74, 222, 128, 0.6)"
            />
            <!-- 后层波浪 (视差效果) -->
            <path
              class="wave-path wave-back"
              :d="`M0,100 C200,${100 + Math.sin(waveOffset + 1) * 20} 400,${100 - Math.sin(waveOffset + 1) * 20} 600,100 C800,100 800,200 0,200 Z`"
              fill="rgba(74, 222, 128, 0.4)"
            />
          </svg>
        </div>

        <!-- 内容区域 -->
        <div class="ball-content">
          <!-- 收起状态：只显示速度和迷你百分比 -->
          <div v-if="!isFloatBallExpanded" class="ball-compact">
            <span class="ball-speed">{{ formatSpeed(currentSpeed) }}</span>
            <span v-if="effectiveTargetGB !== 'infinity'" class="ball-percent-mini">{{ waterPercent.toFixed(0) }}%</span>
          </div>

          <!-- 展开状态：显示详细信息 -->
          <div v-else class="ball-expanded">
            <div class="exp-row">
              <span class="exp-label">速度:</span>
              <span class="exp-value highlight">{{ formatSpeed(currentSpeed) }}</span>
            </div>
            <div class="exp-row">
              <span class="exp-label">已下载:</span>
              <span class="exp-value">{{ formatSize(totalDownloaded) }}</span>
            </div>
            <div class="exp-row">
              <span class="exp-label">目标:</span>
              <span class="exp-value">{{ effectiveTargetGB === 'infinity' ? '∞' : `${effectiveTargetGB} GB` }}</span>
            </div>
            <div class="exp-row">
              <span class="exp-label">耗时:</span>
              <span class="exp-value">{{ elapsedTimeStr }}</span>
            </div>
            <div class="exp-hint">
              拖动移动 / 点击收起
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
/* ... (保持之前的样式不变，仅确保没有隐藏悬浮球的媒体查询) ... */
.tool-page { max-width: 1200px; margin: 0 auto; padding: 0 10px; }
.page-header { margin-bottom: 20px; text-align: center; }
.page-header h2 { display: flex; align-items: center; justify-content: center; gap: 10px; color: #1f2937; font-size: 1.5rem; }
.page-desc { color: #6b7280; margin-top: 5px; font-size: 0.9rem; }
.example-banner { background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%); border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px; margin-top: 0; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1); overflow: hidden; width: 100%; box-sizing: border-box; }
.banner-content-desktop { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.banner-label { font-weight: 700; color: #0369a1; display: flex; align-items: center; gap: 6px; font-size: 0.9rem; }
.url-box { display: flex; align-items: center; background: #fff; padding: 4px 10px; border-radius: 6px; border: 1px dashed #0ea5e9; width: 100%; box-sizing: border-box; }
.url-text { font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 0.8rem; color: #334155; word-break: break-all; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 8px; flex: 1; min-width: 0; }
.copy-btn { font-weight: 600; white-space: nowrap; flex-shrink: 0; padding: 0 8px; }
.banner-tip { font-size: 0.75rem; color: #64748b; text-align: right; font-style: italic; }
.banner-content-mobile { display: flex; flex-direction: column; width: 100%; }
.mobile-trigger { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; width: 100%; line-height: 1.2; }
.trigger-left { display: flex; align-items: center; gap: 6px; }
.trigger-icon { color: #0369a1; font-size: 1rem; flex-shrink: 0; }
.trigger-text { font-size: 0.85rem; color: #0f172a; font-weight: 600; line-height: 1.2; }
.trigger-right { flex-shrink: 0; }
.arrow-icon { color: #94a3b8; transition: transform 0.3s ease; font-size: 0.9rem; &.is-expanded { transform: rotate(90deg); color: #0369a1; } }
.mobile-detail-content { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #bae6fd; width: 100%; box-sizing: border-box; overflow: hidden; }
.url-box-mobile { background: #fff; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px; width: 100% !important; max-width: 100% !important; box-sizing: border-box; overflow: hidden; }
.url-text-full { font-family: 'Menlo', 'Monaco', 'Courier New', monospace; font-size: 0.75rem; color: #334155; word-break: break-all; line-height: 1.3; width: 100%; box-sizing: border-box; }
.banner-tip-mobile { font-size: 0.7rem; color: #64748b; margin-top: 4px; text-align: left; width: 100%; }
.compact-form { :deep(.el-form-item) { margin-bottom: 14px; } :deep(.el-form-item__label) { font-weight: 600; margin-bottom: 6px; } }
.card-title { font-weight: bold; font-size: 1.1rem; }
.form-tip { font-size: 0.8rem; color: #9ca3af; margin-top: 4px; display: flex; align-items: center; gap: 5px; }
.custom-input-wrapper { margin-top: 10px; animation: slideDown 0.3s ease-out; }
.action-area { margin-top: 20px; }
.btn-row { display: flex; gap: 10px; width: 100%; }
.button-group-container { display: flex; width: 100%; margin-top: 10px; }
.ios-keepalive-item { margin-bottom: 10px; :deep(.el-form-item__label) { margin-bottom: 4px; font-weight: 600; } }
.ios-bg-container { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #f9fafb; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; .ios-bg-switch { flex-shrink: 0; } .ios-bg-desc { flex: 1; display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #4b5563; line-height: 1.4; .el-icon { color: #13ce66; font-size: 1rem; } } }
@media (min-width: 992px) { .height-equal-row { display: flex; align-items: stretch; } .full-height-card { height: 100%; display: flex; flex-direction: column; :deep(.el-card__body) { flex: 1; display: flex; flex-direction: column; padding: 20px; } } .empty-state { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 450px; width: 100%; } .stats-container { flex: 1; display: flex; flex-direction: column; width: 100%; .log-section { margin-top: auto; } } }
.empty-state { padding: 40px 0; text-align: center; }
.stats-container { animation: fadeIn 0.3s ease-in-out; }
.current-url-display { display: flex; align-items: center; background-color: #f5f7fa; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; border: 1px solid #e4e7ed; .url-label { font-weight: bold; color: #606266; margin-right: 8px; white-space: nowrap; font-size: 0.9rem; } .url-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #303133; font-family: monospace; font-size: 0.85rem; } }
.stat-row { margin-bottom: 16px; }
.stat-item { background: #f9fafb; padding: 10px 5px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb; height: 100%; display: flex; flex-direction: column; justify-content: center; min-width: 0; width: 100%; box-sizing: border-box; }
.stat-label { font-size: 0.8rem; color: #6b7280; margin-bottom: 6px; font-weight: 500; white-space: nowrap; }
.stat-value { font-size: 1.1rem; font-weight: 700; color: #1f2937; line-height: 1.4; font-variant-numeric: tabular-nums; min-width: 12ch; display: inline-block; word-break: break-word; }
.fixed-width-container { min-width: 14ch; }
.stat-suffix { font-size: 0.7rem; color: #9ca3af; font-weight: normal; margin-left: 4px; white-space: nowrap; }
.stat-suffix-small { display: block; font-size: 0.7rem; color: #10b981; font-weight: 600; margin-top: 2px; white-space: nowrap; }
.time-info-row { display: flex; justify-content: space-around; align-items: center; background: linear-gradient(to right, #eff6ff, #f0f9ff); padding: 12px 16px; border-radius: 8px; margin: 24px 0; border: 1px solid #dbeafe; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02); flex-wrap: wrap; gap: 10px; position: relative; }
.time-item { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; color: #374151; }
.time-item .el-icon { color: #409EFF; font-size: 1rem; }
.time-label { font-weight: 600; color: #6b7280; white-space: nowrap; }
.time-value { font-weight: 700; color: #1f2937; font-size: 1rem; }
.infinity-symbol { font-size: 1.2rem; color: #E6A23C; font-weight: bold; line-height: 1; margin-right: 2px; }
.time-divider { width: 1px; height: 20px; background-color: #cbd5e1; margin: 0 10px; }
.progress-section { margin: 16px 0; }
.progress-labels { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.85rem; color: #4b5563; font-weight: 500; }
.log-section { margin-top: 20px; }
.detail-header { font-size: 0.95rem; font-weight: 600; color: #374151; margin-bottom: 10px; padding-left: 4px; border-left: 4px solid #409EFF; line-height: 1.5; }
.fixed-grid-table { display: grid; grid-template-columns: 90px 1fr; gap: 8px 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
.grid-row { display: contents; }
.grid-label { font-size: 0.85rem; color: #6b7280; font-weight: 600; display: flex; align-items: center; justify-content: flex-end; text-align: right; padding-right: 10px; border-right: 1px solid #f3f4f6; white-space: nowrap; }
.grid-value { font-size: 0.9rem; color: #1f2937; font-weight: 700; display: flex; align-items: center; min-width: 0; font-variant-numeric: tabular-nums; padding-left: 10px; word-break: break-all; }

/* 移动端适配 */
@media (max-width: 768px) {
  .page-header { display: none !important; }
  .tool-page { padding: 0 8px; }
  .compact-form { :deep(.el-form-item) { margin-bottom: 10px !important; } :deep(.el-form-item__label) { font-size: 0.85rem; margin-bottom: 4px !important; line-height: 1.2; } :deep(.el-input__wrapper), :deep(.el-select .el-input__wrapper), :deep(.el-input-number .el-input__wrapper) { padding: 0 10px; height: 36px; } :deep(.el-input__inner) { font-size: 0.9rem; } :deep(.el-select .el-input__inner) { height: 36px; line-height: 36px; } :deep(.el-button) { height: 36px; padding: 0 12px; font-size: 0.9rem; } :deep(.el-switch) { transform: scale(0.9); transform-origin: left center; } }
  :deep(.el-card__body) { padding: 12px !important; }
  .card-title { font-size: 1rem; }
  .example-banner { padding: 8px 12px; margin-bottom: 12px; }
  .monitor-card { margin-top: 12px !important; }
  .stat-row { gap: 8px !important; margin-bottom: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; }
  .stat-row > .el-col { width: 48% !important; max-width: 48% !important; flex: 0 0 48%; }
  .stat-item { padding: 6px 2px; }
  .stat-label { font-size: 0.7rem; margin-bottom: 4px; }
  .stat-value { font-size: 0.9rem; min-width: 8ch; }
  .fixed-width-container { min-width: 9ch; }
  .time-info-row { flex-direction: row; flex-wrap: wrap; padding: 8px 10px; margin: 12px 0; justify-content: flex-start; gap: 8px; }
  .time-divider { display: none; }
  .time-item { width: 48%; font-size: 0.8rem; margin-bottom: 4px; }
  .main-time { width: 100%; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .fixed-grid-table { grid-template-columns: 65px 1fr; padding: 8px; gap: 4px 8px; }
  .grid-label { font-size: 0.75rem; padding-right: 4px; }
  .grid-value { font-size: 0.8rem; padding-left: 4px; }
  .empty-state { min-height: 150px; }
  .empty-state :deep(.el-empty__description) { font-size: 0.8rem; }
  .ios-bg-container { padding: 6px 8px; .ios-bg-desc { font-size: 0.75rem; span { max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } } }
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); max-height: 0; } to { opacity: 1; transform: translateY(0); max-height: 500px; } }
.slide-fade-enter-active, .slide-fade-leave-active { transition: all 0.3s ease; max-height: 500px; opacity: 1; overflow: hidden; }
.slide-fade-enter-from, .slide-fade-leave-to { max-height: 0; opacity: 0; }
.chart-container { background: #fff; border: 1px solid #e4e7ed; border-radius: 6px; padding: 12px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02); position: relative; animation: fadeIn 0.3s ease-in-out; .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 0.85rem; flex-wrap: wrap; gap: 5px; .chart-title { font-weight: 600; color: #606266; } } .chart-body { height: 70px; width: 100%; position: relative; cursor: crosshair; .sparkline { width: 100%; height: 100%; display: block; overflow: visible; } } }

/* --- 悬浮球样式 (核心视觉实现) --- */
.float-ball {
  position: fixed;
  z-index: 9999;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
  cursor: grab;
  user-select: none;
  touch-action: none;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
  height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
  border-radius 0.3s,
  transform 0.2s,
  background 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;

  &:active { cursor: grabbing; }
  &.is-dragging { opacity: 0.9; transform: scale(1.05); transition: none; }

  /* 水位容器 */
  .water-container {
    position: absolute;
    bottom: 0; left: 0; width: 100%; height: 0%;
    transition: height 0.5s ease-out;
    z-index: 0; pointer-events: none;

    .wave-svg {
      position: absolute; top: -50%; left: 0; width: 200%; height: 200%;

      .wave-path {
        transition: d 0.1s linear;
      }
      .wave-back {
        opacity: 0.5;
        transform: translateX(-20px);
      }
    }
  }

  .ball-content {
    position: relative; z-index: 1; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.3s;
  }

  /* 收起状态样式 */
  .ball-compact {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; width: 100%;

    .ball-speed {
      font-family: 'Menlo', monospace; font-size: 0.75rem; font-weight: 700;
      color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      line-height: 1.2; max-width: 90%; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .ball-percent-mini {
      font-size: 0.6rem; color: rgba(255, 255, 255, 0.8);
      margin-top: 2px; font-weight: 600;
    }
  }

  /* 展开状态样式 */
  &.is-expanded {
    width: 170px;
    height: auto;
    min-height: 160px;
    border-radius: 16px;
    padding: 12px;
    align-items: flex-start;
    justify-content: flex-start;
    background: rgba(15, 23, 42, 0.85);
    cursor: default;

    .ball-compact { display: none; }

    .ball-expanded {
      display: flex; flex-direction: column; gap: 6px; width: 100%;

      .exp-row {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 0.75rem;

        .exp-label { color: #94a3b8; margin-right: 8px; white-space: nowrap; }
        .exp-value {
          font-family: 'Menlo', monospace; color: #fff; text-align: right;
          word-break: break-all;

          &.highlight { color: #4ade80; font-weight: 700; font-size: 0.85rem; }
        }
      }
      .exp-hint {
        margin-top: 8px; font-size: 0.65rem; color: #64748b;
        text-align: center; width: 100%;
        border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px;
      }
    }
  }
}

.float-ball-fade-enter-active, .float-ball-fade-leave-active { transition: opacity 0.3s, transform 0.3s; }
.float-ball-fade-enter-from, .float-ball-fade-leave-to { opacity: 0; transform: scale(0.5); }
</style>
