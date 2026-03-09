<script setup lang="ts">
import { House, Shop, Tools, Wallet } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeIndex = computed(() => route.path as string)
</script>

<template>
  <el-container class="layout-container">
    <el-aside width="250px" class="sidebar">
      <div class="logo">
        <el-icon><Tools /></el-icon>
        <span>我的工具箱</span>
      </div>

      <el-menu
        :default-active="activeIndex"
        class="side-menu"
        background-color="#ffffff"
        text-color="#4b5563"
        active-text-color="#4f46e5"
        router
      >
        <el-menu-item index="/">
          <el-icon><House /></el-icon>
          <span>首页</span>
        </el-menu-item>

        <el-menu-item index="/traffic-waster">
          <el-icon><Wallet /></el-icon>
          <span>流量消耗器</span>
        </el-menu-item>

        <el-menu-item index="/tax-calculator" disabled>
          <el-icon><Shop /></el-icon>
          <span>个税计算器 (开发中)</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-main class="main-content">
      <router-view />
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.layout-container {
  height: 100vh;
  background-color: #f3f4f6;
}
.sidebar {
  background: white;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
}
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 1.25rem;
  font-weight: bold;
  color: #4f46e5;
  border-bottom: 1px solid #f3f4f6;
}
.side-menu {
  border-right: none;
  flex: 1;
  padding-top: 10px;
}
.main-content {
  padding: 2rem;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .layout-container { flex-direction: column; }
  .sidebar { width: 100%; height: auto; border-right: none; border-bottom: 1px solid #e5e7eb; }
  .logo { height: 50px; }
  .side-menu { display: flex; flex-direction: row; overflow-x: auto; padding: 10px; }
  .el-menu-item { flex: 0 0 auto; }
}
</style>
