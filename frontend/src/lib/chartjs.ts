import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
)

export const chartTick = '#94a3b8'
export const chartGrid = '#f1f5f9'
export const chartGreen = '#0b7a3e'
export const chartGreenLight = '#7ec99a'
export const chartGold = '#d4a017'
export const chartBarCoral = '#7ec99a'

/** Category-wise donut: Oil red · Banaspati yellow · Waadi orange · Total green */
export const CATEGORY_COLOR_BY_NAME: Record<string, string> = {
  'Kashmir Cooking Oil': '#dc2626',
  'Kashmir Banaspati': '#eab308',
  'Waadi Banaspati': '#f97316',
  'Total Sales (uncategorized)': '#16a34a',
}

/** Resolve colors for a list of category labels (order matches chart slices). */
export function colorsForCategories(names: string[]): string[] {
  return names.map((name) => CATEGORY_COLOR_BY_NAME[name] ?? chartGreen)
}

/** @deprecated Prefer colorsForCategories — kept for any index-based callers */
export const categoryColors = [
  CATEGORY_COLOR_BY_NAME['Kashmir Cooking Oil'],
  CATEGORY_COLOR_BY_NAME['Kashmir Banaspati'],
  CATEGORY_COLOR_BY_NAME['Waadi Banaspati'],
  CATEGORY_COLOR_BY_NAME['Total Sales (uncategorized)'],
]

export const defaultChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        boxWidth: 12,
        font: { size: 11 },
        color: '#64748b',
      },
    },
    tooltip: {
      backgroundColor: '#fff',
      titleColor: '#0f172a',
      bodyColor: '#334155',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: 10,
      displayColors: true,
    },
  },
} as const
