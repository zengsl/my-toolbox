// src/utils/iosKeepAlive.ts

const AUDIO_ID = 'ios-bg-keepalive-audio'
const DEFAULT_AUDIO_SRC = '/sounds/silent_loop.mp3'

export interface KeepAliveOptions {
  volume?: number
  titlePrefix?: string
  artist?: string
  audioSrc?: string
  onPlay?: () => void
  onPause?: () => void
}

interface KeepAliveState {
  audio: HTMLAudioElement | null
  isPlaying: boolean
  lastCoverUpdate: number
  lastSpeedStr: string
  lastTotalStr: string
}

const state: KeepAliveState = {
  audio: null,
  isPlaying: false,
  lastCoverUpdate: 0,
  lastSpeedStr: '',
  lastTotalStr: '',
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
 * 生成封面 (带简单缓存判断)
 */
function generateArtwork(speedStr: string, totalStr: string, isRunning: boolean): string {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return ''

  // 背景
  ctx.fillStyle = isRunning ? '#007AFF' : '#8E8E93'
  ctx.fillRect(0, 0, 512, 512)

  // 文字
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.font = 'bold 60px San Francisco, Arial'
  ctx.fillText(isRunning ? 'DOWNLOADING' : 'PAUSED', 256, 150)

  ctx.font = 'bold 70px San Francisco, Arial'
  ctx.fillText(speedStr, 256, 260)

  ctx.font = '50px San Francisco, Arial'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(`Total: ${totalStr}`, 256, 360)

  return canvas.toDataURL('image/png')
}

/**
 * 启动保活
 */
export function startKeepAlive(options: KeepAliveOptions = {}) {
  const {
    volume = 0.05,
    titlePrefix = '⬇️',
    artist = '流量消耗器',
    audioSrc = DEFAULT_AUDIO_SRC,
    onPlay,
    onPause,
  } = options

  if (state.isPlaying && state.audio) {
    // 已经在运行，尝试恢复播放（防止被系统挂起）
    if (state.audio.paused) {
      state.audio.play().catch(() => {
      })
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
      // 关键：允许在蜂窝网络下播放
      audioEl.setAttribute('webkit-playsinline', 'true')
      document.body.appendChild(audioEl)

      // 监听错误自动重试
      audioEl.addEventListener('error', () => {
        console.warn('⚠️ 音频加载错误，尝试重新加载...')
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
        console.log('✅ 保活音频播放中')
        setupMediaSessionHandlers({ onPlay, onPause, titlePrefix, artist })
        // updateMetadata('0 B/s', '0 B', true, titlePrefix, artist)
      }).catch((err) => {
        console.error('❌ 音频启动失败 (需用户交互):', err)
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
 * 设置锁屏按钮
 * 【策略修正】：真实暂停/播放。依赖 iOS 对 <audio> 的宽容度。
 */
function setupMediaSessionHandlers(options: any) {
  if (!('mediaSession' in navigator))
    return

  navigator.mediaSession.setActionHandler('play', () => {
    console.log('🎵 锁屏点击播放')
    if (state.audio && state.audio.paused) {
      state.audio.play().then(() => {
        state.isPlaying = true
        if (options.onPlay)
          options.onPlay()
        // updateMetadata(state.lastSpeedStr, state.lastTotalStr, true, options.titlePrefix, options.artist)
      }).catch((err) => {
        console.error('恢复播放失败:', err)
        // 如果自动恢复失败，可能需要用户解锁屏幕操作
      })
    }
    else if (options.onPlay) {
      options.onPlay()
    }
  })

  navigator.mediaSession.setActionHandler('pause', () => {
    console.log('🎵 锁屏点击暂停')
    // 真实暂停音频
    if (state.audio) {
      state.audio.pause()
      state.isPlaying = false
    }
    if (options.onPause)
      options.onPause()

    // 更新 UI
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused'
      // 立即更新封面为暂停态，不等待
      const artwork = generateArtwork(state.lastSpeedStr, state.lastTotalStr, false)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${options.titlePrefix} 已暂停`,
        artist: options.artist,
        album: `Total: ${state.lastTotalStr}`,
        artwork: [{ src: artwork, sizes: '512x512', type: 'image/png' }],
      })
    }
  })
}

/**
 * 停止保活
 */
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
 * 更新状态 (带智能节流)
 * 策略：
 * 1. 文本信息 (Title/Album) 每次必更 (开销小)
 * 2. 封面图片 (Artwork) 仅当数值变化大 或 间隔 > 3秒 时更新 (开销大，防闪烁)
 */
export function updateKeepAliveStatus(currentSpeed: string, totalDownloadedBytes: number, isBusinessRunning: boolean) {
  if (!('mediaSession' in navigator))
    return

  const totalStr = formatSize(totalDownloadedBytes)
  const titlePrefix = isBusinessRunning ? '⬇️' : '⏸️'
  const artist = '流量消耗器'

  // 1. 总是更新文本元数据 (速度快，无闪烁)
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${titlePrefix} ${currentSpeed}`,
    artist,
    album: `Total: ${totalStr}`,
    // artwork 保持旧的，直到满足更新条件
    artwork: navigator.mediaSession.metadata?.artwork,
  })

  navigator.mediaSession.playbackState = isBusinessRunning ? 'playing' : 'paused'

  // 2. 智能更新封面
  const now = Date.now()
  const speedChanged = currentSpeed !== state.lastSpeedStr
  const totalChanged = totalStr !== state.lastTotalStr
  const timePassed = now - state.lastCoverUpdate > 3000 // 3秒阈值

  // 如果数值变了，且距离上次更新超过3秒，或者数值变化非常大（比如从0到有），则更新封面
  if ((speedChanged || totalChanged) && (timePassed || state.lastSpeedStr === '')) {
    try {
      const artwork = generateArtwork(currentSpeed, totalStr, isBusinessRunning)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${titlePrefix} ${currentSpeed}`,
        artist,
        album: `Total: ${totalStr}`,
        artwork: [{ src: artwork, sizes: '512x512', type: 'image/png' }],
      })
      state.lastCoverUpdate = now
      state.lastSpeedStr = currentSpeed
      state.lastTotalStr = totalStr
    }
    catch (e) {
      console.warn('封面更新失败', e)
    }
  }
  else {
    // 即使不更新图片，也要缓存最新值供下次使用
    state.lastSpeedStr = currentSpeed
    state.lastTotalStr = totalStr
  }
}

export function isKeepAliveActive(): boolean {
  return state.isPlaying && !!state.audio && !state.audio.paused
}
