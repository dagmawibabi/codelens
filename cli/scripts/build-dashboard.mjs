// Builds the Next.js dashboard as a static bundle and copies it into
// `cli/public`, so the CLI can serve it offline with zero runtime deps.
//
// Run from the cli/ package: `npm run build:dashboard`
import { execSync } from "node:child_process"
import { cpSync, rmSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const cliRoot = resolve(here, "..")
const dashboardRoot = resolve(cliRoot, "..") // the Next.js app lives one level up
const exportDir = join(dashboardRoot, "out")
const publicDir = join(cliRoot, "public")

console.log("[codelens] Building dashboard (static export)...")
execSync("next build", {
  cwd: dashboardRoot,
  stdio: "inherit",
  env: { ...process.env, CODELENS_EXPORT: "1" },
})

if (!existsSync(exportDir)) {
  console.error(
    `[codelens] Expected static export at ${exportDir} but it was not found.`,
  )
  process.exit(1)
}

console.log("[codelens] Copying dashboard into CLI package...")
rmSync(publicDir, { recursive: true, force: true })
cpSync(exportDir, publicDir, { recursive: true })

console.log("[codelens] Dashboard bundled at cli/public ✓")
