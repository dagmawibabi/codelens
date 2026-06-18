import type { Severity } from "./schema"

interface SeverityStyle {
  label: string
  /** Tailwind text color class. */
  text: string
  /** Tailwind background tint class (low alpha). */
  bg: string
  /** Tailwind border color class. */
  border: string
  /** Solid dot color class. */
  dot: string
  /** Numeric rank for sorting (higher = more severe). */
  rank: number
}

export const SEVERITY: Record<Severity, SeverityStyle> = {
  critical: {
    label: "Critical",
    text: "text-[color:var(--sev-critical)]",
    bg: "bg-[color:var(--sev-critical)]/12",
    border: "border-[color:var(--sev-critical)]/40",
    dot: "bg-[color:var(--sev-critical)]",
    rank: 6,
  },
  error: {
    label: "Error",
    text: "text-[color:var(--sev-critical)]",
    bg: "bg-[color:var(--sev-critical)]/12",
    border: "border-[color:var(--sev-critical)]/40",
    dot: "bg-[color:var(--sev-critical)]",
    rank: 5,
  },
  high: {
    label: "High",
    text: "text-[color:var(--sev-high)]",
    bg: "bg-[color:var(--sev-high)]/12",
    border: "border-[color:var(--sev-high)]/40",
    dot: "bg-[color:var(--sev-high)]",
    rank: 4,
  },
  warning: {
    label: "Warning",
    text: "text-[color:var(--sev-medium)]",
    bg: "bg-[color:var(--sev-medium)]/12",
    border: "border-[color:var(--sev-medium)]/40",
    dot: "bg-[color:var(--sev-medium)]",
    rank: 3,
  },
  medium: {
    label: "Medium",
    text: "text-[color:var(--sev-medium)]",
    bg: "bg-[color:var(--sev-medium)]/12",
    border: "border-[color:var(--sev-medium)]/40",
    dot: "bg-[color:var(--sev-medium)]",
    rank: 3,
  },
  low: {
    label: "Low",
    text: "text-[color:var(--sev-low)]",
    bg: "bg-[color:var(--sev-low)]/12",
    border: "border-[color:var(--sev-low)]/40",
    dot: "bg-[color:var(--sev-low)]",
    rank: 2,
  },
  info: {
    label: "Info",
    text: "text-[color:var(--sev-info)]",
    bg: "bg-[color:var(--sev-info)]/12",
    border: "border-[color:var(--sev-info)]/40",
    dot: "bg-[color:var(--sev-info)]",
    rank: 1,
  },
}

export function severityStyle(sev: Severity): SeverityStyle {
  return SEVERITY[sev] ?? SEVERITY.info
}

export function bySeverityDesc<T extends { severity: Severity }>(a: T, b: T): number {
  return severityStyle(b.severity).rank - severityStyle(a.severity).rank
}
