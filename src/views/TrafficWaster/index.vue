<template>
  <div class="tool-page">
    <div class="page-header">
      <h2><el-icon><Wallet /></el-icon> 流量消耗器</h2>
      <p>通过不断下载资源来测试或消耗网络流量</p>
    </div>

    <el-row :gutter="20">
      <!-- 左侧：配置面板 -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="always">
          <template #header>
            <span class="card-title">⚙️ 配置设置</span>
          </template>

          <el-form label-position="top" size="large">
            <el-form-item label="目标流量 (MB)">
              <el-input-number
                  v-model.number="config.targetMB"
                  :min="1"
                  :max="10000"
                  style="width: 100%"
                  :disabled="status === 'running' || status === 'starting'"
                  @change="updateConfig('targetMB', config.targetMB)"
              />
            </el-form-item>

            <el-form-item label="并发线程数">
              <el-input-number
                  v-model.number="config.threads"
                  :min="1"
                  :max="20"
                  style="width: 100%"
                  :disabled="status === 'running' || status === 'starting'"
                  @change="updateConfig('threads', config.threads)"
              />
              <div class="form-tip">线程越高速度越快，但可能触发网站防御</div>
            </el-form-item>

            <el-form-item label="资源 URL">
              <el-input
                  v-model="config.resourceUrlInput"
                  placeholder="例如：speed.cloudflare.com/__down?bytes=10485760"
                  :disabled="status === 'running' || status === 'starting'"
                  @change="handleUrlChange"
              >
                <template #prepend>https://</template>
              </el-input>
              <div class="form-tip">推荐使用支持 CORS 的大文件链接</div>
            </el-form-item>

            <div class="action-area">
              <el-button
                  v-if="status !== 'running'"
                  type="primary"
                  size="large"
                  @click="handleStart"
                  :loading="status === 'starting'"
                  style="width: 100%"
              >
                <el-icon><VideoPlay /></el-icon> 开始消耗
              </el-button>

              <el-button
                  v-else
                  type="danger"
                  size="large"
                  @click="handleStop"
                  style="width: 100%"
              >
                <el-icon><VideoPause /></el-icon> 停止任务
              </el-button>

              <el-button
                  @click="handleReset"
                  style="width: 100%; margin-top: 10px"
                  :disabled="status === 'running' || status === 'starting'"
              >
                <el-icon><Refresh /></el-icon> 重置数据
              </el-button>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：监控面板 -->
      <el-col :xs="24" :lg="16">
        <el-card shadow="always">
          <template #header>
            <span class="card-title">📊 实时监控</span>
          </template>

          <div v-if="status === 'idle' && totalDownloaded === 0" class="empty-state">
            <el-empty description="点击左侧'开始消耗'按钮启动任务" :image-size="80" />
          </div>

          <div v-else class="stats-container">
            <el-row :gutter="16" class="stat-row">
              <el-col :span="6">
                <el-statistic title="已消耗流量" :value="totalDownloaded" :formatter="formatSizeFormatter">
                  <template #suffix>/ {{ config.targetMB }} MB</template>
                </el-statistic>
              </el-col>
              <el-col :span="6">
                <el-statistic title="实时速度" :value="currentSpeed" :formatter="formatSpeedFormatter" />
              </el-col>
              <el-col :span="6">
                <el-statistic title="活跃线程" :value="activeThreads" />
              </el-col>
              <el-col :span="6">
                <el-statistic title="状态">
                  <template #default>
                    <el-tag :type="statusTagType">{{ statusText }}</el-tag>
                  </template>
                </el-statistic>
              </el-col>
            </el-row>

            <div class="progress-section">
              <div class="progress-labels">
                <span>进度</span>
                <span>{{ progressPercent.toFixed(2) }}%</span>
              </div>
              <el-progress
                  :percentage="progressPercent"
                  :stroke-width="20"
                  :show-text="false"
                  :color="customProgressColor"
              />
              <div class="time-estimate" v-if="remainingTime">
                预计剩余时间：<el-tag type="info" size="small">{{ remainingTime }}</el-tag>
              </div>
            </div>

            <div class="log-section">
              <el-descriptions title="任务详情" :column="2" border size="small">
                <el-descriptions-item label="开始时间">{{ startTimeStr }}</el-descriptions-item>
                <el-descriptions-item label="平均速度">{{ formatSizeFormatter(avgSpeed) }}/s</el-descriptions-item>
                <el-descriptions-item label="总请求数">{{ requestCount }}</el-descriptions-item>
                <el-descriptions-item label="目标地址">
                  <el-link :href="fullResourceUrl" target="_blank" type="primary" :underline="false">查看链接</el-link>
                </el-descriptions-item>
              </el-descriptions>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { Wallet, VideoPlay, VideoPause, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useTrafficWaster } from './logic'

// 类型定义
interface LocalConfig {
  targetMB: number;
  threads: number;
  resourceUrlInput: string;
}

const { state, start, stop, reset, updateConfig, subscribe, formatSize } = useTrafficWaster()

const config = reactive<LocalConfig>({
  targetMB: state.targetMB,
  threads: state.threads,
  resourceUrlInput: state.resourceUrl.replace('https://', '')
})

const totalDownloaded = ref(0)
const currentSpeed = ref(0)
const activeThreads = ref(0)
const status = ref<typeof state.status>('idle')
const requestCount = ref(0)
const avgSpeed = ref(0)

let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = subscribe((newState) => {
    totalDownloaded.value = newState.totalDownloaded
    currentSpeed.value = newState.currentSpeed
    activeThreads.value = newState.activeThreads
    status.value = newState.status
    config.targetMB = newState.targetMB

    if (newState.startTime) {
      const duration = (Date.now() - newState.startTime) / 1000
      avgSpeed.value = duration > 0 ? newState.totalDownloaded / duration : 0
    }
    requestCount.value = newState.requestCount
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  stop()
})

const formatSizeFormatter = (val: number) => formatSize(val)
const formatSpeedFormatter = (val: number) => `${formatSize(val)}/s`

const progressPercent = computed(() => {
  const target = config.targetMB * 1024 * 1024
  if (target === 0) return 0
  return Math.min(100, (totalDownloaded.value / target) * 100)
})

const statusText = computed(() => {
  const map: Record<string, string> = {
    idle: '就绪', starting: '启动中', running: '运行中',
    stopped: '已暂停', finished: '已完成', error: '出错'
  }
  return map[status.value] || status.value
})

const statusTagType = computed(() => {
  const map: Record<string, any> = {
    idle: 'info', starting: 'primary', running: 'success',
    stopped: 'warning', finished: 'success', error: 'danger'
  }
  return map[status.value] || 'info'
})

const customProgressColor = computed(() => {
  if (progressPercent.value < 50) return '#409EFF'
  if (progressPercent.value < 80) return '#67C23A'
  return '#E6A23C'
})

const remainingTime = computed(() => {
  if (currentSpeed.value <= 0 || status.value === 'finished') return ''
  const remainingBytes = (config.targetMB * 1024 * 1024) - totalDownloaded.value
  if (remainingBytes <= 0) return '0s'
  const seconds = remainingBytes / currentSpeed.value
  if (seconds < 60) return `${Math.ceil(seconds)}秒`
  const mins = Math.floor(seconds / 60)
  const secs = Math.ceil(seconds % 60)
  return `${mins}分${secs}秒`
})

const startTimeStr = computed(() => {
  if (!state.startTime) return '-'
  return new Date(state.startTime).toLocaleTimeString()
})

const fullResourceUrl = computed(() => {
  return config.resourceUrlInput.startsWith('http')
      ? config.resourceUrlInput
      : `https://${config.resourceUrlInput}`
})

const handleUrlChange = () => {
  let url = config.resourceUrlInput
  if (!url.startsWith('http')) {
    url = 'https://' + url
  }
  updateConfig('resourceUrl', url)
}

const handleStart = () => {
  if (!config.resourceUrlInput) {
    ElMessage.warning('请输入资源 URL')
    return
  }
  handleUrlChange()
  requestCount.value = 0
  start()
  ElMessage.success('任务已启动')
}

const handleStop = () => {
  stop()
  ElMessage.info('任务已停止')
}

const handleReset = () => {
  reset()
  ElMessage.success('数据已重置')
}
</script>

<style scoped lang="scss">
.tool-page { max-width: 1200px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h2 { display: flex; align-items: center; gap: 10px; color: #1f2937; }
.page-header p { color: #6b7280; margin-top: 5px; }
.card-title { font-weight: bold; font-size: 1.1rem; }
.form-tip { font-size: 0.8rem; color: #9ca3af; margin-top: 4px; }
.action-area { margin-top: 20px; }
.empty-state { padding: 40px 0; text-align: center; }
.stats-container { animation: fadeIn 0.3s ease-in-out; }
.stat-row { margin-bottom: 20px; }
.progress-section { margin: 20px 0; }
.progress-labels { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; color: #4b5563; }
.time-estimate { text-align: right; margin-top: 8px; font-size: 0.9rem; color: #6b7280; }
.log-section { margin-top: 20px; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>