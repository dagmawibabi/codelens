import { promises as fs } from "node:fs"
import path from "node:path"
import type { PackageManager, ProjectInfo } from "./types.js"

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T
  } catch {
    return null
  }
}

async function detectPackageManager(root: string): Promise<PackageManager> {
  if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm"
  if (await exists(path.join(root, "yarn.lock"))) return "yarn"
  if (await exists(path.join(root, "bun.lockb"))) return "bun"
  return "npm"
}

/**
 * Infers framework, package manager, and tooling from package.json + lockfiles.
 * This drives which configs the runners apply.
 */
export async function detectProject(root: string): Promise<ProjectInfo> {
  const pkg = await readJson<{
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }>(path.join(root, "package.json"))

  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }

  let framework = "Node"
  if (deps["next"]) framework = "Next.js"
  else if (deps["@sveltejs/kit"]) framework = "SvelteKit"
  else if (deps["nuxt"]) framework = "Nuxt"
  else if (deps["vue"]) framework = "Vue"
  else if (deps["svelte"]) framework = "Svelte"
  else if (deps["react"]) framework = "React"
  else if (deps["vite"]) framework = "Vite"

  const hasTypeScript =
    Boolean(deps["typescript"]) ||
    (await exists(path.join(root, "tsconfig.json")))

  return {
    root,
    framework,
    packageManager: await detectPackageManager(root),
    hasTypeScript,
    hasLintScript: Boolean(pkg?.scripts?.["lint"]),
  }
}
