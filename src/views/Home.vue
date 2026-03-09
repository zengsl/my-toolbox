<script setup lang="ts">
import { Document, Shop, Wallet } from '@element-plus/icons-vue'
</script>

<template>
  <div class="home-page">
    <div class="header-section">
      <h1>欢迎使用在线工具箱</h1>
      <p>选择下方的工具开始使用，更多功能正在开发中...</p>
    </div>

    <!-- gutter 控制左右间距 -->
    <el-row :gutter="20">
      <!-- 修改点：添加 class="mobile-spacer" -->
      <el-col :xs="24" :sm="12" :md="8" class="mobile-spacer">
        <el-card class="tool-card" shadow="hover" @click="$router.push('/traffic-waster')">
          <template #header>
            <div class="card-header">
              <el-icon :size="24" color="#4f46e5">
                <Wallet />
              </el-icon>
              <span>流量消耗器</span>
            </div>
          </template>
          <div class="card-body">
            <p>设置流量上限，自动下载大文件以消耗指定流量。</p>
            <div class="card-footer">
              <el-tag type="success" size="small">
                立即使用
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="8" class="mobile-spacer">
        <el-card class="tool-card disabled" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon :size="24" color="#9ca3af">
                <Shop />
              </el-icon>
              <span>个税计算器</span>
            </div>
          </template>
          <div class="card-body">
            <p>计算个人所得税及社保公积金扣除。</p>
            <div class="card-footer">
              <el-tag type="info" size="small">
                开发中
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="8" class="mobile-spacer">
        <el-card class="tool-card disabled" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon :size="24" color="#9ca3af">
                <Document />
              </el-icon>
              <span>JSON 格式化</span>
            </div>
          </template>
          <div class="card-body">
            <p>美化、压缩、校验 JSON 数据格式。</p>
            <div class="card-footer">
              <el-tag type="info" size="small">
                开发中
              </el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.home-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 10px; /* 防止整体贴边 */
}

.header-section {
  margin-bottom: 2rem;
  text-align: center;
}
.header-section h1 {
  font-size: 1.8rem;
  color: #1f2937;
  margin-bottom: 0.5rem;
}
.header-section p {
  color: #6b7280;
}

/* 【核心修改】针对 el-col 的移动端间距优化 */
.mobile-spacer {
  /* 桌面端保持默认或微调 */
  margin-bottom: 0;

  /* 手机端专属：增加上下间距 */
  @media (max-width: 768px) {
    margin-top: 10px;    /* 上方留白 */
    margin-bottom: 20px; /* 下方留白，这个值决定卡片之间的疏密 */

    /* 可选：如果 gutter 导致的左右 padding 让卡片太窄，可以在这里微调 width，
       但通常不需要，因为 gutter 已经处理了左右间隙 */
  }
}

.tool-card {
  cursor: pointer;
  transition: all 0.3s ease;
  height: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 12px; /* 增加圆角让视觉更柔和 */

  /* 确保卡片内部也有足够呼吸感 */
  :deep(.el-card__header) {
    padding: 15px 20px;
  }
  :deep(.el-card__body) {
    padding: 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
}

.tool-card:hover:not(.disabled) {
  transform: translateY(-5px);
  border-color: #4f46e5;
  box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.1);
}

.tool-card.disabled {
  opacity: 0.7;
  cursor: not-allowed;
  background-color: #f9fafb;
  &:hover {
    transform: none;
    box-shadow: none;
    border-color: #e5e7eb;
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: bold;
  font-size: 1.1rem;
  color: #1f2937;
}

.card-body p {
  color: #6b7280;
  font-size: 0.9rem;
  line-height: 1.6;
  margin: 0 0 1rem 0; /* 控制段落间距 */
  min-height: 3rem;
}

.card-footer {
  margin-top: auto; /* 让按钮始终在底部 */
}
</style>
