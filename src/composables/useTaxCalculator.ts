// src/composables/useTaxCalculator.ts
import { ref } from 'vue'

export const DEDUCTION_STANDARDS: Record<string, number> = {
  child: 24000, // 子女教育 (2000/月 * 12)
  elder: 36000, // 赡养老人 (3000/月 * 12，假设独生子女或约定分摊)
  rent: 18000, // 住房租金 (1500/月 * 12，按一般城市标准)
  loan: 12000, // 住房贷款利息 (1000/月 * 12)
  edu: 4800, // 继续教育 (学历教育 400/月 * 12)
  medical: 0, // 大病医疗 (据实扣除，默认0，需手动填)
}
// 税率表
const TAX_RATES = [
  { threshold: 0, rate: 0.03, quickDeduction: 0 },
  { threshold: 36000, rate: 0.1, quickDeduction: 2520 },
  { threshold: 144000, rate: 0.2, quickDeduction: 16920 },
  { threshold: 300000, rate: 0.25, quickDeduction: 31920 },
  { threshold: 420000, rate: 0.3, quickDeduction: 52920 },
  { threshold: 660000, rate: 0.35, quickDeduction: 85920 },
  { threshold: 960000, rate: 0.45, quickDeduction: 181920 },
]

const DEDUCTION_BASE = 0
// const DEDUCTION_BASE = 60000

export type DeductionRatio = 0 | 0.5 | 1

export interface DeductionItem {
  id: string
  type: 'child' | 'elder' | 'rent' | 'loan' | 'edu' | 'medical'
  amount: number
  isFixed: boolean // 新增：是否固定分配方式，不参与活动计算
  ratio: DeductionRatio // 分配比例 (1=A 100%, 0.5=各50%, 0=B 100%)
}

export interface PersonData {
  name: string
  annualIncome: number
  deductions: DeductionItem[]
}
// 1. 定义单个扣除项的详情
export interface PlanItemDetail {
  id: string
  typeName: string // 如：子女教育
  ratio: DeductionRatio // 1, 0.5, 0
  description: string // 如：主纳税人扣除 100%
  amountA: number // 主纳税人扣除的金额
  amountB: number // 配偶扣除的金额
}

// 2. 定义“一个方案”的结构（包含该方案下的所有项目）
export interface TaxPlan {
  id: number // 方案编号，如 1, 2
  totalTax: number
  items: PlanItemDetail[] // 该方案包含的所有扣除项详情
}

// 3. 修改总结果接口
export interface CalculationResult {
  totalTax: number
  personATax: number
  personBTax: number
  // 这里存放所有并列最优的方案
  optimalPlans: TaxPlan[]
}

export function useTaxCalculator() {
  const personA = ref<PersonData>({
    name: '主纳税人',
    annualIncome: 0,
    deductions: [],
  })

  const personB = ref<PersonData | null>(null)

  const calculateTax = (income: number, deduction: number): number => {
    const taxableIncome = income - deduction
    if (taxableIncome <= 0)
      return 0

    for (let i = TAX_RATES.length - 1; i >= 0; i--) {
      if (taxableIncome > TAX_RATES[i].threshold) {
        return taxableIncome * TAX_RATES[i].rate - TAX_RATES[i].quickDeduction
      }
    }
    return 0
  }

  // 核心修改：生成组合时，排除掉 isFixed 为 true 的项目
  const generateRatioCombinations = (items: DeductionItem[]): Array<Record<string, DeductionRatio>> => {
    // 只筛选出“不固定”的项目进行排列组合
    const movableItems = items.filter(item => !item.isFixed)

    if (movableItems.length === 0)
      return [{}]

    const combinations: Array<Record<string, DeductionRatio>> = []

    const generate = (index: number, current: Record<string, DeductionRatio>) => {
      if (index >= movableItems.length) {
        combinations.push({ ...current })
        return
      }
      const id = movableItems[index].id

      // 尝试三种比例
      current[id] = 1
      generate(index + 1, current)

      current[id] = 0.5
      generate(index + 1, current)

      current[id] = 0
      generate(index + 1, current)
    }

    generate(0, {})
    return combinations
  }

  // 核心计算函数修改
  const calculateOptimalPlan = (): CalculationResult => {
    const allItems = [...personA.value.deductions]
    if (personB.value) {
      allItems.push(...personB.value.deductions)
    }

    // --- 预计算固定项 (保持不变) ---
    let fixedDeductionA = DEDUCTION_BASE
    let fixedDeductionB = DEDUCTION_BASE

    allItems.forEach((item) => {
      if (item.isFixed) {
        if (item.ratio === 1) {
          fixedDeductionA += item.amount
        }
        else if (item.ratio === 0) {
          fixedDeductionB += item.amount
        }
        else { fixedDeductionA += item.amount * 0.5; fixedDeductionB += item.amount * 0.5 }
      }
    })

    const ratioCombinations = generateRatioCombinations(allItems)

    // 临时存储所有计算结果
    const allValidPlans: Array<{
      total: number
      taxA: number
      taxB: number
      combo: Record<string, DeductionRatio>
    }> = []

    // --- 1. 第一轮遍历：计算所有组合的税额 ---
    ratioCombinations.forEach((combo) => {
      let currentDeductionA = fixedDeductionA
      let currentDeductionB = fixedDeductionB

      Object.keys(combo).forEach((id) => {
        const item = allItems.find(i => i.id === id)
        if (item) {
          const ratio = combo[id]
          currentDeductionA += item.amount * ratio
          currentDeductionB += item.amount * (1 - ratio)
        }
      })

      const taxA = calculateTax(personA.value.annualIncome, currentDeductionA)
      const taxB = personB.value ? calculateTax(personB.value.annualIncome, currentDeductionB) : 0
      const total = taxA + taxB

      allValidPlans.push({ total, taxA, taxB, combo })
    })

    // --- 2. 找出最小税额 ---
    const minTax = Math.min(...allValidPlans.map(p => p.total))

    // --- 3. 筛选出所有等于最小税额的方案，并格式化为可读数据 ---
    const bestPlansData: TaxPlan[] = []

    // 过滤出最优方案
    const optimalPlansRaw = allValidPlans.filter(p => p.total === minTax)

    optimalPlansRaw.forEach((plan, index) => {
      const planItems: PlanItemDetail[] = []

      // 将 combo (ID映射) 转换为可读的 Detail 列表
      Object.keys(plan.combo).forEach((id) => {
        const item = allItems.find(i => i.id === id)
        if (!item)
          return

        // 类型名称映射
        const typeMap: Record<string, string> = {
          child: '子女教育',
          elder: '赡养老人',
          rent: '住房租金',
          loan: '住房贷款',
          edu: '继续教育',
          medical: '大病医疗',
        }
        const typeName = typeMap[item.type] || '未知项目'

        // 计算具体金额
        const amountA = item.amount * plan.combo[id]
        const amountB = item.amount * (1 - plan.combo[id])

        // 生成描述
        let desc = ''
        if (plan.combo[id] === 1)
          desc = `主纳税人全额扣除`
        else if (plan.combo[id] === 0)
          desc = `配偶全额扣除`
        else desc = `双方平分扣除`

        planItems.push({
          id: item.id,
          typeName,
          ratio: plan.combo[id],
          description: desc,
          amountA,
          amountB,
        })
      })

      bestPlansData.push({
        id: index + 1, // 方案编号 1, 2, 3...
        totalTax: plan.total,
        items: planItems,
      })
    })

    return {
      totalTax: minTax,
      personATax: optimalPlansRaw[0]?.taxA || 0,
      personBTax: optimalPlansRaw[0]?.taxB || 0,
      optimalPlans: bestPlansData,
    }
  }
  return {
    personA,
    personB,
    calculateOptimalPlan,
  }
}
