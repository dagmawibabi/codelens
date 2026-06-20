// Builds the Next.js dashboard as a static bundle and copies it into
// `cli/public`, so the CLI can serve it offline with zero runtime deps.
//
// Run from the cli/ package: `npm run build:dashboard`
import { execSync } from "node:child_process"
import { cpSync, rmSync, existsSync, renameSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const cliRoot = resolve(here, "..")
const dashboardRoot = resolve(cliRoot, "..") // the Next.js app lives one level up
const exportDir = join(dashboardRoot, "out")
const publicDir = join(cliRoot, "public")

// The CLI serves the dashboard as a static bundle and provides its own HTTP
// server for the runtime endpoints it needs (/api/run, /api/state, /api/latest,
// /api/history, /api/insights, /ws). Next's `app/api` route handlers are only
// used by the dev/preview deployment and CANNOT be part of a static export
// (`output: export` rejects all dynamic route handlers). So we temporarily move
// `app/api` aside for the duration of the export build, then restore it.
const apiDir = join(dashboardRoot, "app", "api")
const apiStash = join(dashboardRoot, "app", "_api.export-stash")
let apiStashed = false

function restoreApi() {
  if (apiStashed && existsSync(apiStash)) {
    rmSync(apiDir, { recursive: true, force: true })
    renameSync(apiStash, apiDir)
    apiStashed = false
  }
}

console.log("[Projectlens] Building dashboard (static export)...")
const nextBin = join(dashboardRoot, "node_modules", ".bin", "next")

try {
  if (existsSync(apiDir)) {
    renameSync(apiDir, apiStash)
    apiStashed = true
    console.log("[Projectlens] Excluded app/api from the static export.")
  }

  execSync(`"${nextBin}" build`, {
    cwd: dashboardRoot,
    stdio: "inherit",
    env: { ...process.env, PROJECTLENS_EXPORT: "1" },
  })
} finally {
  // Always put the API routes back, even if the build fails.
  restoreApi()
}

if (!existsSync(exportDir)) {
  console.error(
    `[Projectlens] Expected static export at ${exportDir} but it was not found.`,
  )
  process.exit(1)
}

console.log("[Projectlens] Copying dashboard into CLI package...")
rmSync(publicDir, { recursive: true, force: true })
cpSync(exportDir, publicDir, { recursive: true })

console.log("[Projectlens] Dashboard bundled at cli/public ✓")
