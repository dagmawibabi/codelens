import type { TrendPoint } from "@/lib/schema"

interface TrendChartProps {
  data: TrendPoint[]
  height?: number
}

/** Compact health-score sparkline area chart over recent runs. */
export function TrendChart({ data, height = 120 }: TrendChartProps) {
  if (data.length < 2) {
    return <div className="text-xs text-muted-foreground">Not enough runs yet to show a trend.</div>
  }

  const width = 100 // viewBox units; scales responsively
  const max = 100
  const min = Math.min(40, ...data.map((d) => d.score)) - 5
  const range = max - min || 1

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.score - min) / range) * height
    return { x, y, d }
  })

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`
  const last = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-[120px] w-full overflow-visible"
      role="img"
      aria-label="Health score trend over recent runs"
    >
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sev-ok)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--sev-ok)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" stroke="var(--sev-ok)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="2.5" fill="var(--sev-ok)" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
