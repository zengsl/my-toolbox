// src/utils/iosKeepAlive.ts

/**
 * iOS Safari 后台保活工具 (极简稳定版)
 * 特性：
 * 1. 封面固定不闪烁 (蓝色背景 + 文字)
 * 2. 标题显示速度，专辑显示 "已消耗 / 目标"
 * 3. 不依赖外部时间变量
 */

const AUDIO_ID = 'ios-bg-keepalive-audio'
const DEFAULT_AUDIO_SRC = '/sounds/silent_loop.mp3'

let STATIC_COVER_DATA_URI: string | null = null

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
  targetGB: number | 'infinity'
}

const state: KeepAliveState = {
  audio: null,
  isPlaying: false,
  targetGB: 'infinity',
}

/**
 * 格式化流量
 */
function formatSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

/**
 * 生成静态封面 (只执行一次)
 */
function generateStaticCover(): string {
  if (STATIC_COVER_DATA_URI)
    return STATIC_COVER_DATA_URI

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  if (!ctx)
    return ''

  // 蓝色背景
  ctx.fillStyle = '#007AFF'
  ctx.fillRect(0, 0, 512, 512)

  // 绘制简单图标 (下载箭头)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 30
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(256, 180)
  ctx.lineTo(256, 380)
  ctx.moveTo(180, 300)
  ctx.lineTo(256, 380)
  ctx.lineTo(332, 300)
  ctx.stroke()

  // 底部文字
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = 'bold 50px San Francisco, Arial'
  ctx.fillText('DATA SAVER', 256, 460)

  STATIC_COVER_DATA_URI = canvas.toDataURL('image/png')
  return STATIC_COVER_DATA_URI
}

/**
 * 启动保活
 */
export function startKeepAlive(options: KeepAliveOptions = {}) {
  const {
    volume = 0.05,
    audioSrc = DEFAULT_AUDIO_SRC,
    onPlay,
    onPause,
    targetGB = 'infinity',
  } = options

  state.targetGB = targetGB

  if (state.isPlaying && state.audio) {
    if (state.audio.paused) {
      state.audio.play().catch(console.error)
    }
    return
  }

  try {
    let audioEl = document.getElementById(AUDIO_ID) as HTMLAudioElement | null

    if (!audioEl) {
      audioEl = document.createElement('audio')
      audioEl.id = AUDIO_ID
      audioEl.src = audioSrc
      audioEl.loop = true
      audioEl.preload = 'auto'
      audioEl.volume = volume
      audioEl.style.display = 'none'
      audioEl.setAttribute('playsinline', 'true')
      audioEl.setAttribute('webkit-playsinline', 'true')
      document.body.appendChild(audioEl)

      audioEl.addEventListener('error', () => {
        console.warn('⚠️ 音频错误，重试...')
        if (audioEl) {
          audioEl.load()
          audioEl.play().catch(console.error)
        }
      })
    }
    else {
      if (audioEl.src !== audioSrc)
        audioEl.src = audioSrc
      audioEl.loop = true
      audioEl.volume = volume
    }

    state.audio = audioEl

    const playPromise = audioEl.play()
    if (playPromise !== undefined) {
      playPromise.then(() => {
        state.isPlaying = true
        console.log('✅ 保活启动 (静态封面)')
        setupMediaSessionHandlers({ onPlay, onPause })
        updateMetadata('0 B/s', '0 B', true)
      }).catch((err) => {
        console.error('❌ 启动失败:', err)
        state.isPlaying = false
        throw err
      })
    }
  }
  catch (e) {
    stopKeepAlive()
    throw e
  }
}

/**
 * 更新元数据核心函数
 */
function updateMetadata(speedStr: string, consumedStr: string, isRunning: boolean) {
  if (!('mediaSession' in navigator))
    return

  const targetDisplay = state.targetGB === 'infinity' ? '∞' : `${state.targetGB} GB`
  const albumText = `已消耗：${consumedStr} / 目标：${targetDisplay}`
  const titleText = `${isRunning ? '⬇️' : '⏸️'} ${speedStr}`

  // 艺术家字段：固定显示状态，不依赖时间变量
  const artistText = isRunning ? 'Running' : 'Paused'

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titleText,
      artist: artistText,
      album: albumText,
      artwork: [
        { src: generateStaticCover(), sizes: '512x512', type: 'image/png' },
      ],
    })
    navigator.mediaSession.playbackState = isRunning ? 'playing' : 'paused'
  }
  catch (e) {
    console.error('MediaSession 错误:', e)
  }
}

/**
 * 设置按钮回调
 */
function setupMediaSessionHandlers(options: any) {
  if (!('mediaSession' in navigator))
    return

  navigator.mediaSession.setActionHandler('play', () => {
    if (state.audio && state.audio.paused) {
      state.audio.play().then(() => {
        state.isPlaying = true
        if (options.onPlay)
          options.onPlay()
      }).catch(console.error)
    }
    else if (options.onPlay) {
      options.onPlay()
    }
  })

  navigator.mediaSession.setActionHandler('pause', () => {
    if (state.audio) {
      state.audio.pause()
      state.isPlaying = false
    }
    if (options.onPause)
      options.onPause()

    // 暂停时立即刷新状态
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused'
      // 重新获取当前元数据中的文本进行更新 (保持数值不变，只变状态)
      const currentMeta = navigator.mediaSession.metadata
      if (currentMeta) {
        // 这里简单处理，下次周期性调用会自动修正数值，这里只改状态图标
        // 为了体验好，我们可以强制刷新一次 metadata
        // 但由于拿不到具体的 speed/consumed 数值，这里依赖外部的周期性调用来修正显示
        // 或者我们可以简单地把 title 改成 "⏸️ 已暂停"
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '⏸️ 已暂停',
          artist: 'Paused',
          album: currentMeta.album, // 保留原有的消耗量显示
          artwork: [{ src: generateStaticCover(), sizes: '512x512', type: 'image/png' }],
        })
      }
    }
  })
}

export function stopKeepAlive() {
  if (state.audio) {
    state.audio.pause()
    state.audio.src = ''
    state.audio.remove()
    state.audio = null
  }
  state.isPlaying = false

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none'
    navigator.mediaSession.metadata = null
    navigator.mediaSession.setActionHandler('play', null)
    navigator.mediaSession.setActionHandler('pause', null)
  }
}

/**
 * 【对外接口】业务层调用
 * @param currentSpeed 当前速度 (Bytes/s)
 * @param totalDownloaded 已下载总量 (Bytes)
 * @param isBusinessRunning 是否正在运行
 */
export function updateKeepAliveStatus(
  currentSpeed: number,
  totalDownloaded: number,
  isBusinessRunning: boolean,
) {
  if (!('mediaSession' in navigator))
    return

  const speedStr = `${formatSize(currentSpeed)}/s`
  const consumedStr = formatSize(totalDownloaded)

  updateMetadata(speedStr, consumedStr, isBusinessRunning)
}

export function updateTarget(target: number | 'infinity') {
  state.targetGB = target
}

export function isKeepAliveActive(): boolean {
  return state.isPlaying && !!state.audio && !state.audio.paused
}
