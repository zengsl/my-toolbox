<!-- src/components/TaxOptimizer.vue -->
<script setup lang="ts">
import type { CalculationResult } from '@/composables/useTaxCalculator'
import { ref } from 'vue'
import { DEDUCTION_STANDARDS, useTaxCalculator } from '@/composables/useTaxCalculator'

const { personA, personB, calculateOptimalPlan } = useTaxCalculator()
const result = ref<CalculationResult>({
  totalTax: 0,
  personATax: 0,
  personBTax: 0,
  optimalPlans: [],
})

// 当前选中的方案索引
const currentPlanIndex = ref(0)

// 计算如果不优化会交多少税（用于显示省了多少钱）
const baseTax = computed(() => {
  // 这里简单模拟一下，实际逻辑可能更复杂
  // 假设所有项目都默认给 A 的情况
  return 0
})

// 获取比例显示的类名
function getRatioClass(ratio: number) {
  if (ratio === 1)
    return 'full'
  if (ratio === 0.5)
    return 'half'
  return 'zero'
}

// 获取比例显示的文本
function getRatioText(ratio: number) {
  if (ratio === 1)
    return '100%'
  if (ratio === 0.5)
    return '50%'
  return '0%'
}

function handleCalculate() {
  result.value = calculateOptimalPlan()
  currentPlanIndex.value = 0 // 重置到第一个方案
}

const isCalculating = ref(false)

// 专项附加扣除类型映射
// const deductionTypes = [
//   { value: 'child', label: '子女教育/婴幼儿照护', defaultAmount: 24000 },
//   { value: 'elder', label: '赡养老人', defaultAmount: 36000 },
//   { value: 'rent', label: '住房租金', defaultAmount: 18000 },
//   { value: 'loan', label: '住房贷款利息', defaultAmount: 12000 },
//   { value: 'edu', label: '继续教育', defaultAmount: 4800 },
//   { value: 'medical', label: '大病医疗', defaultAmount: 0 },
// ]
const deductionTypes = [
  { label: '子女教育', value: 'child' },
  { label: '赡养老人', value: 'elder' },
  { label: '住房租金', value: 'rent' },
  { label: '住房贷款', value: 'loan' },
  { label: '继续教育', value: 'edu' },
  { label: '大病医疗', value: 'medical' }, // 这个默认是0，需手动填
]

// 核心函数：切换类型时更新金额
function updateAmountByType(item: any) {
  const standardAmount = DEDUCTION_STANDARDS[item.type]
  if (standardAmount !== undefined) {
    item.amount = standardAmount
  }
}

// 添加扣除项
/* function addDeduction(target: 'personA' | 'personB') {
  const person = target === 'personA' ? personA.value : personB.value!
  person.deductions.push({
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    type: 'child',
    amount: 12000,
    isFixed: false,
    ratio: 1,
  })
} */
function addDeduction(person: 'personA' | 'personB', type: string = 'child') {
  const target = person === 'personA' ? personA.value : personB.value
  console.log('addDeduction', person, type)
  // 新增逻辑：从字典获取默认金额，如果字典里没有（比如大病医疗），则默认为 0
  const defaultAmount = DEDUCTION_STANDARDS[type] || 0

  target.deductions.push({
    id: Math.random().toString(36).substr(2, 9),
    type: type as any,
    amount: defaultAmount, // 使用默认值
    isFixed: false, // 默认不锁定
    ratio: 1, // 默认先给主纳税人
  })
}

// 移除扣除项
function removeDeduction(target: 'personA' | 'personB', index: number) {
  const person = target === 'personA' ? personA.value : personB.value!
  person.deductions.splice(index, 1)
}

// 切换模式
function toggleMode() {
  if (personB.value) {
    personB.value = null
  }
  else {
    personB.value = {
      name: '配偶',
      annualIncome: 0,
      deductions: [],
    }
  }
  result.value = null
}

// 执行计算
function runCalculation() {
  isCalculating.value = true
  // 模拟一点延迟增加交互感
  setTimeout(() => {
    result.value = calculateOptimalPlan()
    isCalculating.value = false
    // 滚动到结果区域
    setTimeout(() => {
      document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }, 400)
}

// 控制提示面板的展开/折叠
const isTipsOpen = ref(false)

// 定义 Tooltip 组件 (直接写在 script setup 里)
const Tooltip = defineComponent({
  props: {
    content: { type: String, required: true },
  },
  setup(props, { slots }) {
    const show = ref(false)
    return () => h('div', {
      class: 'tooltip-wrapper',
      onMouseenter: () => {
        show.value = true
      },
      onMouseleave: () => {
        show.value = false
      },
    }, [
      // 默认插槽：触发元素 (这里是按钮)
      slots.default && slots.default(),
      // Tooltip 弹窗
      show.value && h('div', { class: 'tooltip-popup' }, props.content),
    ])
  },
})
</script>

<template>
  <div class="tax-toolbox-container">
    <header class="toolbox-header">
      <div class="header-icon">
        💰
      </div>
      <div class="header-text">
        <h1>个税优化工具</h1>
        <p>智能计算夫妻/个人最佳抵扣方案</p>
      </div>
    </header>

    <!-- 模式切换 -->
    <div class="mode-switch-card">
      <label class="switch-label">
        <div class="switch-track">
          <input
            type="checkbox"
            :checked="!!personB"
            class="switch-input"
            @change="toggleMode"
          >
          <span class="switch-handle" />
        </div>
        <span class="switch-text">
          启用 <strong>夫妻双方</strong> 计算模式
        </span>
      </label>

      <!-- 规则说明按钮 -->
      <div class="rules-popover">
        <button class="rules-btn">
          <span class="icon">📖</span> 规则
        </button>
        <!-- 悬浮内容 -->
        <div class="rules-content">
          <h4>💡 填写与计算规则</h4>
          <ul>
            <li><b>收入填写：</b>扣除五险一金和年终奖后的金额；年终奖单独计算功能后续增加🤪</li>
            <li><b>自动计算：</b>系统会自动尝试所有组合，寻找家庭总税额最低的方案🤡</li>
            <li><b>锁定功能：</b>点击项目后的 🔒 图标，可强制指定由谁扣除😏</li>
            <li><b>公共项目：</b>子女教育、房贷等通常建议由收入较高的一方 100% 扣除🧐</li>
            <li><b>补税功能：</b>后续增加🤓</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-grid">
      <!-- 个人/一方 -->
      <section class="person-card">
        <div class="card-header">
          <h2>{{ personA.name }}</h2>
          <span class="badge">主纳税人</span>
        </div>

        <div class="form-group">
          <label>年度应纳税所得额 (元)(扣除五险一金)</label>
          <div class="input-wrapper">
            <span class="input-prefix">¥</span>
            <input
              v-model.number="personA.annualIncome"
              type="number"
              placeholder="0.00"
              class="form-input"
            >
          </div>
          <!--          <p class="helper-text">
            指扣除五险一金后的年收入
          </p> -->
        </div>

        <div class="deductions-section">
          <div class="section-header">
            <h3>家庭专项附加扣除 (统一管理)</h3>
            <button
              class="btn-add"
              @click="addDeduction('personA')"
            >
              + 添加项目
            </button>
          </div>

          <div class="deduction-list">
            <div
              v-for="(item, index) in personA.deductions"
              :key="item.id"
              class="deduction-item"
            >
              <div class="deduction-row">
                <select
                  v-model="item.type" class="form-select"
                  @change="updateAmountByType(item)"
                >
                  <option
                    v-for="type in deductionTypes"
                    :value="type.value"
                  >
                    {{ type.label }}
                  </option>
                </select>
                <div class="input-group-sm">
                  <span>¥</span>
                  <input
                    v-model.number="item.amount"
                    type="number"
                    placeholder="金额"
                    class="form-input-sm"
                  >
                </div>
              </div>

              <!-- 在 deduction-item 内部 -->
              <div class="deduction-actions">
                <!-- 比例选择 -->
                <div class="ratio-control">
                  <select v-model="item.ratio" class="form-select-ratio">
                    <option :value="1">
                      我(100%)
                    </option>
                    <option :value="0.5">
                      各(50%)
                    </option>
                    <option :value="0">
                      配偶(100%)
                    </option>
                  </select>

                  <!-- 锁定按钮：点击切换 isFixed 状态 -->
                  <!--                  <button
                    class="btn-lock-toggle"
                    :class="{ 'is-locked': item.isFixed }"
                    :title="item.isFixed ? '点击解锁以参与自动计算' : '点击锁定此比例'"
                    @click="item.isFixed = !item.isFixed"
                  >
                    {{ item.isFixed ? '🔒' : '🔓' }}
                  </button> -->
                  <!-- 新的代码 -->
                  <div class="lock-tooltip">
                    <button
                      class="btn-lock-toggle"
                      :class="{ 'is-locked': item.isFixed }"
                      @click="item.isFixed = !item.isFixed"
                    >
                      {{ item.isFixed ? '🔒' : '🔓' }}
                    </button>
                    <!-- 提示文字 -->
                    <span class="tooltip-text">
                      {{ item.isFixed ? '已锁定：计算时保持此比例不变' : '未锁定：允许系统自动优化此比例' }}
                    </span>
                  </div>
                </div>

                <button class="btn-icon-delete" @click="removeDeduction('personA', index)">
                  ✕
                </button>
              </div>
            </div>

            <div v-if="personA.deductions.length === 0" class="empty-state">
              暂无扣除项
            </div>
          </div>
        </div>
      </section>

      <!-- 配偶 (仅在双人模式显示) -->
      <section
        v-if="personB"
        class="person-card secondary"
      >
        <div class="card-header">
          <h2>{{ personB.name }}</h2>
          <span class="badge secondary">配偶</span>
        </div>

        <div class="form-group">
          <label>年度应纳税所得额 (元)</label>
          <div class="input-wrapper">
            <span class="input-prefix">¥</span>
            <input
              v-model.number="personB.annualIncome"
              type="number"
              placeholder="0.00"
              class="form-input"
            >
          </div>
        </div>

        <div class="deductions-section">
          <div class="section-header">
            <h3>配偶独有扣除项</h3>
            <div class="custom-tooltip">
              <span class="tooltip-icon">ℹ️</span>
              <span class="tooltip-text">公共项目（如子女、房贷）请在主纳税人处统一添加</span>
            </div>
            <!-- 注意：这里不再提供添加公共项目的按钮，或者只允许添加特定类型 -->
            <button
              class="btn-add"
              @click="addDeduction('personB')"
            >
              + 添加独有项
            </button>
          </div>

          <div class="deduction-list">
            <div
              v-for="(item, index) in personB.deductions"
              :key="item.id"
              class="deduction-item"

              @change="updateAmountByType(item)"
            >
              <!-- B 的列表项 -->
              <!-- 这里可以简化，因为 B 的列表通常只放 B 独有的，默认就是 B 100% -->
              <div class="deduction-row">
                <select v-model="item.type" class="form-select">
                  <option
                    v-for="type in deductionTypes"
                    :key="type.value"
                    :value="type.value"
                  >
                    {{ type.label }}
                  </option>
                </select>
                <div class="input-group-sm">
                  <span>¥</span>
                  <input
                    v-model.number="item.amount"
                    type="number"
                    placeholder="金额"
                    class="form-input-sm"
                  >
                </div>
              </div>

              <div class="deduction-actions">
                <span class="text-xs text-gray-500 font-medium">
                  默认由 {{ personB.name }} 100% 扣除
                </span>
                <button
                  class="btn-icon-delete"
                  @click="removeDeduction('personB', index)"
                >
                  ✕
                </button>
              </div>
            </div>
            <div v-if="personB.deductions.length === 0" class="empty-state">
              暂无配偶独有扣除项
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 计算按钮 -->
    <div class="action-area">
      <button
        :disabled="isCalculating"
        class="btn-primary"
        @click="runCalculation"
      >
        <span v-if="isCalculating" class="spinner" />
        {{ isCalculating ? '计算中...' : '🚀 计算最优方案' }}
      </button>
    </div>

    <!-- 结果展示 -->
    <transition name="fade-up">
      <!-- 结果展示区域 -->
      <div v-if="result.optimalPlans.length > 0" class="result-card">
        <div class="result-header">
          <h2>📊 最优节税方案建议</h2>
          <div class="tax-badge">
            预计家庭总纳税: <span>¥ {{ result.totalTax.toLocaleString() }}</span>
          </div>
        </div>

        <!-- 方案列表：垂直排列 -->
        <div class="plans-vertical-list">
          <!-- 遍历所有最优方案 -->
          <div
            v-for="(plan, index) in result.optimalPlans"
            :key="plan.id"
            class="plan-group"
          >
            <!-- 方案标题 -->
            <div class="plan-header">
              <div class="plan-title">
                <span class="badge-number">{{ index + 1 }}</span>
                <span>方案 {{ index + 1 }}</span>
              </div>
              <div class="plan-meta">
                预计节税 <span class="highlight">¥{{ (baseTax - result.totalTax).toLocaleString() }}</span>
              </div>
            </div>

            <!-- 方案详情表格/列表 -->
            <div class="plan-details">
              <!-- 表头 -->
              <div class="detail-header">
                <span class="col-name">扣除项目</span>
                <span class="col-ratio">分配比例</span>
                <span class="col-main">主扣除人</span>
              </div>

              <!-- 项目列表 -->
              <div class="detail-body">
                <div
                  v-for="item in plan.items"
                  :key="item.id"
                  class="detail-row"
                >
                  <!-- 项目名称 -->
                  <div class="col-name">
                    {{ item.typeName }}
                  </div>

                  <!-- 分配比例 -->
                  <div class="col-ratio">
                    <span class="ratio-badge" :class="getRatioClass(item.ratio)">
                      {{ getRatioText(item.ratio) }}
                    </span>
                  </div>

                  <!-- 主扣除人 -->
                  <div class="col-main">
                    <!-- 如果比例是 1，主纳税人是主扣除人 -->
                    <span v-if="item.ratio === 1" class="person-tag main">
                      👤 主纳税人
                    </span>
                    <!-- 如果比例是 0，配偶是主扣除人 -->
                    <span v-else-if="item.ratio === 0" class="person-tag spouse">
                      👥 配偶
                    </span>
                    <!-- 如果是 0.5，显示共同 -->
                    <span v-else class="person-tag shared">
                      ⚖️ 共同承担
                    </span>
                  </div>
                </div>
              </div>

              <!-- 如果没有项目 -->
              <div v-if="plan.items.length === 0" class="empty-plan">
                无专项附加扣除项目
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* --- 基础变量 --- */
:global(:root) {
  --primary-color: #2563eb;
  --primary-hover: #1d4ed8;
  --success-color: #10b981;
  --success-hover: #059669; /* 稍微深一点的绿色用于悬停 */
  --bg-color: #f8fafc;
  --card-bg: #ffffff;
  --text-main: #1e293b;
  --text-secondary: #64748b;
  --border-color: #e2e8f0;
  --danger-color: #ef4444;
}

/* --- 容器与布局 --- */
.tax-toolbox-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text-main);
  background-color: var(--bg-color);
  min-height: 100vh;
  box-sizing: border-box;
}

/* --- 头部 --- */
.toolbox-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.header-icon {
  font-size: 2.5rem;
  background: #eff6ff;
  padding: 0.75rem;
  border-radius: 1rem;
  line-height: 1;
}

.header-text h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: -0.025em;
}

.header-text p {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* --- 模式切换卡片 --- */
.mode-switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between; /* 让开关和规则按钮分居两端 */
  background: #fff;
  padding: 1rem 1.5rem;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
}
/* --- 开关轨道 --- */
.switch-track {
  width: 52px;
  height: 28px;
  background-color: #e2e8f0; /* 默认灰色背景 */
  border-radius: 999px;
  position: relative;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
}

/* --- 开关手柄 --- */
.switch-handle {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  background-color: #fff;
  border-radius: 50%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* --- 选中状态：改变轨道颜色 --- */
/* 当 input 被选中时，轨道变成渐变蓝紫色 */
.switch-input:checked + .switch-handle {
  /* 移动手柄 */
  transform: translateX(24px);
}

/* 这里我们需要利用 input:checked 来改变 track 的背景
   注意：HTML结构中 input 在 track 内部，所以选择器要调整
   或者直接在 label 上加状态样式
*/

/* 修正选择器逻辑：因为 input 在 track 里面，我们用 label 来控制颜色更稳妥 */
.switch-label:has(.switch-input:checked) .switch-track {
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); /* 蓝紫渐变 */
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.4); /* 发光效果 */
}

/* 选中时：改变手柄颜色（可选，保持白色更清爽） */
.switch-label:has(.switch-input:checked) .switch-handle {
  background-color: #fff;
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.4);
}

.switch-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-input:checked + .switch-handle {
  transform: translateX(20px);
}

.switch-input:checked ~ .switch-track {
  background: var(--primary-color);
}

.switch-text {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-main);
}

/* --- 输入网格 --- */
.input-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

@media (min-width: 768px) {
  .input-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* --- 个人卡片 --- */
.person-card {
  background: var(--card-bg);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  border: 1px solid var(--border-color);
  transition: transform 0.2s, box-shadow 0.2s;
}

.person-card:hover {
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

.person-card.secondary {
  background: #fafafa;
  border-color: #e2e8f0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.card-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: #dbeafe;
  color: #1e40af;
  font-weight: 600;
}

.badge.secondary {
  background: #e2e8f0;
  color: #475569;
}

/* --- 表单元素 --- */
.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-main);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-prefix {
  position: absolute;
  left: 1rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.helper-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

/* --- 扣除项列表 --- */
.deductions-section {
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--border-color);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.btn-add {
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add:hover {
  background: #eff6ff;
}

.deduction-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.deduction-item {
  background: white;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.deduction-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.form-select {
  flex: 2;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background-color: white;
}

.input-group-sm {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.input-group-sm span {
  position: absolute;
  left: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.form-input-sm {
  width: 100%;
  padding: 0.5rem 0.5rem 0.5rem 1.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.deduction-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-icon-delete {
  background: none;
  border: none;
  color: var(--danger-color);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 0.25rem;
  line-height: 1;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  padding: 1rem;
}

/* --- 操作区域 --- */
.action-area {
  text-align: center;
  margin-bottom: 3rem;
}

.btn-primary {
  background: var(--success-color);
  color: white;
  border: none;
  padding: 1rem 3rem;
  border-radius: 0.75rem;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary:hover {
  background: #059669;
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3);
}

.btn-primary:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* --- 结果展示 --- */
.result-card {
  background: var(--card-bg);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  border: 1px solid var(--border-color);
  animation: slideUp 0.5s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.result-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.result-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.result-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  font-weight: 600;
}

.result-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 2rem;
}

@media (min-width: 640px) {
  .result-grid {
    grid-template-columns: 2fr 1fr 1fr;
  }
}

.stat-box {
  padding: 1.25rem;
  border-radius: 0.75rem;
  background: #f8fafc;
  border: 1px solid var(--border-color);
}

.stat-box.main {
  background: #ecfdf5;
  border-color: #a7f3d0;
  grid-column: span 1;
}

@media (min-width: 640px) {
  .stat-box.main {
    grid-column: span 2;
  }
}

.stat-label {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.stat-value {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: #059669;
  line-height: 1.2;
}

.stat-value-sm {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-main);
}

.plan-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.plan-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
}

.plan-icon {
  color: var(--success-color);
  font-weight: bold;
  font-size: 1.2rem;
}

.plan-text {
  font-size: 0.9rem;
  color: var(--text-main);
}

.text-a {
  color: #2563eb;
  font-weight: 600;
}

.text-b {
  color: #7c3aed;
  font-weight: 600;
}

/* --- 动画 --- */
.fade-up-enter-active,
.fade-up-leave-active {
  transition: all 0.5s ease;
}

.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* 比例控制容器 */
.ratio-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1; /* 让它占据剩余空间 */
}

/* 锁定按钮样式 */
.btn-lock-toggle {
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  line-height: 1;
}

/* 锁定状态的高亮样式 */
.btn-lock-toggle.is-locked {
  background-color: #fff7ed; /* 浅橙色背景 */
  border-color: #f97316; /* 橙色边框 */
  color: #c2410c;
  box-shadow: 0 0 0 1px #f97316;
}

.btn-lock-toggle:hover {
  background-color: #f1f5f9;
}

/* --- 工具提示样式修复 --- */
.custom-tooltip {
  position: relative; /* 关键：作为提示框的定位基准 */
  display: inline-flex;
  align-items: center;
  margin-right: auto; /* 把按钮推到右边 */
  cursor: help; /* 鼠标变成问号 */
}

.tooltip-icon {
  font-size: 16px; /* 强制固定大小，不再继承父级的大字体 */
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  margin-right: 0.5rem;
  border-radius: 50%;
  background: #f1f5f9;
  font-weight: bold;
}

/* --- 提示文本 --- */
.tooltip-text {
  visibility: hidden; /* 默认隐藏 */
  opacity: 0;
  width: 240px;
  background-color: #1e293b; /* 深色背景 */
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 10px;
  position: absolute;
  z-index: 9999 !important; /* 强制最高层级 */
  bottom: 150%; /* 显示在上方 */
  left: 50%;
  transform: translateX(-50%); /* 居中修正 */
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  transition: opacity 0.3s;
  pointer-events: none; /* 防止鼠标闪烁 */
  font-weight: normal;
}

/* --- 小三角 --- */
.tooltip-text::after {
  content: " ";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #1e293b transparent transparent transparent;
}

/* --- 悬停显示 --- */
.custom-tooltip:hover .tooltip-text {
  visibility: visible;
  opacity: 1;
}

/* 小三角 */
.custom-tooltip:hover .tooltip-text::after {
  content: " ";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #334155 transparent transparent transparent;
}

/* --- 确保 Select 显示正常 --- */
.form-select {
  flex: 2;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background-color: white;
  color: var(--text-main);
  min-width: 0; /* 防止 flex 溢出 */
}

/* 配偶卡片特有的样式调整 */
.person-card.secondary .section-header {
  flex-wrap: wrap; /* 允许换行 */
  gap: 0.5rem;
}

/* --- 方案 Tabs --- */
.plans-tabs {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

.tab-btn {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 600;
  color: #64748b;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.tab-btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.tab-btn.active {
  background: var(--primary-color); /* 假设你定义了主色调 */
  color: white;
  border-color: var(--primary-color);
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
}

.tab-sub {
  font-size: 0.75rem;
  opacity: 0.9;
  font-weight: normal;
}

/* --- 方案详情卡片 --- */
.plan-detail-card {
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 1.5rem;
  border: 1px solid #e2e8f0;
}

.plan-detail-card h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  color: #334155;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.75rem;
}

/* --- 详情列表 --- */
.detail-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 1rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* --- 垂直列表容器 --- */
.plans-vertical-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 1.5rem;
}

/* --- 单个方案组 --- */
.plan-group {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}

.plan-group:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* --- 方案头部 --- */
.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.plan-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 700;
  color: #1e293b;
  font-size: 1.1rem;
}

.badge-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--primary-color); /* 你的主题色 */
  color: white;
  border-radius: 50%;
  font-size: 0.8rem;
  font-weight: 800;
}

.plan-meta {
  font-size: 0.85rem;
  color: #64748b;
}

.plan-meta .highlight {
  color: #10b981; /* 绿色 */
  font-weight: 700;
}

/* --- 详情表格区域 --- */
.plan-details {
  padding: 0;
}

.detail-header {
  display: grid;
  grid-template-columns: 2fr 1fr 1.5fr; /* 3列布局 */
  padding: 0.75rem 1.5rem;
  background: #f1f5f9;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  font-weight: 700;
  border-bottom: 1px solid #e2e8f0;
}

.detail-body {
  display: flex;
  flex-direction: column;
}

.detail-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1.5fr;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  align-items: center;
  transition: background 0.2s;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row:hover {
  background: #f8fafc;
}

/* --- 列样式 --- */
.col-name {
  font-weight: 600;
  color: #334155;
  font-size: 0.95rem;
}

.col-ratio {
  display: flex;
  justify-content: center;
}

/* 比例标签 */
.ratio-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.ratio-badge.full {
  background: #dbeafe;
  color: #1e40af;
}

/* 蓝色 */
.ratio-badge.half {
  background: #fef3c7;
  color: #92400e;
}

/* 黄色 */
.ratio-badge.zero {
  background: #f1f5f9;
  color: #64748b;
}

/* 灰色 */

.col-main {
  display: flex;
  justify-content: flex-start;
}

/* 人员标签 */
.person-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid transparent;
}

.person-tag.main {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}

.person-tag.spouse {
  background: #fdf4ff;
  color: #a21caf;
  border-color: #f0abfc;
}

.person-tag.shared {
  background: #f0fdf4;
  color: #15803d;
  border-color: #86efac;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .detail-header {
    display: none;
  }

  /* 隐藏表头 */
  .detail-row {
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 1rem;
    border-bottom: 2px solid #f1f5f9;
  }

  .col-name {
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }

  .col-ratio {
    justify-content: flex-start;
  }

  .col-main {
    justify-content: flex-start;
  }
}

.rules-popover {
  position: relative; /* 关键：定位基准 */
}

.rules-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.rules-btn:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #1e293b;
}

.rules-btn .icon {
  font-size: 1.1rem;
}

/* 悬浮内容面板 */
.rules-content {
  visibility: hidden;
  opacity: 0;
  position: absolute;
  top: 100%; /* 在按钮下方 */
  right: 0;  /* 右对齐 */
  z-index: 100;
  margin-top: 0.75rem;
  width: 320px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.25rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  text-align: left;
  transition: all 0.3s ease;
  transform: translateY(10px);
}

/* 小三角 */
.rules-content::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 20px;
  width: 12px;
  height: 12px;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  border-top: 1px solid #e2e8f0;
  transform: rotate(45deg);
}

/* 列表样式 */
.rules-content h4 {
  margin: 0 0 1rem 0;
  color: #1e293b;
  font-size: 1rem;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.75rem;
}

.rules-content ul {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.7;
}

.rules-content li {
  margin-bottom: 0.5rem;
}

/* 悬停显示 */
.rules-popover:hover .rules-content {
  visibility: visible;
  opacity: 1;
  transform: translateY(0);
}

/* =========================================
   3. 锁定按钮悬浮提示
   ========================================= */
.lock-tooltip {
  position: relative;
  display: inline-block;
}

.lock-tooltip .tooltip-text {
  visibility: hidden;
  width: 220px;
  background-color: #1e293b;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 10px;
  position: absolute;
  z-index: 1000;
  bottom: 125%; /* 在上方 */
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.8rem;
  line-height: 1.5;
  opacity: 0;
  transition: opacity 0.2s;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
  pointer-events: none; /* 防止闪烁 */
}

/* 小三角 */
.lock-tooltip .tooltip-text::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: #1e293b transparent transparent transparent;
}

/* 悬停显示 */
.lock-tooltip:hover .tooltip-text {
  visibility: visible;
  opacity: 1;
}
</style>
