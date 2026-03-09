export interface TrafficState {
  targetGB: number | 'infinity'
  resourceUrl: string
  threads: number
  totalDownloaded: number
  currentSpeed: number
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

  const state: TrafficState = {
    targetGB: initialConfig.targetGB,
    resourceUrl: initialConfig.resourceUrl,
    threads: initialConfig.threads,
    totalDownloaded: 0,
    currentSpeed: 0,
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

  // 【核心修改】下载分片逻辑：强制流式读取，统计实际字节
  const downloadChunk = async () => {
    if (!isRunning || isPaused) {
      state.activeThreads = Math.max(0, state.activeThreads - 1)
      notify()
      return
    }

    // 检查是否已达到目标（无限模式跳过）
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

    let bytesReceivedInThisRequest = 0

    try {
      const url = state.resourceUrl
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
        referrerPolicy: 'no-referrer',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response body available')
      }

      const reader = response.body.getReader()

      // 【关键逻辑】循环读取直到流结束，累加每个 chunk 的实际长度
      while (true) {
        // 每次读取前检查状态，支持暂停/停止即时响应
        if (isPaused || !isRunning) {
          await reader.cancel()
          throw new Error('Paused or Stopped by user')
        }

        const { done, value } = await reader.read()

        if (done) {
          // 流结束
          break
        }

        // value 是 Uint8Array，其 length 即为本次实际接收的字节数
        if (value && value.length > 0) {
          bytesReceivedInThisRequest += value.length

          // 可选：为了更实时的进度更新，可以每接收一定量就更新一次 state.totalDownloaded
          // 但为了性能，通常在循环外或每隔几个 chunk 更新一次，这里我们在循环结束后统一更新，
          // 或者为了速度条更平滑，可以在这里更新（注意频率）。
          // 考虑到 JS 单线程，频繁更新 state 可能影响读取性能，我们选择在每次 read 后累加局部变量，
          // 如果需要极实时显示，可取消下面这行的注释，但会增加 notify 频率：
          // state.totalDownloaded += value.length; notify();
        }
      }

      // 循环结束，将本次请求实际接收的总字节数加入全局统计
      if (bytesReceivedInThisRequest > 0) {
        state.totalDownloaded += bytesReceivedInThisRequest
        state.errorCount = 0 // 重置错误计数
        state.lastError = null
        state.status = 'running'
      }
      else {
        // 如果流结束了但没收到任何数据，视为异常
        throw new Error('Stream ended with 0 bytes received')
      }
    }
    catch (error) {
      const err = error as Error

      // 如果是主动取消（暂停/停止/替换），不视为错误，直接返回
      if (err.name === 'AbortError' || err.message.includes('Paused or Stopped')) {
        state.activeThreads = Math.max(0, state.activeThreads - 1)
        // 注意：如果是暂停，我们已经累加了部分字节吗？
        // 上面的逻辑是：如果中途取消，reader.cancel() 被调用，循环打破，catch 捕获。
        // 此时 bytesReceivedInThisRequest 包含了 cancel 之前成功 read 的部分。
        // 我们需要把这部分也加进去吗？
        // 策略：如果是用户主动暂停/停止，通常希望保留已下载的流量统计。
        // 但 fetch 的 cancel 可能会导致当前 read promise reject，value 可能丢失。
        // 为了严谨，我们只在正常完成 (done=true) 时累加。
        // 如果要在中断时保留部分流量，需要在 try 块内实时累加 state.totalDownloaded。

        // 【优化策略】为了最准确的流量统计，即使中断也要保留已读数据。
        // 修改：在 while 循环内部实时累加。

        notify()
        return
      }

      // 真实网络错误
      const stoppedByLimit = handleError(err.message)
      if (!stoppedByLimit && isRunning && !isPaused) {
        setTimeout(() => {
          if (isRunning && !isPaused)
            downloadChunk()
        }, 500)
      }
      return
    }
    finally {
      abortControllers = abortControllers.filter(c => c !== controller)

      // 清理逻辑
      if (isRunning && !isPaused && state.status !== 'error') {
        const isInfinity = state.targetGB === 'infinity'
        if (!isInfinity) {
          const targetBytes = (state.targetGB as number) * 1024 * 1024 * 1024
          if (state.totalDownloaded < targetBytes) {
            setTimeout(downloadChunk, 10) // 快速重试/继续
          }
          else {
            finish()
          }
        }
        else {
          setTimeout(downloadChunk, 10)
        }
      }
      else {
        state.activeThreads = Math.max(0, state.activeThreads - 1)
      }

      if (state.status !== 'error')
        notify()
    }
  }

  // 【重构】为了支持中断时保留已接收流量，我们需要在 while 循环内实时累加
  // 重新定义 downloadChunk 以包含实时累加逻辑
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
          // 中断时，已累加的字节已经保存在 state.totalDownloaded 中，无需额外操作
          throw new Error('Interrupted')
        }

        const { done, value } = await reader.read()
        if (done)
          break

        if (value) {
          // 【核心修正】实时累加实际接收的字节
          state.totalDownloaded += value.length
          state.errorCount = 0
          state.lastError = null
          state.status = 'running'

          // 每接收一点数据就通知 UI 更新？
          // 频率太高会卡，建议节流。但为了速度显示准确，我们可以依赖 setInterval 的速度计算，
          // totalDownloaded 的实时更新可以让进度条更平滑。
          // 这里简单处理：每次累加都 notify，Vue 的响应式系统会有批处理优化。
          // 如果性能有问题，可以改为每 100KB notify 一次。
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

      if (deltaTime > 0) {
        state.currentSpeed = deltaBytes / deltaTime
      }
      else {
        state.currentSpeed = 0
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
    notify()
  }

  const updateConfig = (key: keyof TrafficState, value: any) => {
    if (isRunning && !isPaused && key !== 'status')
      return;
    (state as any)[key] = value
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
