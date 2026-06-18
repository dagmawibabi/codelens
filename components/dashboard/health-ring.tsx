interface HealthRingProps {
  score: number
  grade: string
  size?: number
}

/** Circular gauge for the composite health score. */
export function HealthRing({ score, grade, size = 160 }: HealthRingProps) {
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  // Color shifts with score: green → amber → red.
  const color =
    score >= 80
      ? "var(--sev-ok)"
      : score >= 60
        ? "var(--sev-medium)"
        : score >= 40
          ? "var(--sev-high)"
          : "var(--sev-critical)"

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-4xl font-semibold tabular-nums" style={{ color }}>
          {score}
        </span>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Grade {grade}
        </span>
      </div>
    </div>
  )
}
