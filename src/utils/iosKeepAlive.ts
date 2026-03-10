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
  currentTitlePrefix: string
  currentArtist: string
}

const state: KeepAliveState = {
  audio: null,
  isPlaying: false,
  lastCoverUpdate: 0,
  lastSpeedStr: '',
  lastTotalStr: '',
  currentTitlePrefix: '⬇️',
  currentArtist: '流量消耗器',
}

/**
 * 格式化流量大小
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
 * 生成动态封面图 (Canvas)
 */
function generateArtwork(speedStr: string, totalStr: string, isRunning: boolean): string {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  if (!ctx)
    return ''

  // 背景色
  ctx.fillStyle = isRunning ? '#007AFF' : '#8E8E93'
  ctx.fillRect(0, 0, 512, 512)

  // 状态文字
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.font = 'bold 60px San Francisco, Arial'
  ctx.fillText(isRunning ? 'DOWNLOADING' : 'PAUSED', 256, 150)

  // 速度大字
  ctx.font = 'bold 70px San Francisco, Arial'
  ctx.fillText(speedStr, 256, 260)

  // 总量小字
  ctx.font = '50px San Francisco, Arial'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(`Total: ${totalStr}`, 256, 360)

  return canvas.toDataURL('image/png')
}

/**
 * 【核心修复】显式导出 updateMetadata 函数
 * 用于更新锁屏/控制中心的元数据
 * @param speedStr 速度字符串
 * @param totalStr 总流量字符串
 * @param isRunning 是否运行中
 * @param titlePrefix 标题前缀
 * @param artist 艺术家
 * @param forceUpdateCover 是否强制更新封面 (跳过防抖)
 */
export function updateMetadata(
  speedStr: string,
  totalStr: string,
  isRunning: boolean,
  titlePrefix: string = state.currentTitlePrefix,
  artist: string = state.currentArtist,
  forceUpdateCover: boolean = false,
) {
  if (!('mediaSession' in navigator))
    return

  // 更新状态缓存
  state.currentTitlePrefix = titlePrefix
  state.currentArtist = artist

  // 1. 总是更新文本信息 (Title, Artist, Album) - 开销小，实时性强
  const metadata: any = {
    title: `${titlePrefix} ${speedStr}`,
    artist,
    album: `Total: ${totalStr}`,
  }

  // 2. 智能处理封面 (Artwork)
  const now = Date.now()
  const speedChanged = speedStr !== state.lastSpeedStr
  const totalChanged = totalStr !== state.lastTotalStr
  const timePassed = now - state.lastCoverUpdate > 3000 // 3秒防抖阈值

  // 判断是否需要重新生成封面
  const shouldUpdateCover = forceUpdateCover
    || (state.lastSpeedStr === '') // 首次必须更新
    || ((speedChanged || totalChanged) && timePassed)

  if (shouldUpdateCover) {
    try {
      const artwork = generateArtwork(speedStr, totalStr, isRunning)
      metadata.artwork = [
        { src: artwork, sizes: '512x512', type: 'image/png' },
      ]
      state.lastCoverUpdate = now
      state.lastSpeedStr = speedStr
      state.lastTotalStr = totalStr
    }
    catch (e) {
      console.warn('封面生成失败:', e)
      // 如果生成失败，尝试保留旧的 artwork (如果 mediaSession 支持获取)
      // 这里简单处理：不赋值 artwork 字段，浏览器通常会保留上一帧
    }
  }
  else {
    // 如果不更新封面，尝试从当前 session 获取旧的 artwork 保持引用
    // 注意：MediaMetadata 是只读的，不能直接修改其 artwork 属性，必须重新 new
    // 所以如果不生成新的，我们就不传 artwork 字段，依赖浏览器的行为保留旧图
    // 但为了保险，如果浏览器不支持保留，我们至少保证文本更新了
  }

  // 应用元数据
  try {
    navigator.mediaSession.metadata = new MediaMetadata(metadata)
    navigator.mediaSession.playbackState = isRunning ? 'playing' : 'paused'
  }
  catch (e) {
    console.error('MediaSession 更新错误:', e)
  }
}

/**
 * 启动后台保活
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

  // 如果已经在运行，尝试恢复播放并更新元数据
  if (state.isPlaying && state.audio) {
    if (state.audio.paused) {
      state.audio.play().catch(console.error)
    }
    updateMetadata(state.lastSpeedStr || '0 B/s', state.lastTotalStr || '0 B', true, titlePrefix, artist, true)
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

      // 错误重试机制
      audioEl.addEventListener('error', () => {
        console.warn('⚠️ 音频加载错误，尝试重载...')
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
        console.log('✅ 保活音频播放启动成功')

        setupMediaSessionHandlers({ onPlay, onPause, titlePrefix, artist })
        // 初始调用 updateMetadata
        updateMetadata('0 B/s', '0 B', true, titlePrefix, artist, true)
      }).catch((err) => {
        console.error('❌ 音频启动失败 (通常需要用户交互):', err)
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
 * 设置锁屏按钮回调
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
        updateMetadata(state.lastSpeedStr, state.lastTotalStr, true, options.titlePrefix, options.artist, true)
      }).catch(err => console.error('恢复播放失败:', err))
    }
    else if (options.onPlay) {
      options.onPlay()
    }
  })

  navigator.mediaSession.setActionHandler('pause', () => {
    console.log('🎵 锁屏点击暂停')
    if (state.audio) {
      state.audio.pause()
      state.isPlaying = false
    }
    if (options.onPause)
      options.onPause()

    // 立即更新 UI 为暂停态 (强制刷新封面)
    updateMetadata(state.lastSpeedStr, state.lastTotalStr, false, options.titlePrefix, options.artist, true)
  })

  navigator.mediaSession.setActionHandler('stop', () => {
    console.log('🎵 锁屏点击停止')
    if (options.onPause)
      options.onPause()
    // 停止通常意味着结束，这里可以选择是否彻底 stopKeepAlive
    // 为了安全，我们只暂停业务，让用户自己关闭页面或切换
  })
}

/**
 * 停止后台保活
 */
export function stopKeepAlive() {
  if (state.audio) {
    state.audio.pause()
    state.audio.src = ''
    state.audio.remove()
    state.audio = null
  }
  state.isPlaying = false
  state.lastSpeedStr = ''
  state.lastTotalStr = ''

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none'
    navigator.mediaSession.metadata = null
    navigator.mediaSession.setActionHandler('play', null)
    navigator.mediaSession.setActionHandler('pause', null)
    navigator.mediaSession.setActionHandler('stop', null)
  }
  console.log('🛑 保活已停止')
}

/**
 * 更新锁屏显示的状态 (供业务层周期性调用)
 */
export function updateKeepAliveStatus(currentSpeed: string, totalDownloadedBytes: number, isBusinessRunning: boolean) {
  if (!('mediaSession' in navigator))
    return

  const totalStr = formatSize(totalDownloadedBytes)
  const titlePrefix = isBusinessRunning ? '⬇️' : '⏸️'

  // 调用核心的 updateMetadata
  // 注意：这里不强制 forceUpdateCover，让内部的防抖逻辑生效
  updateMetadata(currentSpeed, totalStr, isBusinessRunning, titlePrefix, state.currentArtist)
}

/**
 * 检查保活是否激活
 */
export function isKeepAliveActive(): boolean {
  return state.isPlaying && !!state.audio && !state.audio.paused
}
