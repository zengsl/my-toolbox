<!-- MainLayout.vue -->
<script setup lang="ts">
import { Close, House, Menu as MenuIcon, Shop, Tools, Wallet } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeIndex = computed(() => route.path as string)

// 【核心】动态获取当前页面标题
const currentTitle = computed(() => {
  return route.meta?.title || '我的工具箱'
})

// 移动端菜单开关状态
const isMobileMenuOpen = ref(false)

function toggleMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

function closeMenu() {
  isMobileMenuOpen.value = false
}
</script>

<template>
  <el-container class="layout-container">
    <!-- 侧边栏 (桌面端常驻 / 移动端为抽屉) -->
    <el-aside
      width="250px"
      class="sidebar"
      :class="{ 'mobile-drawer-open': isMobileMenuOpen }"
    >
      <div class="logo">
        <!-- 侧边栏内的标题 (打开抽屉时可见) -->
        <div class="logo-content">
          <el-icon class="logo-icon">
            <Tools />
          </el-icon>
          <span class="logo-text">{{ currentTitle }}</span>
        </div>

        <!-- 移动端关闭按钮 -->
        <el-icon class="close-btn" @click="closeMenu">
          <Close />
        </el-icon>
      </div>

      <el-menu
        :default-active="activeIndex"
        class="side-menu"
        background-color="#ffffff"
        text-color="#4b5563"
        active-text-color="#4f46e5"
        router
        @select="closeMenu"
      >
        <el-menu-item index="/">
          <el-icon><House /></el-icon>
          <span>首页</span>
        </el-menu-item>

        <el-menu-item index="/traffic-waster">
          <el-icon><Wallet /></el-icon>
          <span>流量消耗器</span>
        </el-menu-item>

        <el-menu-item index="/tax-calculator" disabled style="display: none;">
          <el-icon><Shop /></el-icon>
          <span>个税计算器 (开发中)</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 移动端遮罩层 -->
    <transition name="fade">
      <div v-if="isMobileMenuOpen" class="mobile-mask" @click="closeMenu" />
    </transition>

    <el-main class="main-content">
      <!-- ✅ 移动端顶部栏：现在包含 [汉堡按钮] + [动态标题] + [占位] -->
      <div class="mobile-header">
        <!-- 左侧：汉堡按钮 -->
        <el-icon class="hamburger-btn" @click="toggleMenu">
          <MenuIcon />
        </el-icon>

        <!-- 中间：动态标题 (关键修改) -->
        <div class="mobile-title-wrapper">
          <span class="mobile-title-text">{{ currentTitle }}</span>
        </div>

        <!-- 右侧：占位符 (为了保持标题绝对居中，宽度需与左侧按钮区域一致) -->
        <div class="spacer" />
      </div>

      <div class="page-view">
        <router-view />
      </div>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.layout-container {
  height: 100vh;
  background-color: #f3f4f6;
  position: relative;
  overflow: hidden;
}

/* --- 桌面端默认样式 --- */
.sidebar {
  background: white;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  font-size: 1.1rem;
  font-weight: bold;
  color: #4f46e5;
  border-bottom: 1px solid #f3f4f6;
  position: relative;

  .logo-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 1;
    min-width: 0;

    .logo-icon {
      font-size: 1.4rem;
      flex-shrink: 0;
    }

    .logo-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
      text-align: center;
    }
  }

  .close-btn {
    display: none;
    position: absolute;
    right: 16px;
    font-size: 20px;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    &:hover {
      color: #ef4444;
      background-color: #fee2e2;
    }
  }
}

.side-menu {
  border-right: none;
  flex: 1;
  padding-top: 10px;
  overflow-y: auto;
}

.main-content {
  padding: 2rem;
  overflow-y: auto;
  position: relative;
  display: flex;
  flex-direction: column;
}

.mobile-header {
  display: none; /* 桌面端隐藏 */
}

.page-view {
  flex: 1;
  overflow-y: auto;
}

/* 遮罩层动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.mobile-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
  backdrop-filter: blur(2px);
}

/* --- 移动端适配 (< 768px) --- */
@media (max-width: 768px) {
  .layout-container {
    display: block;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 85%;
    max-width: 300px;
    height: 100vh;
    transform: translateX(-100%);
    box-shadow: 2px 0 12px rgba(0,0,0,0.15);
    z-index: 101;
  }

  .sidebar.mobile-drawer-open {
    transform: translateX(0);
  }

  .logo {
    justify-content: center;
    padding: 0 16px;
    height: 56px;

    .logo-content {
      .logo-text {
        max-width: 180px;
        font-size: 1rem;
      }
    }

    .close-btn {
      display: block;
      position: absolute;
      right: 12px;
    }
  }

  .main-content {
    padding: 0;
    margin-left: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ✅ 移动端顶部栏样式更新 */
  .mobile-header {
    display: flex;
    height: 50px; /* 稍微调整高度以适应内容 */
    background: white;
    border-bottom: 1px solid #e5e7eb;
    align-items: center;
    /* 不再使用 space-between，而是手动控制左右宽度和中间 flex */
    justify-content: flex-start;
    padding: 0 12px;
    position: sticky;
    top: 0;
    z-index: 90;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);

    .hamburger-btn {
      font-size: 24px;
      color: #4b5563;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      flex-shrink: 0;
      /* 固定左侧按钮区域的宽度，以便计算居中 */
      width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      &:active {
        background-color: #f3f4f6;
      }
    }

    /* 中间标题容器 */
    .mobile-title-wrapper {
      flex: 1; /* 占据剩余空间 */
      display: flex;
      justify-content: center; /* 内容居中 */
      align-items: center;
      min-width: 0; /* 允许压缩 */
      padding: 0 8px; /* 与按钮的间距 */

      .mobile-title-text {
        font-weight: 600;
        color: #4f46e5;
        font-size: 1rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        text-align: center;
      }
    }

    /* 右侧占位符 */
    .spacer {
      /* 宽度必须与左侧 .hamburger-btn 的总占用宽度一致 (width + padding) */
      /* 这里 btn width 32px, 容器 padding 0, 所以设为 32px 即可保证标题视觉居中 */
      width: 32px;
      flex-shrink: 0;
    }
  }

  .page-view {
    padding: 12px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    height: 100%;
  }
}
</style>
