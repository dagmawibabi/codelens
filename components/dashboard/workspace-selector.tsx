"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MonorepoInfo, AggregateHealth } from "@/lib/schema"

interface WorkspaceSelectorProps {
  monorepo: MonorepoInfo
  aggregate: AggregateHealth
  selectedPackage: string | null
  onSelect: (packageName: string | null) => void
}

export function WorkspaceSelector({
  monorepo,
  aggregate,
  selectedPackage,
  onSelect,
}: WorkspaceSelectorProps) {
  return (
    <Select
      value={selectedPackage ?? "__aggregate__"}
      onValueChange={(v) => onSelect(v === "__aggregate__" ? null : v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="All packages" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__aggregate__">
          All packages ({monorepo.packages.length}) — Score: {aggregate.score}
        </SelectItem>
        {aggregate.packageScores.map((ps) => (
          <SelectItem key={ps.name} value={ps.name}>
            {ps.name} — {ps.score} ({ps.grade})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
