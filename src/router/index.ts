import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'Home',
        component: () => import('../views/Home.vue'),
        meta: { title: '首页' },
      },
      {
        path: 'traffic-waster',
        name: 'TrafficWaster',
        component: () => import('../views/TrafficWaster/index.vue'),
        meta: { title: '流量消耗器' },
      },
      // 未来扩展
      // {
      //   path: 'tax-calculator',
      //   name: 'TaxCalculator',
      //   component: () => import('../views/TaxCalculator/index.vue'),
      //   meta: { title: '个税计算器' }
      // }
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - 我的工具箱` : '我的工具箱'
  next()
})

export default router
