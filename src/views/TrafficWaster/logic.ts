// src/views/TrafficWaster/logic.ts

export interface TrafficState {
  targetGB: number | 'infinity'
  resourceUrl: string
  threads: number
  totalDownloaded: number
  currentSpeed: number

  // 【新增】速度历史记录 (单位：bytes/s)，用于绘制图表
  speedHistory: { time: number, speed: number }[] // 改为对象数组

  status: 'idle' | 'starting' | 'running' | 'paused' | 'stopped' | 'finished' | 'error'
  activeThreads: number
  requestCount: number
  errorCount: number
  lastError: string | null
  startTime: number | null
  lastCheckBytes: number
  lastCheckTime: number
}

export interface TrafficListener {
  (state: TrafficState): void
}

export interface InitialConfig {
  targetGB: number | 'infinity'
  resourceUrl: string
  threads: number
}

export function useTrafficWaster(initialConfig: InitialConfig) {
  let isRunning = false
  let isPaused = false
  let speedTimer: number | null = null
  let abortControllers: AbortController[] = []

  const MAX_CONSECUTIVE_ERRORS = 5
  const MAX_HISTORY_LENGTH = 120 // 保留最近 120 个点 (2 分钟)，防止内存无限增长

  const state: TrafficState = {
    targetGB: initialConfig.targetGB,
    resourceUrl: initialConfig.resourceUrl,
    threads: initialConfig.threads,
    totalDownloaded: 0,
    currentSpeed: 0,
    speedHistory: [], // 【新增】初始化
    status: 'idle',
    activeThreads: 0,
    requestCount: 0,
    errorCount: 0,
    lastError: null,
    startTime: null,
    lastCheckBytes: 0,
    lastCheckTime: 0,
  }

  const listeners: Set<TrafficListener> = new Set()

  const notify = () => {
    listeners.forEach(cb => cb({ ...state }))
  }

  const subscribe = (cb: TrafficListener) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  const formatSize = (bytes: number): string => {
    if (bytes === 0)
      return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  const abortAllRequests = () => {
    abortControllers.forEach(c => c.abort())
    abortControllers = []
  }

  const handleError = (msg: string) => {
    state.errorCount++
    state.lastError = msg
    state.activeThreads = Math.max(0, state.activeThreads - 1)

    if (state.errorCount >= MAX_CONSECUTIVE_ERRORS) {
      state.status = 'error'
      isRunning = false
      isPaused = false
      if (speedTimer)
        clearInterval(speedTimer)
      abortAllRequests()
      notify()
      return true
    }
    notify()
    return false
  }

  const finish = () => {
    isRunning = false
    isPaused = false
    state.status = 'finished'
    state.currentSpeed = 0
    state.activeThreads = 0
    if (speedTimer)
      clearInterval(speedTimer)
    abortAllRequests()
    notify()
  }

  const downloadChunkReal = async () => {
    if (!isRunning || isPaused) {
      state.activeThreads = Math.max(0, state.activeThreads - 1)
      notify()
      return
    }

    const isInfinity = state.targetGB === 'infinity'
    if (!isInfinity) {
      const targetBytes = (state.targetGB as number) * 1024 * 1024 * 1024
      if (state.totalDownloaded >= targetBytes) {
        finish()
        return
      }
    }

    state.activeThreads++
    state.requestCount++
    notify()

    const controller = new AbortController()
    abortControllers.push(controller)

    try {
      const response = await fetch(state.resourceUrl, {
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
        referrerPolicy: 'no-referrer',
      })

      if (!response.ok)
        throw new Error(`HTTP ${response.status}`)
      if (!response.body)
        throw new Error('No body')

      const reader = response.body.getReader()

      while (true) {
        if (isPaused || !isRunning) {
          await reader.cancel()
          throw new Error('Interrupted')
        }

        const { done, value } = await reader.read()
        if (done)
          break

        if (value) {
          state.totalDownloaded += value.length
          state.errorCount = 0
          state.lastError = null
          state.status = 'running'
          notify()
        }
      }
    }
    catch (error) {
      const err = error as Error
      if (err.name === 'AbortError' || err.message === 'Interrupted') {
        state.activeThreads = Math.max(0, state.activeThreads - 1)
        notify()
        return
      }

      const stoppedByLimit = handleError(err.message)
      if (!stoppedByLimit && isRunning && !isPaused) {
        setTimeout(downloadChunkReal, 500)
      }
      return
    }
    finally {
      abortControllers = abortControllers.filter(c => c !== controller)

      if (isRunning && !isPaused && state.status !== 'error') {
        const isInfinity = state.targetGB === 'infinity'
        if (!isInfinity) {
          const targetBytes = (state.targetGB as number) * 1024 * 1024 * 1024
          if (state.totalDownloaded < targetBytes) {
            setTimeout(downloadChunkReal, 10)
          }
          else {
            finish()
          }
        }
        else {
          setTimeout(downloadChunkReal, 10)
        }
      }
      else {
        state.activeThreads = Math.max(0, state.activeThreads - 1)
        notify()
      }
    }
  }

  const start = () => {
    if (isRunning && !isPaused)
      return

    if (isPaused) {
      isPaused = false
      state.status = 'running'
      state.lastCheckTime = Date.now()
      state.lastCheckBytes = state.totalDownloaded
      state.currentSpeed = 0
      for (let i = 0; i < state.threads; i++) {
        downloadChunkReal()
      }
      notify()
      return
    }

    isRunning = true
    state.status = 'starting'
    state.startTime = Date.now()
    state.lastCheckBytes = state.totalDownloaded
    state.lastCheckTime = Date.now()
    state.currentSpeed = 0

    // 【优化】重置并推入初始值 0，让图表从一开始就有起点
    state.speedHistory = [{ time: Date.now(), speed: 0 }]

    // 【新增】重置历史记录
    // state.speedHistory = []

    state.errorCount = 0
    state.lastError = null
    abortControllers = []

    if (speedTimer)
      clearInterval(speedTimer)

    speedTimer = window.setInterval(() => {
      if (!isRunning || isPaused) {
        state.currentSpeed = 0
        notify()
        return
      }

      const now = Date.now()
      const deltaBytes = state.totalDownloaded - state.lastCheckBytes
      const deltaTime = (now - state.lastCheckTime) / 1000

      const instantSpeed = deltaTime > 0 ? deltaBytes / deltaTime : 0
      state.currentSpeed = instantSpeed

      // 【新增】记录历史速度
      /* if (instantSpeed > 0 || state.speedHistory.length > 0) {
        state.speedHistory.push(instantSpeed)
        if (state.speedHistory.length > MAX_HISTORY_LENGTH) {
          state.speedHistory.shift() // 移除最旧的数据
        }
      } */
      state.speedHistory.push({ time: now, speed: instantSpeed })

      if (state.speedHistory.length > MAX_HISTORY_LENGTH) {
        state.speedHistory.shift()
      }

      state.lastCheckBytes = state.totalDownloaded
      state.lastCheckTime = now

      const isInfinity = state.targetGB === 'infinity'
      if (!isInfinity) {
        const targetBytes = (state.targetGB as number) * 1024 * 1024 * 1024
        if (state.totalDownloaded >= targetBytes) {
          finish()
        }
      }
      notify()
    }, 1000)

    for (let i = 0; i < state.threads; i++) {
      downloadChunkReal()
    }
    notify()
  }

  const pause = () => {
    if (!isRunning)
      return
    isPaused = true
    state.status = 'paused'
    state.currentSpeed = 0
    abortAllRequests()
    state.activeThreads = 0
    notify()
  }

  const stop = () => {
    isRunning = false
    isPaused = false
    state.status = 'stopped'
    state.currentSpeed = 0
    state.activeThreads = 0

    if (speedTimer)
      clearInterval(speedTimer)
    abortAllRequests()
    notify()
  }

  const reset = () => {
    stop()
    state.totalDownloaded = 0
    state.requestCount = 0
    state.errorCount = 0
    state.lastError = null
    state.status = 'idle'
    state.startTime = null
    state.speedHistory = [] // 【新增】重置时清空历史
    notify()
  }

  const updateConfig = (key: keyof TrafficState, value: any) => {
    if (isRunning && !isPaused && key !== 'status') {
      return
    }(state as any)[key] = value
    notify()
  }

  return {
    state,
    start,
    pause,
    stop,
    reset,
    updateConfig,
    subscribe,
    formatSize,
  }
}
