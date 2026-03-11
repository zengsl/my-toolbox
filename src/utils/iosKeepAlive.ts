// src/utils/iosKeepAlive.ts

const AUDIO_ID = 'ios-bg-keepalive-audio1'
const DEFAULT_AUDIO_SRC = '/sounds/silent_loop.mp3'

// --- 配置常量 ---
const KEEP_ALIVE_HEARTBEAT_INTERVAL = 3000
const VOLUME_ACTIVE = 0.05
const MIN_VOLUME_TO_KEEP_ALIVE = 0.01
const STARTUP_STABILIZATION_DELAY = 800
const STARTUP_FORCE_REFRESH_COUNT = 5

// --- 新增：防死循环配置 ---
const MAX_CONSECUTIVE_ERRORS = 3 // 最大连续错误次数
const MAX_ERRORS_IN_TIME_WINDOW = 5 // 时间窗口内最大错误次数
const ERROR_TIME_WINDOW_MS = 10000 // 时间窗口 (10 秒)
const BASE_RETRY_DELAY_MS = 1000 // 基础重试延迟
const MAX_RETRY_DELAY_MS = 10000 // 最大重试延迟

// --- 全局状态 ---
let STATIC_COVER_DATA_URI: string | null = null
let heartbeatTimer: number | null = null
let startupStabilizerTimer: number | null = null
let audioCtx: AudioContext | null = null
let noiseSource: AudioBufferSourceNode | null = null
let gainNode: GainNode | null = null
let mediaElementSource: MediaElementAudioSourceNode | null = null

// 解锁相关
let isAudioContextUnlocked = false
const playQueue: (() => void)[] = []

// 防抖标记
let isStartupPhase = false
let startupRefreshCount = 0
let volumeToggleState = 0

// --- 新增：错误控制状态 ---
let errorRetryCount = 0
let lastErrorTime = 0
let errorTimer: number | null = null
let isFatalError = false // 标记是否发生致命错误，停止所有自动重试

export interface KeepAliveOptions {
  volume?: number
  audioSrc?: string
  onPlay?: () => void
  onPause?: () => void
  targetGB?: number | 'infinity'
}

interface KeepAliveState {
  audio: HTMLAudioElement | null
  isPlaying: boolean
  isAudioMuted: boolean
  targetGB: number | 'infinity'
  lastSpeedStr: string
  lastTotalStr: string
  lastTotalBytes: number
}

const state: KeepAliveState = {
  audio: null,
  isPlaying: false,
  isAudioMuted: false,
  targetGB: 'infinity',
  lastSpeedStr: '',
  lastTotalStr: '',
  lastTotalBytes: 0,
}

function log(...args: any[]) {
  console.log('[KeepAlive]', ...args)
}

function formatSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

function generateStaticCover(): string {
  if (STATIC_COVER_DATA_URI)
    return STATIC_COVER_DATA_URI
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return ''

  ctx.fillStyle = '#007AFF'
  ctx.fillRect(0, 0, 512, 512)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 40
  ctx.beginPath()
  ctx.arc(256, 230, 120, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = 'bold 50px San Francisco, Arial'
  ctx.fillText('DATA BURNER', 256, 460)

  STATIC_COVER_DATA_URI = canvas.toDataURL('image/png')
  return STATIC_COVER_DATA_URI
}

function createInvisibleNoise(audioEl: HTMLAudioElement) {
  if (!audioCtx) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass)
      return
    audioCtx = new AudioContextClass()
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }

  try {
    if (!mediaElementSource) {
      mediaElementSource = audioCtx.createMediaElementSource(audioEl)
    }

    const bufferSize = audioCtx.sampleRate * 1
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.002
    }

    if (noiseSource) {
      try { noiseSource.stop() }
      catch (e) {}
    }
    noiseSource = audioCtx.createBufferSource()
    noiseSource.buffer = buffer
    noiseSource.loop = true

    if (!gainNode) {
      gainNode = audioCtx.createGain()
    }
    gainNode.gain.value = 0.05

    noiseSource.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    noiseSource.start(0)

    log('🌊 已注入微噪保活流')
  }
  catch (e) {
    log('⚠️ 注入微噪失败', e)
  }
}

function setupGlobalUnlock() {
  if (typeof window === 'undefined')
    return
  if ((window as any)._kaUnlockBound)
    return
  (window as any)._kaUnlockBound = true

  const unlock = async () => {
    if (isAudioContextUnlocked)
      return
    if (!state.audio)
      return

    log('👆 用户交互 detected，尝试解锁...')

    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }

    const originalVolume = state.audio.volume
    state.audio.muted = true

    try {
      await state.audio.play()
      state.audio.pause()

      state.audio.muted = false
      state.audio.volume = originalVolume
      state.audio.currentTime = 0

      isAudioContextUnlocked = true
      log('✅ 音频上下文已解锁')

      // 解锁后重置错误计数，因为用户交互可能解决了临时问题
      resetErrorState()

      while (playQueue.length > 0) {
        const fn = playQueue.shift()
        if (fn)
          fn()
      }
    }
    catch (err: any) {
      log('⚠️ 解锁失败:', err.name)
    }
  }

  ;['click', 'touchstart', 'keydown'].forEach((evt) => {
    document.addEventListener(evt, unlock, { passive: true })
  })
}
setupGlobalUnlock()

// --- 新增：错误状态管理 ---
function resetErrorState() {
  errorRetryCount = 0
  lastErrorTime = 0
  isFatalError = false
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

function shouldRetry(errorCode: number): boolean {
  if (isFatalError)
    return false

  // 致命错误代码：格式不支持 (4) 或 资源不存在/网络彻底断开 (有时表现为 2 但持续失败)
  // 这里主要拦截 Code 4 (格式/解码错误)，这种错误重试通常无效
  if (errorCode === 4) {
    log('❌ 检测到致命错误 (Format/Decode Error)，停止重试')
    isFatalError = true
    return false
  }

  const now = Date.now()

  // 1. 检查连续错误次数
  if (errorRetryCount >= MAX_CONSECUTIVE_ERRORS) {
    log(`❌ 连续错误 ${errorRetryCount} 次，达到上限，停止重试`)
    isFatalError = true
    return false
  }

  // 2. 检查时间窗口内的错误频率
  if (now - lastErrorTime < ERROR_TIME_WINDOW_MS) {
    // 在时间窗口内，如果错误次数过多
    // 注意：这里简单计数，实际可以更复杂，但为了轻量级，我们依赖连续计数 + 时间戳判断
    // 如果上次错误很近，且总次数已经较多，则拒绝
    if (errorRetryCount >= 2 && (now - lastErrorTime) < 2000) {
      log('❌ 错误频率过高，触发熔断')
      isFatalError = true
      return false
    }
  }
  else {
    // 如果超出时间窗口，重置部分计数（允许偶尔的错误）
    // 但为了安全，我们只重置如果间隔很长
    if (now - lastErrorTime > ERROR_TIME_WINDOW_MS * 2) {
      errorRetryCount = Math.max(0, errorRetryCount - 2)
    }
  }

  return true
}

function scheduleRetry(options: KeepAliveOptions, attemptCount: number) {
  if (isFatalError)
    return

  const delay = Math.min(BASE_RETRY_DELAY_MS * attemptCount, MAX_RETRY_DELAY_MS)
  log(`⏳ 计划 ${delay}ms 后重试 (第 ${attemptCount} 次)...`)

  if (errorTimer)
    clearTimeout(errorTimer)

  errorTimer = window.setTimeout(() => {
    if (!isFatalError && state.audio) {
      log('🔄 执行重试加载...')
      // 重试时不完全重置元素，仅 reload，除非必要
      state.audio.load()
      if (isAudioContextUnlocked) {
        state.audio.play().catch(e => handleAudioError(e, options))
      }
    }
  }, delay)
}

function handleAudioError(e: Event, options: KeepAliveOptions) {
  const audioEl = state.audio
  if (!audioEl)
    return

  const err = audioEl.error
  if (!err) {
    // 如果是普通事件错误但没有 error 对象，可能是网络中断，尝试重试
    if (shouldRetry(0)) {
      errorRetryCount++
      lastErrorTime = Date.now()
      scheduleRetry(options, errorRetryCount)
    }
    return
  }

  const codes = ['未知', '中止', '网络', '解码', '格式不支持']
  log(`❌ 音频错误 Code ${err.code}: ${codes[err.code]}`)

  // 更新错误状态
  lastErrorTime = Date.now()

  if (shouldRetry(err.code)) {
    errorRetryCount++
    scheduleRetry(options, errorRetryCount)
  }
  else {
    log('🛑 已停止自动重载，请检查资源文件或网络')
    // 可以选择在这里调用 stopKeepAlive() 彻底清理
    // stopKeepAlive()
  }
}

function resetAudioElement(options: KeepAliveOptions): HTMLAudioElement {
  log('🔄 重置音频元素...')

  stopHeartbeat()
  stopStartupStabilizer()

  // 重置时也清理错误状态，因为这是主动重置而非错误触发的
  // 但如果是因为致命错误调用的重置，则保留 fatal 状态直到用户交互
  if (!isFatalError) {
    resetErrorState()
  }

  if (noiseSource) {
    try { noiseSource.stop() }
    catch (e) {}
    noiseSource = null
  }

  const oldAudio = state.audio
  const srcToUse = options.audioSrc || DEFAULT_AUDIO_SRC
  const volumeToUse = options.volume || VOLUME_ACTIVE

  let newAudio: HTMLAudioElement

  if (oldAudio) {
    newAudio = document.createElement('audio')
    newAudio.id = AUDIO_ID
    newAudio.src = srcToUse
    newAudio.loop = true
    newAudio.preload = 'auto'
    newAudio.volume = volumeToUse
    newAudio.style.display = 'none'
    newAudio.setAttribute('playsinline', 'true')
    newAudio.setAttribute('webkit-playsinline', 'true')
    newAudio.crossOrigin = 'anonymous'

    if (oldAudio.parentNode) {
      oldAudio.parentNode.replaceChild(newAudio, oldAudio)
    }
    oldAudio.pause()
    oldAudio.src = ''
    // 移除旧监听器以防内存泄漏 (虽然 replaceChild 通常会处理，但显式清理更好)
    oldAudio.removeEventListener('error', oldAudio._errorHandler as any)
  }
  else {
    newAudio = document.createElement('audio')
    newAudio.id = AUDIO_ID
    newAudio.src = srcToUse
    newAudio.loop = true
    newAudio.preload = 'auto'
    newAudio.volume = volumeToUse
    newAudio.style.display = 'none'
    newAudio.setAttribute('playsinline', 'true')
    newAudio.setAttribute('webkit-playsinline', 'true')
    newAudio.crossOrigin = 'anonymous'
    document.body.appendChild(newAudio)
  }

  state.audio = newAudio
  state.isPlaying = false
  state.isAudioMuted = false
  isStartupPhase = false

  return newAudio
}

function startStartupStabilizer() {
  if (startupStabilizerTimer)
    clearInterval(startupStabilizerTimer)
  isStartupPhase = true
  startupRefreshCount = 0

  log('🛡️ 启动稳定器...')

  startupStabilizerTimer = window.setInterval(() => {
    if (!state.audio || state.audio.paused) {
      stopStartupStabilizer()
      return
    }

    startupRefreshCount++
    if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
      navigator.mediaSession.playbackState = 'playing'
    }

    if (startupRefreshCount >= STARTUP_FORCE_REFRESH_COUNT) {
      log('🛡️ 稳定器：预热完成')
      isStartupPhase = false
      stopStartupStabilizer()
    }
  }, 800)
}

function stopStartupStabilizer() {
  if (startupStabilizerTimer) {
    clearInterval(startupStabilizerTimer)
    startupStabilizerTimer = null
  }
}

function startHeartbeat() {
  if (heartbeatTimer)
    clearInterval(heartbeatTimer)

  heartbeatTimer = window.setInterval(() => {
    if (!state.audio) {
      stopHeartbeat()
      return
    }

    const isPaused = state.audio.paused
    const isEnded = state.audio.ended

    if (state.isPlaying && (isPaused || isEnded)) {
      // 心跳检测到停止，如果是非致命错误状态，尝试恢复
      if (!isFatalError) {
        log('⚠️ 检测到音频意外停止，尝试恢复...')
        if (isEnded)
          state.audio.currentTime = 0
        state.audio.play().catch((e: any) => {
          if (e.name === 'NotAllowedError')
            isAudioContextUnlocked = false
          // 心跳中的播放失败不计入严重的 error 事件重试循环，避免干扰
        })
      }
      else {
        log('⚠️ 处于致命错误状态，心跳跳过自动恢复')
      }
    }

    if (state.isPlaying && !state.isAudioMuted && state.audio) {
      volumeToggleState = (volumeToggleState + 1) % 2
      const baseVol = VOLUME_ACTIVE
      const tweak = volumeToggleState === 0 ? 0.002 : 0
      if (Math.abs(state.audio.volume - baseVol) < 0.01) {
        state.audio.volume = baseVol + tweak
      }
    }

    if ('mediaSession' in navigator && state.audio && !state.audio.paused) {
      if (navigator.mediaSession.metadata) {
        navigator.mediaSession.playbackState = 'playing'
        if (startupRefreshCount % 5 === 0) {
          updateMetadata(state.lastSpeedStr || '0 B/s', state.lastTotalBytes, state.isPlaying, false, true)
        }
      }
    }
  }, KEEP_ALIVE_HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

export function startKeepAlive(options: KeepAliveOptions = {}) {
  const {
    volume = VOLUME_ACTIVE,
    audioSrc = DEFAULT_AUDIO_SRC,
    onPlay,
    onPause,
    targetGB = 'infinity',
  } = options

  state.targetGB = targetGB

  // 如果是用户主动重启，重置错误状态
  resetErrorState()

  if (state.audio && state.isPlaying && !state.audio.paused && !state.isAudioMuted) {
    return
  }

  const audioEl = resetAudioElement(options)

  // 绑定错误处理，传入 options 以便重试时使用
  const errorHandler = (e: Event) => handleAudioError(e, options)
  ;(audioEl as any)._errorHandler = errorHandler // 存引用以便移除
  audioEl.addEventListener('error', errorHandler)

  const attemptPlay = () => {
    if (!state.audio)
      return
    log('🚀 尝试播放...')

    const targetDisplay = state.targetGB === 'infinity' ? '∞' : `${state.targetGB} GB`

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `⬇️ 准备中... (0 B/${targetDisplay})`,
          artist: 'Initializing',
          album: 'Traffic Waster',
          artwork: [{ src: generateStaticCover(), sizes: '512x512', type: 'image/png' }],
        })
        navigator.mediaSession.playbackState = 'playing'
      }
      catch (e) {
        log('⚠️ 预设置 Metadata 失败', e)
      }

      setupMediaSessionHandlers({ onPlay, onPause, volume })
    }

    const playPromise = audioEl.play()

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          state.isPlaying = true
          state.isAudioMuted = false
          log('✅ 播放成功')

          createInvisibleNoise(audioEl)
          startHeartbeat()
          startStartupStabilizer()
          updateMetadata('0 B/s', 0, true, true)

          setTimeout(() => {
            if (state.isPlaying) {
              updateMetadata(state.lastSpeedStr || '0 B/s', state.lastTotalBytes, true, false)
            }
          }, STARTUP_STABILIZATION_DELAY)
        })
        .catch((err: any) => {
          state.isPlaying = false
          log('❌ 播放失败:', err.name)
          if (err.name === 'NotAllowedError') {
            playQueue.push(attemptPlay)
          }
          else {
            // 其他播放错误也计入错误处理
            handleAudioError(new Event('error'), options)
          }
        })
    }
  }

  if (isAudioContextUnlocked) {
    attemptPlay()
  }
  else {
    log('⏳ 上下文未解锁，请求入队')
    playQueue.push(attemptPlay)
  }
}

function updateMetadata(speedStr: string, totalBytes: number, isBusinessRunning: boolean, isInitialLoad = false, forceRefresh = false) {
  if (!('mediaSession' in navigator))
    return

  if (isStartupPhase && !isInitialLoad && !forceRefresh && startupRefreshCount < 2) {
    state.lastSpeedStr = speedStr
    state.lastTotalStr = formatSize(totalBytes)
    state.lastTotalBytes = totalBytes
    return
  }

  const totalStr = formatSize(totalBytes)
  state.lastSpeedStr = speedStr
  state.lastTotalStr = totalStr
  state.lastTotalBytes = totalBytes

  const targetDisplay = state.targetGB === 'infinity' ? '∞' : `${state.targetGB} GB`
  const statusIcon = isBusinessRunning ? '⬇️' : '⏸️'
  const titleText = `${statusIcon} ${speedStr} (${totalStr}/${targetDisplay})`
  const artistText = isBusinessRunning ? 'Running' : 'Paused (Active)'

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titleText,
      artist: artistText,
      album: 'Traffic Waster',
      artwork: [
        { src: generateStaticCover(), sizes: '512x512', type: 'image/png' },
      ],
    })

    if (state.audio && !state.audio.paused) {
      navigator.mediaSession.playbackState = 'playing'
    }
  }
  catch (e) {
    log('❌ MediaSession 更新失败', e)
  }
}

function setupMediaSessionHandlers(options: any) {
  if (!('mediaSession' in navigator))
    return

  navigator.mediaSession.setActionHandler('play', () => {
    log('🎵 [Lock] 播放')
    if (state.audio) {
      if (state.audio.paused)
        state.audio.play().catch(e => log('❌ 锁屏播放失败', e))
      state.audio.volume = options.volume || VOLUME_ACTIVE
      state.isAudioMuted = false
    }
    state.isPlaying = true
    // 用户手动播放，重置错误状态
    resetErrorState()
    options.onPlay?.()
    updateMetadata(state.lastSpeedStr, state.lastTotalBytes, true)
  })

  navigator.mediaSession.setActionHandler('pause', () => {
    log('🎵 [Lock] 暂停 (假)')
    if (state.audio) {
      state.audio.volume = MIN_VOLUME_TO_KEEP_ALIVE
      state.isAudioMuted = true
    }
    state.isPlaying = false
    options.onPause?.()
    updateMetadata(state.lastSpeedStr, state.lastTotalBytes, false)
  })

  navigator.mediaSession.setActionHandler('stop', () => {
    log('🎵 [Lock] 停止')
    options.onPause?.()
  })
}

export function stopKeepAlive() {
  log('🛑 停止 KeepAlive')
  stopHeartbeat()
  stopStartupStabilizer()

  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }

  if (noiseSource) {
    try { noiseSource.stop() }
    catch (e) {}
    noiseSource = null
  }

  // 保持 audioCtx 打开以便下次快速恢复，除非明确需要销毁

  if (state.audio) {
    state.audio.pause()
    state.audio.currentTime = 0
    const oldAudio = state.audio
    if (oldAudio.parentNode) {
      // 可选：移除 DOM 以彻底清理
      // oldAudio.parentNode.removeChild(oldAudio)
    }
  }

  state.isPlaying = false
  state.isAudioMuted = false
  resetErrorState()

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none'
    navigator.mediaSession.metadata = null
    ;['play', 'pause', 'stop', 'previoustrack', 'nexttrack'].forEach((action) => {
      navigator.mediaSession.setActionHandler(action as any, null)
    })
  }
}

export function updateKeepAliveStatus(
  currentSpeed: number,
  totalDownloaded: number,
  isBusinessRunning: boolean,
) {
  if (!('mediaSession' in navigator))
    return
  const speedStr = `${formatSize(currentSpeed)}/s`
  updateMetadata(speedStr, totalDownloaded, isBusinessRunning)
}

export function updateTarget(target: number | 'infinity') {
  state.targetGB = target
  if (state.lastSpeedStr) {
    updateMetadata(state.lastSpeedStr, state.lastTotalBytes, state.isPlaying)
  }
}

export function isKeepAliveActive(): boolean {
  return !!state.audio && !state.audio.paused && !isFatalError
}
