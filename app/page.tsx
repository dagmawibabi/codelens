import { Dashboard } from "@/components/dashboard/dashboard"
import { mockReport, mockHistory } from "@/lib/mock-data"
import { projectInsights } from "@/lib/project-insights"

export default function Page() {
  return <Dashboard report={mockReport} history={mockHistory} insights={projectInsights} />
}
