export interface TrafficState {
    targetMB: number;
    resourceUrl: string;
    threads: number;
    totalDownloaded: number;
    currentSpeed: number;
    status: 'idle' | 'starting' | 'running' | 'stopped' | 'finished' | 'error';
    activeThreads: number;
    requestCount: number;
    startTime: number | null;
    lastCheckBytes: number;
    lastCheckTime: number;
}

export interface TrafficListener {
    (state: TrafficState): void;
}

export function useTrafficWaster() {
    let isRunning = false;
    let timers: number[] = [];
    let abortControllers: AbortController[] = [];

    const state: TrafficState = {
        targetMB: 100,
        resourceUrl: 'https://speed.cloudflare.com/__down?bytes=10485760',
        threads: 2,
        totalDownloaded: 0,
        currentSpeed: 0,
        status: 'idle',
        activeThreads: 0,
        requestCount: 0,
        startTime: null,
        lastCheckBytes: 0,
        lastCheckTime: 0
    };

    const listeners: Set<TrafficListener> = new Set();

    const notify = () => {
        listeners.forEach(cb => cb({ ...state }));
    };

    const subscribe = (cb: TrafficListener) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
    };

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const downloadChunk = async () => {
        if (!isRunning) return;

        const targetBytes = state.targetMB * 1024 * 1024;
        if (state.totalDownloaded >= targetBytes) {
            finish();
            return;
        }

        state.activeThreads++;
        state.requestCount++;
        notify();

        const controller = new AbortController();
        abortControllers.push(controller);

        try {
            const separator = state.resourceUrl.includes('?') ? '&' : '?';
            const url = `${state.resourceUrl}${separator}_t=${Date.now()}_${Math.random()}`;

            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store'
            });

            if (!response.ok) throw new Error('Network error');

            const contentLength = response.headers.get('Content-Length');
            let size = 0;

            if (contentLength) {
                size = parseInt(contentLength, 10);
                state.totalDownloaded += size;
            } else {
                const blob = await response.blob();
                size = blob.size;
                state.totalDownloaded += size;
            }

            state.status = 'running';
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                console.error('Download failed', error);
            }
        } finally {
            state.activeThreads--;
            abortControllers = abortControllers.filter(c => c !== controller);

            if (isRunning && state.totalDownloaded < (state.targetMB * 1024 * 1024)) {
                setTimeout(downloadChunk, 10);
            } else if (state.totalDownloaded >= (state.targetMB * 1024 * 1024)) {
                finish();
            }
            notify();
        }
    };

    const start = () => {
        if (isRunning) return;
        isRunning = true;
        state.status = 'starting';
        state.startTime = Date.now();
        state.lastCheckBytes = state.totalDownloaded;
        state.lastCheckTime = Date.now();
        state.currentSpeed = 0;
        abortControllers = [];

        const speedTimer = window.setInterval(() => {
            if (!isRunning) {
                clearInterval(speedTimer);
                return;
            }
            const now = Date.now();
            const deltaBytes = state.totalDownloaded - state.lastCheckBytes;
            const deltaTime = (now - state.lastCheckTime) / 1000;

            state.currentSpeed = deltaTime > 0 ? deltaBytes / deltaTime : 0;
            state.lastCheckBytes = state.totalDownloaded;
            state.lastCheckTime = now;

            if (state.totalDownloaded >= state.targetMB * 1024 * 1024) {
                finish();
            }
            notify();
        }, 1000);

        timers.push(speedTimer);

        for (let i = 0; i < state.threads; i++) {
            downloadChunk();
        }
        notify();
    };

    const stop = () => {
        isRunning = false;
        state.status = 'stopped';
        state.currentSpeed = 0;
        state.activeThreads = 0;

        timers.forEach(clearInterval);
        timers = [];

        abortControllers.forEach(c => c.abort());
        abortControllers = [];

        notify();
    };

    const finish = () => {
        isRunning = false;
        state.status = 'finished';
        state.currentSpeed = 0;
        state.activeThreads = 0;
        timers.forEach(clearInterval);
        timers = [];
        notify();
    };

    const reset = () => {
        stop();
        state.totalDownloaded = 0;
        state.requestCount = 0;
        state.status = 'idle';
        state.startTime = null;
        notify();
    };

    const updateConfig = (key: keyof TrafficState, value: any) => {
        if (isRunning && key !== 'status') return;
        (state as any)[key] = value;
        notify();
    };

    return {
        state,
        start,
        stop,
        reset,
        updateConfig,
        subscribe,
        formatSize
    };
}