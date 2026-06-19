#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import open from "open";

// src/detect.ts
import { promises as fs } from "fs";
import path from "path";
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
async function readJson(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}
async function detectPackageManager(root) {
  if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(root, "yarn.lock"))) return "yarn";
  if (await exists(path.join(root, "bun.lockb"))) return "bun";
  return "npm";
}
async function detectProject(root) {
  const pkg = await readJson(path.join(root, "package.json"));
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  let framework = "Node";
  if (deps["next"]) framework = "Next.js";
  else if (deps["@sveltejs/kit"]) framework = "SvelteKit";
  else if (deps["nuxt"]) framework = "Nuxt";
  else if (deps["vue"]) framework = "Vue";
  else if (deps["svelte"]) framework = "Svelte";
  else if (deps["react"]) framework = "React";
  else if (deps["vite"]) framework = "Vite";
  const hasTypeScript = Boolean(deps["typescript"]) || await exists(path.join(root, "tsconfig.json"));
  return {
    root,
    framework,
    packageManager: await detectPackageManager(root),
    hasTypeScript,
    hasLintScript: Boolean(pkg?.scripts?.["lint"])
  };
}

// src/runners/eslint.ts
import { execa } from "execa";
import path2 from "path";
import { promises as fs2 } from "fs";
async function resolveBin(root) {
  const local = path2.join(root, "node_modules", ".bin", "eslint");
  try {
    await fs2.access(local);
    return local;
  } catch {
    return null;
  }
}
async function runEslint(root, project) {
  const bin = await resolveBin(root);
  const cmd = bin ?? "npx";
  const baseArgs = bin ? [] : ["--no-install", "eslint"];
  const args = [...baseArgs, ".", "--format", "json", "--ext", ".js,.jsx,.ts,.tsx,.vue,.svelte"];
  let stdout = "";
  try {
    const res = await execa(cmd, args, {
      cwd: root,
      reject: false,
      // ESLint exits non-zero when it finds problems.
      timeout: 12e4
    });
    stdout = res.stdout;
  } catch (err) {
    return {
      messages: [],
      errorCount: 0,
      warningCount: 0,
      fixableCount: 0,
      unavailable: true,
      note: "Could not run ESLint. Ensure it is installed in the project. " + (err instanceof Error ? err.message : String(err))
    };
  }
  let raw;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return {
      messages: [],
      errorCount: 0,
      warningCount: 0,
      fixableCount: 0,
      unavailable: true,
      note: "ESLint produced no parseable JSON output."
    };
  }
  const messages = [];
  for (const file of raw) {
    const rel = path2.relative(root, file.filePath) || file.filePath;
    for (const m of file.messages) {
      messages.push({
        filePath: rel,
        line: m.line,
        column: m.column,
        endLine: m.endLine,
        endColumn: m.endColumn,
        severity: m.severity === 2 ? "error" : "warning",
        ruleId: m.ruleId,
        message: m.message,
        fixable: m.fix != null
      });
    }
  }
  return {
    messages,
    errorCount: messages.filter((m) => m.severity === "error").length,
    warningCount: messages.filter((m) => m.severity === "warning").length,
    fixableCount: messages.filter((m) => m.fixable).length
  };
}

// src/runners/tsc.ts
import { execa as execa2 } from "execa";
import path3 from "path";
import { promises as fs3 } from "fs";
async function resolveBin2(root) {
  const local = path3.join(root, "node_modules", ".bin", "tsc");
  try {
    await fs3.access(local);
    return local;
  } catch {
    return null;
  }
}
var LINE_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;
async function runTsc(root, project) {
  if (!project.hasTypeScript) {
    return { diagnostics: [], unavailable: true, note: "No TypeScript detected in this project." };
  }
  const bin = await resolveBin2(root);
  const cmd = bin ?? "npx";
  const baseArgs = bin ? [] : ["--no-install", "tsc"];
  const args = [...baseArgs, "--noEmit", "--pretty", "false"];
  let output = "";
  try {
    const res = await execa2(cmd, args, { cwd: root, reject: false, timeout: 18e4 });
    output = `${res.stdout}
${res.stderr}`;
  } catch (err) {
    return {
      diagnostics: [],
      unavailable: true,
      note: "Could not run tsc. " + (err instanceof Error ? err.message : String(err))
    };
  }
  const diagnostics = [];
  let current = null;
  for (const rawLine of output.split("\n")) {
    const match = LINE_RE.exec(rawLine.trimEnd());
    if (match) {
      const [, file, line, col, code, message] = match;
      current = {
        filePath: path3.relative(root, file) || file,
        line: Number(line),
        column: Number(col),
        code,
        message,
        related: []
      };
      diagnostics.push(current);
    } else if (current && /^\s+/.test(rawLine) && rawLine.trim().length > 0) {
      const depth = Math.floor((rawLine.length - rawLine.trimStart().length) / 2);
      current.related.push({ message: rawLine.trim(), depth });
    }
  }
  return { diagnostics };
}

// src/runners/audit.ts
import { execa as execa3 } from "execa";
function mapSeverity(s) {
  return s === "moderate" ? "medium" : s;
}
async function runAudit(root, project) {
  const pm = project.packageManager;
  const args = pm === "yarn" ? ["audit", "--json"] : ["audit", "--json"];
  let stdout = "";
  try {
    const res = await execa3(pm, args, { cwd: root, reject: false, timeout: 12e4 });
    stdout = res.stdout;
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const vulns = [];
  for (const [name, v] of Object.entries(parsed.vulnerabilities ?? {})) {
    const titles = v.via.filter((x) => typeof x === "object");
    const cves = titles.flatMap((t) => t.cwe ?? []);
    const fixedIn = typeof v.fixAvailable === "object" ? v.fixAvailable.version : void 0;
    vulns.push({
      name: v.name ?? name,
      currentVersion: v.range,
      dependencyType: v.isDirect ? "direct" : "transitive",
      severity: mapSeverity(v.severity),
      title: titles[0]?.title ?? `${name} advisory`,
      cves,
      fixedIn
    });
  }
  return vulns;
}

// src/ai/audit.ts
import { generateText, Output } from "ai";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { promises as fsp } from "fs";
var MODEL = process.env.CODELENS_MODEL ?? "anthropic/claude-opus-4.6";
var findingSchema = z.object({
  findings: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(["critical", "high", "medium", "low", "info"]),
      category: z.enum([
        "injection",
        "secrets",
        "auth",
        "xss",
        "ssrf",
        "crypto",
        "config",
        "data-exposure",
        "other"
      ]),
      filePath: z.string(),
      line: z.number(),
      endLine: z.number().nullable(),
      description: z.string(),
      recommendation: z.string(),
      suggestedFix: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      reference: z.string().nullable()
    })
  )
});
var SYSTEM = `You are a senior application security engineer reviewing a {{framework}} project.
Report only concrete, exploitable issues \u2014 no style nitpicks, no false positives.
For each finding give: a short title, severity, category, the file + line, a clear
description of the risk, a precise recommendation, and where possible a unified-diff
"suggestedFix". Calibrate "confidence" honestly. Framework-specific pitfalls matter
(e.g. secrets leaking into client bundles, unverified webhooks, Server Action exposure).`;
function aiEnabled() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY);
}
async function auditCode(project, files) {
  if (!aiEnabled() || files.length === 0) return [];
  const bundle = files.map((rel) => {
    let content = "";
    try {
      content = readFileSync(join(project.root, rel), "utf8");
    } catch {
      return "";
    }
    const numbered = content.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
    return `=== FILE: ${rel} ===
${numbered}`;
  }).filter(Boolean).join("\n\n");
  const { experimental_output } = await generateText({
    model: MODEL,
    system: SYSTEM.replace("{{framework}}", project.framework),
    prompt: `Review the following files and report security findings.

${bundle}`,
    experimental_output: Output.object({ schema: findingSchema })
  });
  return experimental_output.findings.map((f, i) => ({
    id: `s${i}`,
    ...f,
    endLine: f.endLine ?? void 0,
    suggestedFix: f.suggestedFix ?? void 0,
    reference: f.reference ?? void 0
  }));
}
var prioritizeSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      severity: z.enum(["critical", "high", "medium", "low", "info"]),
      impact: z.string()
    })
  )
});
async function prioritizeDependencies(project, vulns) {
  if (!aiEnabled() || vulns.length === 0) return vulns;
  const list = vulns.map(
    (v) => `- ${v.name}@${v.currentVersion} (${v.dependencyType}) ${v.severity}: ${v.title} [${v.cves.join(", ")}]`
  ).join("\n");
  const { experimental_output } = await generateText({
    model: MODEL,
    system: `You are a security engineer triaging dependency advisories for a ${project.framework} app.
For each advisory, explain in one or two sentences the realistic real-world impact for
THIS kind of project, and whether the vulnerable code path is likely reachable. Be honest
about low real-world risk for transitive/build-only packages.`,
    prompt: `Advisories from the package audit:
${list}`,
    experimental_output: Output.object({ schema: prioritizeSchema })
  });
  const byName = new Map(experimental_output.items.map((i) => [i.name, i]));
  return vulns.map((v) => {
    const ai2 = byName.get(v.name);
    return ai2 ? { ...v, impact: ai2.impact, severity: ai2.severity } : v;
  });
}
var SECURITY_RELEVANT = [
  /\/api\//,
  /\/(server|actions)\//,
  /\.server\./,
  /route\.(t|j)sx?$/,
  /middleware\.(t|j)s$/,
  /\/(auth|lib|utils|db|database)\//,
  /\+page\.server\./,
  // SvelteKit
  /\+server\./
  // SvelteKit
];
var IGNORE_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".svelte-kit",
  "coverage",
  ".codelens"
]);
var MAX_FILES = 25;
async function selectFiles(root) {
  const picked = [];
  async function walk(dir2) {
    if (picked.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await fsp.readdir(dir2, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (picked.length >= MAX_FILES) return;
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(dir2, entry.name));
      } else if (/\.(t|j)sx?$|\.vue$|\.svelte$/.test(entry.name)) {
        const full = join(dir2, entry.name);
        const rel = full.slice(root.length + 1);
        if (SECURITY_RELEVANT.some((re) => re.test("/" + rel))) {
          picked.push(rel);
        }
      }
    }
  }
  await walk(root);
  return picked;
}
async function runSecurityAudit(args) {
  const { project, advisories } = args;
  if (!aiEnabled()) {
    return { findings: [], dependencies: advisories, skipped: true };
  }
  const files = await selectFiles(project.root);
  const [findings, dependencies] = await Promise.all([
    auditCode(project, files),
    prioritizeDependencies(project, advisories)
  ]);
  return { findings, dependencies, skipped: false };
}

// src/report.ts
import { randomUUID } from "crypto";

// src/health.ts
var PENALTY = {
  critical: 28,
  error: 22,
  high: 16,
  medium: 8,
  warning: 7,
  low: 3,
  info: 1
};
function scoreFromSeverities(sevs) {
  let s = 100;
  for (const sev of sevs) s -= PENALTY[sev] ?? 4;
  return Math.max(0, Math.min(100, Math.round(s)));
}
function gradeForScore(score) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
function computeHealth(report, insights) {
  const { lint, types, security, deps } = report;
  const { env, network, git: git2, docs, database, accessibility, performance, tests } = insights;
  const lintScore = scoreFromSeverities(lint.messages.map((m) => m.severity));
  const typeScore = scoreFromSeverities(types.diagnostics.map(() => "error"));
  const securityScore = scoreFromSeverities([
    ...security.findings.map((f) => f.severity),
    ...security.dependencies.map((d) => d.severity)
  ]);
  const depScore = scoreFromSeverities(deps.findings.map((f) => f.severity));
  const dbScore = scoreFromSeverities(database.findings.map((f) => f.severity));
  const envIssues = env.variables.filter((v) => v.status !== "ok");
  const envScore = scoreFromSeverities(envIssues.map((v) => v.severity));
  const netIssues = network.calls.flatMap((c) => c.issues.map((i) => i.severity));
  const netScore = scoreFromSeverities(netIssues);
  const gitIssues = [...git2.issues, ...git2.workflows.flatMap((w) => w.issues)];
  const gitScore = scoreFromSeverities(gitIssues.map((g) => g.severity));
  const docChecks = docs.standards.flatMap((s) => s.checks);
  const docScore = docChecks.length ? Math.round(docChecks.filter((c) => c.status === "pass").length / docChecks.length * 100) : 100;
  const a11yScore = accessibility.score;
  const perfScore = performance.score;
  const passRate = tests.counts.total ? tests.counts.passed / tests.counts.total : 1;
  const testScore = Math.max(
    0,
    Math.min(100, Math.round(tests.coverage.lines * 0.5 + passRate * 100 * 0.5 - tests.counts.failed * 3))
  );
  const weighted = [
    { score: securityScore, weight: 0.2 },
    { score: typeScore, weight: 0.12 },
    { score: depScore, weight: 0.12 },
    { score: lintScore, weight: 0.1 },
    { score: dbScore, weight: 0.1 },
    { score: testScore, weight: 0.1 },
    { score: perfScore, weight: 0.08 },
    { score: a11yScore, weight: 0.08 },
    { score: envScore, weight: 0.04 },
    { score: netScore, weight: 0.03 },
    { score: docScore, weight: 0.03 }
  ];
  const weightTotal = weighted.reduce((s, c) => s + c.weight, 0) || 1;
  const score = Math.round(weighted.reduce((s, c) => s + c.score * c.weight, 0) / weightTotal);
  return {
    score,
    grade: gradeForScore(score),
    breakdown: { lint: lintScore, types: typeScore, security: securityScore }
  };
}

// src/report.ts
function buildReport(args) {
  const { meta, startedAt, lint, types, security, deps, insights } = args;
  const finishedAt = Date.now();
  return {
    meta: {
      ...meta,
      id: randomUUID(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt
    },
    health: computeHealth({ lint, types, security, deps }, insights),
    lint,
    types,
    security,
    deps
  };
}

// src/deps-graph.ts
import { promises as fs4 } from "fs";
import path4 from "path";
import { builtinModules } from "module";
var BUILTINS = /* @__PURE__ */ new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
var MAX_GRAPH_NODES = 60;
function packageOf(spec) {
  if (spec.startsWith(".") || spec.startsWith("/")) return null;
  if (spec.startsWith("@")) {
    const [scope, name2] = spec.split("/");
    return scope && name2 ? `${scope}/${name2}` : null;
  }
  const name = spec.split("/")[0];
  if (!name || BUILTINS.has(name) || BUILTINS.has(`node:${name}`)) return null;
  return name;
}
var IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g;
async function collectImported(ctx) {
  const used = /* @__PURE__ */ new Map();
  for (const file of ctx.codeFiles()) {
    const content = await ctx.read(file.rel);
    if (!content) continue;
    IMPORT_RE.lastIndex = 0;
    let m;
    while (m = IMPORT_RE.exec(content)) {
      const pkg = packageOf(m[1]);
      if (!pkg) continue;
      if (!used.has(pkg)) used.set(pkg, /* @__PURE__ */ new Set());
      used.get(pkg).add(file.rel);
    }
  }
  return used;
}
async function dirSizeKb(dir2, budget = { files: 400 }) {
  let bytes = 0;
  async function walk(d) {
    if (budget.files <= 0) return;
    let entries;
    try {
      entries = await fs4.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (budget.files <= 0) return;
      budget.files--;
      const abs = path4.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        await walk(abs);
      } else if (e.isFile()) {
        try {
          bytes += (await fs4.stat(abs)).size;
        } catch {
        }
      }
    }
  }
  await walk(dir2);
  return bytes > 0 ? Math.round(bytes / 1024) : void 0;
}
async function readDepPkg(root, name) {
  try {
    const raw = await fs4.readFile(path4.join(root, "node_modules", name, "package.json"), "utf8");
    const json = JSON.parse(raw);
    return { version: json.version ?? "\u2014", deps: Object.keys(json.dependencies ?? {}) };
  } catch {
    return null;
  }
}
function worstSeverity(a, b) {
  const order = ["info", "low", "warning", "medium", "high", "error", "critical"];
  if (!a) return b;
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
async function buildDependencyResult(ctx, advisories) {
  const pkg = ctx.pkg ?? {};
  const directDeps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const peerDeps = pkg.peerDependencies ?? {};
  const directNames = Object.keys(directDeps);
  const devNames = Object.keys(devDeps);
  const imported = await collectImported(ctx);
  const findings = [];
  const flagged = /* @__PURE__ */ new Map();
  advisories.forEach((v, i) => {
    const sev = v.severity;
    findings.push({
      id: `vuln-${i}`,
      name: v.name,
      current: v.currentVersion,
      type: v.dependencyType === "transitive" ? "transitive" : v.dependencyType === "dev" ? "dev" : "direct",
      kind: "vulnerability",
      severity: sev,
      title: v.title,
      detail: v.impact ?? v.title,
      recommendation: v.fixedIn ? `Upgrade to ${v.fixedIn} or later.` : "Review the advisory and upgrade when a fix is available.",
      fixedIn: v.fixedIn,
      cves: v.cves
    });
    flagged.set(v.name, worstSeverity(flagged.get(v.name), sev));
  });
  const IMPLICIT = /* @__PURE__ */ new Set([
    "typescript",
    "tailwindcss",
    "postcss",
    "autoprefixer",
    "eslint",
    "prettier",
    "@types/node"
  ]);
  for (const name of directNames) {
    if (IMPLICIT.has(name) || name.startsWith("@types/")) continue;
    if (!imported.has(name)) {
      findings.push({
        id: `unused-${name}`,
        name,
        current: directDeps[name],
        type: "direct",
        kind: "unused",
        severity: "low",
        title: `${name} appears unused`,
        detail: `${name} is listed in dependencies but no import of it was found in the scanned source.`,
        recommendation: `Remove ${name} from package.json if it is truly unused, or confirm it is loaded dynamically.`
      });
      flagged.set(name, worstSeverity(flagged.get(name), "low"));
    }
  }
  const declared = /* @__PURE__ */ new Set([...directNames, ...devNames, ...Object.keys(peerDeps)]);
  for (const [name, files] of imported) {
    if (!declared.has(name) && !name.startsWith("@types/")) {
      findings.push({
        id: `missing-${name}`,
        name,
        current: "\u2014",
        type: "direct",
        kind: "missing",
        severity: "high",
        title: `${name} is imported but not declared`,
        detail: `${name} is imported in ${files.size} file(s) but is not listed in package.json. Installs may break in CI.`,
        recommendation: `Add ${name} to dependencies.`,
        usedIn: [...files].slice(0, 8)
      });
      flagged.set(name, worstSeverity(flagged.get(name), "high"));
    }
  }
  const nodes = [];
  const seen = /* @__PURE__ */ new Set();
  const rootName = pkg.name ?? "project";
  async function addNode(name, type, depth) {
    if (seen.has(name) || nodes.length >= MAX_GRAPH_NODES) return;
    seen.add(name);
    const meta = await readDepPkg(ctx.root, name);
    const sizeKb = await dirSizeKb(path4.join(ctx.root, "node_modules", name));
    const sev = flagged.get(name);
    nodes.push({
      id: name,
      version: meta?.version ?? "\u2014",
      type,
      depth,
      sizeKb,
      dependencies: (meta?.deps ?? []).slice(0, 12),
      flagged: sev != null,
      severity: sev
    });
  }
  for (const name of directNames) await addNode(name, "direct", 0);
  for (const name of devNames) await addNode(name, "dev", 0);
  const firstLevel = nodes.slice();
  for (const node of firstLevel) {
    for (const child of node.dependencies) {
      await addNode(child, "transitive", node.depth + 1);
    }
  }
  const transitiveCount = nodes.filter((n) => n.type === "transitive").length;
  const graph = { root: rootName, nodes };
  return {
    counts: {
      total: directNames.length + devNames.length,
      direct: directNames.length,
      dev: devNames.length,
      transitive: transitiveCount
    },
    findings,
    manifestPath: "package.json",
    graph
  };
}

// src/insights/env.ts
var ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.example"
];
var PUBLIC_PREFIXES = ["NEXT_PUBLIC_", "VITE_", "PUBLIC_", "NUXT_PUBLIC_", "REACT_APP_", "GATSBY_", "EXPO_PUBLIC_"];
var SECRET_HINT = /(SECRET|TOKEN|KEY|PASSWORD|PASS|PRIVATE|DSN|CREDENTIAL|AUTH|API)/i;
function scopeOf(key) {
  return PUBLIC_PREFIXES.some((p) => key.startsWith(p)) ? "client" : "server";
}
function looksSecret(key) {
  return SECRET_HINT.test(key) && scopeOf(key) === "server";
}
function mask(value) {
  if (value === "") return "(empty)";
  if (/^https?:\/\//.test(value)) {
    try {
      const u = new URL(value);
      return `${u.protocol}//\u2022\u2022\u2022\u2022@${u.host}`.replace("//\u2022\u2022\u2022\u2022@", "//");
    } catch {
      return "\u2022\u2022\u2022\u2022";
    }
  }
  if (value.length <= 6) return "\u2022\u2022\u2022\u2022";
  return `${value.slice(0, 4)}\u2022\u2022\u2022\u2022`;
}
function parseEnv(body) {
  const out = /* @__PURE__ */ new Map();
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let val = line.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out.set(key, val);
  }
  return out;
}
var REF_RE = /(?:process\.env|import\.meta\.env)\s*(?:\.\s*([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\])/g;
async function collectEnv(ctx) {
  const declaredIn = /* @__PURE__ */ new Map();
  const values = /* @__PURE__ */ new Map();
  const emptyKeys = /* @__PURE__ */ new Set();
  const fileSummaries = [];
  for (const path10 of ENV_FILES) {
    const body = await ctx.read(path10);
    if (body == null) {
      fileSummaries.push({ path: path10, present: false, vars: 0 });
      continue;
    }
    const parsed = parseEnv(body);
    fileSummaries.push({ path: path10, present: true, vars: parsed.size });
    for (const [k, v] of parsed) {
      if (!declaredIn.has(k)) declaredIn.set(k, []);
      declaredIn.get(k).push(path10);
      if (v === "") emptyKeys.add(k);
      else values.set(k, v);
    }
  }
  const usedIn = /* @__PURE__ */ new Map();
  const clientUse = /* @__PURE__ */ new Map();
  for (const file of ctx.codeFiles()) {
    const content = await ctx.read(file.rel);
    if (!content) continue;
    const isClient = /^\s*['"]use client['"]/m.test(content) || /\.(client|tsx|jsx|vue|svelte)$/.test(file.rel);
    REF_RE.lastIndex = 0;
    let m;
    while (m = REF_RE.exec(content)) {
      const key = m[1] ?? m[2];
      if (!key) continue;
      if (!usedIn.has(key)) usedIn.set(key, /* @__PURE__ */ new Set());
      usedIn.get(key).add(file.rel);
      if (isClient) {
        if (!clientUse.has(key)) clientUse.set(key, /* @__PURE__ */ new Set());
        clientUse.get(key).add(file.rel);
      }
    }
  }
  const exampleFile = ".env.example";
  const exampleKeys = new Set([...declaredIn].filter(([, f]) => f.includes(exampleFile)).map(([k]) => k));
  const allKeys = /* @__PURE__ */ new Set([...declaredIn.keys(), ...usedIn.keys()]);
  const variables = [];
  for (const key of allKeys) {
    const defs = (declaredIn.get(key) ?? []).filter((f) => f !== exampleFile);
    const definedIn = declaredIn.get(key) ?? [];
    const uses = [...usedIn.get(key) ?? []];
    const scope = scopeOf(key);
    const inExample = exampleKeys.has(key);
    let status = "ok";
    let severity = "info";
    let note = "";
    if (defs.length === 0 && uses.length > 0) {
      status = "missing";
      severity = looksSecret(key) ? "high" : "medium";
      note = `Referenced in ${uses.length} file(s) but not defined in any env file. It will be undefined at runtime.`;
    } else if (defs.length > 0 && uses.length === 0) {
      status = "unused";
      severity = "low";
      note = "Defined in an env file but never referenced in the codebase. Safe to remove.";
    } else if (emptyKeys.has(key) && uses.length > 0) {
      status = "empty";
      severity = "medium";
      note = "Declared with an empty value; code that depends on it may fail silently.";
    } else if (looksSecret(key) && clientUse.has(key)) {
      status = "exposed";
      severity = "critical";
      note = `Secret-looking variable is referenced from a client component (${[...clientUse.get(key)][0]}). It will be inlined into the browser bundle.`;
    } else if (defs.length > 0 && !inExample && uses.length > 0) {
      status = "undocumented";
      severity = "low";
      note = "Used and defined locally but absent from .env.example, so collaborators won't know to set it.";
    } else {
      status = "ok";
      severity = "info";
      note = scope === "client" ? "Public client variable." : "Server-only variable.";
    }
    const sampleVal = values.get(key);
    variables.push({
      key,
      scope,
      status,
      severity,
      usedIn: uses.slice(0, 10),
      definedIn,
      note,
      sample: emptyKeys.has(key) ? "(empty)" : sampleVal != null ? mask(sampleVal) : void 0
    });
  }
  variables.sort((a, b) => Number(b.status !== "ok") - Number(a.status !== "ok") || a.key.localeCompare(b.key));
  const client = variables.filter((v) => v.scope === "client").length;
  const issues = variables.filter((v) => v.status !== "ok").length;
  return {
    files: fileSummaries,
    variables,
    counts: { total: variables.length, client, server: variables.length - client, issues }
  };
}

// src/insights/network.ts
var CLIENT_PATTERNS = [
  { client: "fetch", re: /\bfetch\s*\(/g },
  { client: "axios", re: /\baxios\s*(?:\.\s*(get|post|put|patch|delete|head|options))?\s*\(/gi },
  { client: "ky", re: /\bky\s*(?:\.\s*(get|post|put|patch|delete))?\s*\(/gi },
  { client: "xhr", re: /\bnew\s+XMLHttpRequest\s*\(/g },
  { client: "websocket", re: /\bnew\s+WebSocket\s*\(/g }
];
var URL_RE = /["'`](https?:\/\/[^"'`\s]+|wss?:\/\/[^"'`\s]+|\/[^"'`\s]*)["'`]/;
var METHOD_RE = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/i;
var CATEGORY_HINTS = [
  { re: /(stripe|paypal|braintree|checkout)/i, category: "payment" },
  { re: /(auth0|clerk|okta|cognito|firebaseauth|accounts\.google)/i, category: "auth" },
  { re: /(segment|mixpanel|amplitude|analytics|posthog|gtag|plausible)/i, category: "analytics" },
  { re: /(cdn|cloudfront|jsdelivr|unpkg|fastly|akamai|cloudflare)/i, category: "cdn" },
  { re: /(api\.|\/api|graphql)/i, category: "api" }
];
function categorize(host, url) {
  if (host === "relative") return "internal";
  for (const { re, category } of CATEGORY_HINTS) {
    if (re.test(host) || re.test(url)) return category;
  }
  return "other";
}
function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}
var RANK = { critical: 6, high: 5, error: 5, medium: 4, warning: 3, low: 2, info: 1 };
var rank = (s) => RANK[s] ?? 0;
var maxRank = (issues) => issues.reduce((a, i) => Math.max(a, rank(i.severity)), 0);
async function collectNetwork(ctx) {
  const raw = [];
  for (const file of ctx.codeFiles()) {
    const text = await ctx.read(file.rel);
    if (!text || !/fetch|axios|\bky\b|XMLHttpRequest|WebSocket/.test(text)) continue;
    const lines = text.split("\n");
    for (const { client, re } of CLIENT_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const lineNo = text.slice(0, m.index).split("\n").length;
        const windowStart = Math.max(0, lineNo - 1);
        const windowText = lines.slice(windowStart, Math.min(lines.length, lineNo + 6)).join("\n");
        const explicitMethod = m[1]?.toUpperCase();
        const method = explicitMethod || windowText.match(METHOD_RE)?.[1]?.toUpperCase() || (client === "websocket" ? "WS" : "GET");
        const url = windowText.match(URL_RE)?.[1] ?? "(dynamic)";
        raw.push({ file: file.rel, line: lineNo, method, url, client, context: windowText });
      }
    }
  }
  const calls = raw.map((c, i) => {
    const issues = [];
    const ctxText = c.context;
    const isAbsolute = /^(https?|wss?):\/\//.test(c.url);
    const secure = c.url.startsWith("https://") || c.url.startsWith("wss://") || !isAbsolute;
    const host = isAbsolute ? safeHost(c.url) : "relative";
    if (/^(http|ws):\/\//.test(c.url)) {
      issues.push({ kind: "insecure", severity: "high", message: "Uses insecure HTTP/WS instead of TLS." });
    }
    if (isAbsolute) {
      issues.push({ kind: "hardcoded-url", severity: "low", message: "Absolute URL hardcoded in source; consider an env var." });
    }
    if (!(/\.catch\s*\(/.test(ctxText) || /try\s*\{/.test(ctxText))) {
      issues.push({ kind: "no-error-handling", severity: "medium", message: "No try/catch or .catch() around the request." });
    }
    if (c.client === "fetch" && !/signal\s*:/.test(ctxText)) {
      issues.push({ kind: "no-timeout", severity: "medium", message: "No AbortSignal/timeout configured." });
    } else if ((c.client === "axios" || c.client === "ky") && !/timeout\s*:/.test(ctxText)) {
      issues.push({ kind: "no-timeout", severity: "low", message: "No timeout configured." });
    }
    if (/Authorization\s*:\s*["'`]Bearer\s+[A-Za-z0-9._-]{8,}["'`]/.test(ctxText) || /(api[_-]?key|token|secret)=[A-Za-z0-9]{8,}/i.test(c.url)) {
      issues.push({ kind: "no-auth", severity: "high", message: "Credentials appear hardcoded near the request." });
    }
    return {
      id: `net-${i + 1}`,
      method: c.method,
      url: c.url,
      host,
      external: isAbsolute,
      secure,
      client: c.client,
      filePath: c.file,
      line: c.line,
      issues
    };
  });
  const domainMap = /* @__PURE__ */ new Map();
  for (const c of calls) {
    const existing = domainMap.get(c.host);
    if (existing) existing.calls++;
    else domainMap.set(c.host, { host: c.host, calls: 1, external: c.external, category: categorize(c.host, c.url) });
  }
  return {
    calls: calls.sort((a, b) => maxRank(b.issues) - maxRank(a.issues)),
    domains: [...domainMap.values()].sort((a, b) => b.calls - a.calls),
    counts: {
      total: calls.length,
      external: calls.filter((c) => c.external).length,
      insecure: calls.filter((c) => c.issues.some((i) => i.kind === "insecure")).length,
      issues: calls.filter((c) => c.issues.length > 0).length
    }
  };
}

// src/insights/git.ts
import { execFile } from "child_process";
import { promisify } from "util";
var exec = promisify(execFile);
async function git(root, args) {
  try {
    const { stdout } = await exec("git", args, { cwd: root, timeout: 8e3, maxBuffer: 4e6 });
    return stdout.trim();
  } catch {
    return null;
  }
}
function parseStatus(porcelain) {
  const changes = [];
  let staged = 0;
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    const x = line[0];
    const y = line[1];
    const file = line.slice(3);
    if (x !== " " && x !== "?") staged++;
    let status = "modified";
    if (x === "?" || y === "?") status = "untracked";
    else if (x === "A" || y === "A") status = "added";
    else if (x === "D" || y === "D") status = "deleted";
    else if (x === "R") status = "renamed";
    changes.push({ path: file, status });
  }
  return { changes, staged };
}
var CI_FILES = [
  { glob: /^\.github\/workflows\/.*\.ya?ml$/, provider: "GitHub Actions" },
  { glob: /^\.gitlab-ci\.ya?ml$/, provider: "GitLab CI" },
  { glob: /^\.circleci\/config\.ya?ml$/, provider: "CircleCI" }
];
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}
async function collectGit(ctx) {
  const root = ctx.root;
  const issues = [];
  const isRepo = await git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!isRepo) {
    return {
      state: emptyState(),
      issues: [
        {
          id: "git-noinit",
          kind: "gitignore",
          severity: "medium",
          title: "Not a git repository",
          detail: "This project is not under version control. Initialize a repo to track changes and enable CI.",
          recommendation: "Run `git init` and commit your work."
        }
      ],
      workflows: await collectWorkflows(ctx)
    };
  }
  const [branch, statusOut, logOut, remoteOut, countOut, contribOut, defaultRef] = await Promise.all([
    git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(root, ["status", "--porcelain"]),
    git(root, ["log", "-1", "--format=%h%x1f%s%x1f%an%x1f%aI"]),
    git(root, ["remote", "get-url", "origin"]),
    git(root, ["rev-list", "--count", "HEAD"]),
    git(root, ["shortlog", "-sn", "--all", "--no-merges"]),
    git(root, ["symbolic-ref", "refs/remotes/origin/HEAD"])
  ]);
  const { changes, staged } = parseStatus(statusOut ?? "");
  const [hash = "", message = "", author = "", date = ""] = (logOut ?? "").split("");
  const defaultBranch = defaultRef?.split("/").pop() ?? "main";
  const branchName = branch ?? "HEAD";
  let ahead = 0;
  let behind = 0;
  const counts = await git(root, ["rev-list", "--left-right", "--count", `${defaultBranch}...HEAD`]);
  if (counts) {
    const [b, a] = counts.split(/\s+/).map((n) => Number.parseInt(n, 10));
    behind = Number.isFinite(b) ? b : 0;
    ahead = Number.isFinite(a) ? a : 0;
  }
  const contributors = (contribOut ?? "").split("\n").filter((l) => l.trim()).length || 1;
  const totalCommits = Number.parseInt(countOut ?? "0", 10) || 0;
  const state = {
    branch: branchName,
    defaultBranch,
    ahead,
    behind,
    remote: remoteOut ?? "",
    lastCommit: {
      hash,
      message: message || "(no commits yet)",
      author: author || "unknown",
      relative: date ? relativeTime(date) : "unknown"
    },
    changes,
    staged,
    contributors,
    totalCommits
  };
  const gitignore = await ctx.read(".gitignore");
  if (gitignore == null) {
    issues.push({
      id: "git-gitignore",
      kind: "gitignore",
      severity: "high",
      title: "Missing .gitignore",
      detail: "No .gitignore found; build artifacts, secrets, and node_modules may be committed.",
      recommendation: "Add a .gitignore covering node_modules, .env*, and build output."
    });
  } else {
    const missing = ["node_modules", ".env"].filter((p) => !gitignore.includes(p));
    if (missing.length) {
      issues.push({
        id: "git-gitignore-gaps",
        kind: "gitignore",
        severity: missing.includes(".env") ? "high" : "medium",
        title: `.gitignore missing ${missing.join(", ")}`,
        detail: `Patterns not ignored: ${missing.join(", ")}. Sensitive or bulky files may be tracked.`,
        filePath: ".gitignore",
        recommendation: `Add ${missing.join(" and ")} to .gitignore.`
      });
    }
  }
  for (const f of ctx.files) {
    if (/(^|\/)\.env(\.|$)/.test(f.rel) && !f.rel.endsWith(".example") && gitignore && !gitignore.includes(".env")) {
      issues.push({
        id: `git-env-${f.rel}`,
        kind: "secret-in-history",
        severity: "critical",
        title: `Potential secret file tracked: ${f.rel}`,
        detail: "An environment file may be committed to version control, exposing secrets in history.",
        filePath: f.rel,
        recommendation: "Remove it from tracking with `git rm --cached` and add it to .gitignore."
      });
      break;
    }
  }
  if (changes.length > 20) {
    issues.push({
      id: "git-uncommitted",
      kind: "uncommitted",
      severity: "low",
      title: `${changes.length} uncommitted changes`,
      detail: "A large number of pending changes makes review and rollback harder.",
      recommendation: "Commit work in focused, logical chunks."
    });
  }
  const large = ctx.files.filter((f) => f.sizeBytes > 5e6).slice(0, 3);
  for (const f of large) {
    issues.push({
      id: `git-large-${f.rel}`,
      kind: "large-file",
      severity: "medium",
      title: `Large file: ${f.rel}`,
      detail: `${(f.sizeBytes / 1e6).toFixed(1)} MB file in the repo bloats clones. Consider Git LFS.`,
      filePath: f.rel,
      recommendation: "Track large binaries with Git LFS or move them to object storage."
    });
  }
  return { state, issues, workflows: await collectWorkflows(ctx) };
}
async function collectWorkflows(ctx) {
  const workflows = [];
  const ciFiles = ctx.files.filter((f) => CI_FILES.some((c) => c.glob.test(f.rel)));
  for (const f of ciFiles) {
    const provider = CI_FILES.find((c) => c.glob.test(f.rel)).provider;
    const body = await ctx.read(f.rel) ?? "";
    const triggers = extractTriggers(body);
    const jobNames = extractJobs(body);
    const status = "no-runs";
    workflows.push({
      id: `wf-${workflows.length + 1}`,
      name: extractName(body) ?? f.rel.split("/").pop() ?? "workflow",
      file: f.rel,
      provider,
      triggers,
      status,
      jobs: jobNames.map((name) => ({ name, status })),
      issues: []
    });
  }
  return workflows;
}
function extractName(yaml) {
  return yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/['"]/g, "") ?? null;
}
function extractTriggers(yaml) {
  const onBlock = yaml.match(/^on:\s*(.*)$/m)?.[1]?.trim();
  if (onBlock && onBlock !== "" && !onBlock.startsWith("#")) {
    if (onBlock.startsWith("[")) return onBlock.replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!onBlock.includes(":")) return [onBlock];
  }
  const triggers = /* @__PURE__ */ new Set();
  for (const t of ["push", "pull_request", "workflow_dispatch", "schedule", "release", "merge_group"]) {
    if (new RegExp(`^\\s+${t}:`, "m").test(yaml) || new RegExp(`\\b${t}\\b`).test(onBlock ?? "")) triggers.add(t);
  }
  return [...triggers];
}
function extractJobs(yaml) {
  const jobsIdx = yaml.indexOf("\njobs:");
  if (jobsIdx === -1) return [];
  const after = yaml.slice(jobsIdx);
  const names = [];
  const re = /^\s{2}([A-Za-z0-9_-]+):\s*$/gm;
  let m;
  while ((m = re.exec(after)) !== null) names.push(m[1]);
  return names.slice(0, 12);
}
function emptyState() {
  return {
    branch: "\u2014",
    defaultBranch: "main",
    ahead: 0,
    behind: 0,
    remote: "",
    lastCommit: { hash: "", message: "(not a git repository)", author: "\u2014", relative: "\u2014" },
    changes: [],
    staged: 0,
    contributors: 0,
    totalCommits: 0
  };
}

// src/insights/scan.ts
import { promises as fs5 } from "fs";
import path5 from "path";
var IGNORE_DIRS2 = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".next",
  ".next-export",
  "out",
  "dist",
  "build",
  ".svelte-kit",
  ".nuxt",
  ".turbo",
  ".vercel",
  "coverage",
  ".codelens",
  ".cache",
  "vendor"
]);
var CODE_EXT = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);
var MAX_FILES2 = 8e3;
var MAX_READ_BYTES = 512e3;
function toPosix(p) {
  return p.split(path5.sep).join("/");
}
function isTestPath(rel) {
  return /(\.|\/)(test|spec)\.[mc]?[jt]sx?$/.test(rel) || /(^|\/)(__tests__|tests?|e2e|cypress)\//.test(rel);
}
var ScanContext = class _ScanContext {
  root;
  project;
  files;
  pkg;
  deps;
  cache = /* @__PURE__ */ new Map();
  constructor(root, project, files, pkg, deps) {
    this.root = root;
    this.project = project;
    this.files = files;
    this.pkg = pkg;
    this.deps = deps;
  }
  static async create(root, project) {
    const files = [];
    async function walk(dir2) {
      if (files.length >= MAX_FILES2) return;
      let entries;
      try {
        entries = await fs5.readdir(dir2, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (files.length >= MAX_FILES2) return;
        const abs = path5.join(dir2, entry.name);
        if (entry.isDirectory()) {
          if (IGNORE_DIRS2.has(entry.name)) continue;
          await walk(abs);
        } else if (entry.isFile()) {
          const rel = toPosix(path5.relative(root, abs));
          const ext = path5.extname(entry.name).toLowerCase();
          let sizeBytes = 0;
          try {
            sizeBytes = (await fs5.stat(abs)).size;
          } catch {
          }
          files.push({
            rel,
            abs,
            ext,
            sizeBytes,
            isCode: CODE_EXT.has(ext),
            isTest: isTestPath(rel)
          });
        }
      }
    }
    await walk(root);
    let pkg = null;
    try {
      pkg = JSON.parse(await fs5.readFile(path5.join(root, "package.json"), "utf8"));
    } catch {
      pkg = null;
    }
    const deps = {
      ...pkg?.dependencies ?? {},
      ...pkg?.devDependencies ?? {}
    };
    return new _ScanContext(root, project, files, pkg, deps);
  }
  /** Lazily read & cache a file's text. Returns null when unreadable/too big. */
  async read(rel) {
    if (this.cache.has(rel)) return this.cache.get(rel) ?? null;
    const file = this.files.find((f) => f.rel === rel);
    const abs = file?.abs ?? path5.join(this.root, rel);
    if (file && file.sizeBytes > MAX_READ_BYTES) {
      this.cache.set(rel, null);
      return null;
    }
    try {
      const text = await fs5.readFile(abs, "utf8");
      this.cache.set(rel, text);
      return text;
    } catch {
      this.cache.set(rel, null);
      return null;
    }
  }
  /** All code files, optionally filtered by a predicate on the relative path. */
  codeFiles(filter) {
    return this.files.filter((f) => f.isCode && (!filter || filter(f.rel)));
  }
  hasDep(name) {
    return name in this.deps;
  }
  /** First dependency present from a candidate list (for client/ORM detection). */
  firstDep(names) {
    return names.find((n) => n in this.deps) ?? null;
  }
};
function snippetAround(content, line, radius = 2) {
  const lines = content.split("\n");
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  return { startLine: start, code: lines.slice(start - 1, end).join("\n") };
}
function countLoc(content) {
  const lines = content.split("\n");
  let code = 0;
  let comment = 0;
  let blank = 0;
  let inBlock = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (inBlock) {
      comment++;
      if (l.includes("*/")) inBlock = false;
      continue;
    }
    if (l === "") blank++;
    else if (l.startsWith("//") || l.startsWith("#")) comment++;
    else if (l.startsWith("/*")) {
      comment++;
      if (!l.includes("*/")) inBlock = true;
    } else code++;
  }
  return { total: lines.length, code, comment, blank };
}

// src/insights/setup.ts
var LANG_BY_EXT = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".css": "CSS",
  ".scss": "CSS",
  ".json": "JSON",
  ".md": "Markdown",
  ".mdx": "Markdown",
  ".yml": "YAML",
  ".yaml": "YAML"
};
var CONFIG_DEFS = [
  { id: "ts", name: "TypeScript", files: ["tsconfig.json"], tool: "tsc" },
  { id: "eslint", name: "ESLint", files: ["eslint.config.js", "eslint.config.mjs", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs"], tool: "ESLint" },
  { id: "prettier", name: "Prettier", files: [".prettierrc", ".prettierrc.json", ".prettierrc.js", "prettier.config.js", ".prettierrc.cjs"], tool: "Prettier" },
  { id: "tailwind", name: "Tailwind CSS", files: ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs"], tool: "Tailwind" },
  { id: "next", name: "Next.js", files: ["next.config.js", "next.config.mjs", "next.config.ts"], tool: "Next.js" },
  { id: "vite", name: "Vite", files: ["vite.config.js", "vite.config.ts"], tool: "Vite" },
  { id: "postcss", name: "PostCSS", files: ["postcss.config.js", "postcss.config.mjs", "postcss.config.cjs"], tool: "PostCSS" },
  { id: "vitest", name: "Vitest", files: ["vitest.config.ts", "vitest.config.js"], tool: "Vitest" },
  { id: "jest", name: "Jest", files: ["jest.config.js", "jest.config.ts", "jest.config.mjs"], tool: "Jest" },
  { id: "docker", name: "Docker", files: ["Dockerfile", "docker-compose.yml", "compose.yaml"], tool: "Docker" },
  { id: "editorconfig", name: "EditorConfig", files: [".editorconfig"], tool: "EditorConfig" }
];
function isComponentFile(rel, content) {
  if (!/\.(tsx|jsx|vue|svelte)$/.test(rel)) return false;
  if (rel.endsWith(".vue") || rel.endsWith(".svelte")) return true;
  return /export\s+(default\s+)?(function|const)\s+[A-Z]/.test(content) || /return\s*\(/.test(content);
}
function isRouteFile(rel) {
  return /(^|\/)app\/.*\/(page|route|layout)\.(t|j)sx?$/.test(rel) || /(^|\/)pages\/.*\.(t|j)sx?$/.test(rel) || /(^|\/)src\/(routes|pages)\//.test(rel);
}
async function collectSetup(ctx) {
  const configs = [];
  for (const def of CONFIG_DEFS) {
    const found = def.files.find((f) => ctx.files.some((sf) => sf.rel === f));
    if (!found) {
      configs.push({
        id: def.id,
        name: def.name,
        file: def.files[0],
        present: false,
        tool: def.tool,
        summary: `No ${def.name} configuration detected.`
      });
      continue;
    }
    const body = await ctx.read(found) ?? "";
    configs.push({
      id: def.id,
      name: def.name,
      file: found,
      present: true,
      tool: def.tool,
      summary: summarize(def.id, body),
      highlights: highlightsFor(def.id, body),
      ruleCount: ruleCountFor(def.id, body)
    });
  }
  const langTotals = /* @__PURE__ */ new Map();
  let totalLoc = 0;
  let codeLoc = 0;
  let commentLoc = 0;
  let blankLoc = 0;
  let testFiles = 0;
  let testLoc = 0;
  let components = 0;
  let routes = 0;
  let todoCount = 0;
  const fileLocs = [];
  for (const file of ctx.files) {
    const lang = LANG_BY_EXT[file.ext];
    if (!lang) continue;
    const content = await ctx.read(file.rel);
    if (content == null) continue;
    const loc = countLoc(content);
    const entry = langTotals.get(lang) ?? { files: 0, loc: 0 };
    entry.files++;
    entry.loc += loc.total;
    langTotals.set(lang, entry);
    if (file.isCode) {
      totalLoc += loc.total;
      codeLoc += loc.code;
      commentLoc += loc.comment;
      blankLoc += loc.blank;
      fileLocs.push({ path: file.rel, loc: loc.total });
      todoCount += (content.match(/\b(TODO|FIXME|HACK|XXX)\b/g) ?? []).length;
      if (file.isTest) {
        testFiles++;
        testLoc += loc.total;
      }
      if (isComponentFile(file.rel, content)) components++;
      if (isRouteFile(file.rel)) routes++;
    }
  }
  const totalFiles = ctx.files.length;
  const languages = [...langTotals.entries()].map(([language, v]) => ({ language, files: v.files, loc: v.loc, share: 0 })).sort((a, b) => b.loc - a.loc);
  const langLocSum = languages.reduce((s, l) => s + l.loc, 0) || 1;
  for (const l of languages) l.share = Math.round(l.loc / langLocSum * 1e3) / 10;
  const stats = {
    totalFiles,
    totalLoc,
    codeLoc,
    commentLoc,
    blankLoc,
    testFiles,
    testLoc,
    components,
    routes,
    largestFiles: fileLocs.sort((a, b) => b.loc - a.loc).slice(0, 8),
    languages,
    commentRatio: codeLoc > 0 ? Math.round(commentLoc / (codeLoc + commentLoc) * 1e3) / 10 : 0,
    testRatio: codeLoc > 0 ? Math.round(testLoc / codeLoc * 1e3) / 10 : 0,
    todoCount
  };
  const tooling = [
    { name: "TypeScript", dep: "typescript" },
    { name: "ESLint", dep: "eslint" },
    { name: "Prettier", dep: "prettier" },
    { name: "Tailwind CSS", dep: "tailwindcss" },
    { name: "Husky", dep: "husky" },
    { name: "Vitest", dep: "vitest" },
    { name: "Jest", dep: "jest" },
    { name: "Playwright", dep: "@playwright/test" }
  ].map((t) => ({
    name: t.name,
    version: ctx.deps[t.dep]?.replace(/^[\^~]/, ""),
    detected: ctx.hasDep(t.dep)
  }));
  return { configs, stats, tooling };
}
function summarize(id, body) {
  switch (id) {
    case "ts": {
      const strict = /"strict"\s*:\s*true/.test(body);
      const target = body.match(/"target"\s*:\s*"([^"]+)"/)?.[1];
      return `${strict ? "Strict mode on" : "Strict mode OFF"}${target ? `, target ${target}` : ""}.`;
    }
    case "eslint":
      return "ESLint configured for the project.";
    case "tailwind":
      return "Tailwind CSS configured.";
    case "next":
      return "Next.js configuration present.";
    default:
      return "Configured.";
  }
}
function highlightsFor(id, body) {
  if (id === "ts") {
    const flag = (name) => new RegExp(`"${name}"\\s*:\\s*true`).test(body);
    return [
      { label: "strict", value: flag("strict") ? "true" : "false", good: flag("strict") },
      { label: "noUncheckedIndexedAccess", value: flag("noUncheckedIndexedAccess") ? "true" : "false", good: flag("noUncheckedIndexedAccess") },
      { label: "skipLibCheck", value: flag("skipLibCheck") ? "true" : "false" }
    ];
  }
  return void 0;
}
function ruleCountFor(id, body) {
  if (id === "eslint") {
    const rulesBlock = body.match(/rules\s*[:=]\s*\{([\s\S]*?)\}/)?.[1];
    if (!rulesBlock) return void 0;
    return (rulesBlock.match(/['"][\w@/-]+['"]\s*:/g) ?? []).length;
  }
  return void 0;
}

// src/insights/docs.ts
function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}
function bandFor(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "needs-improvement";
  return "poor";
}
function gradeFor(score) {
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
var DOC_FILES = [
  { name: "README", paths: ["README.md", "readme.md", "README.mdx"] },
  { name: "CONTRIBUTING", paths: ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"] },
  { name: "LICENSE", paths: ["LICENSE", "LICENSE.md", "LICENSE.txt"] },
  { name: "CHANGELOG", paths: ["CHANGELOG.md"] },
  { name: "Code of Conduct", paths: ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"] },
  { name: "llms.txt", paths: ["llms.txt", "public/llms.txt"] },
  { name: "AGENTS.md", paths: ["AGENTS.md", ".github/AGENTS.md"] },
  { name: "Security Policy", paths: ["SECURITY.md", ".github/SECURITY.md"] }
];
async function collectDocs(ctx) {
  const docContents = /* @__PURE__ */ new Map();
  const documents = [];
  for (const def of DOC_FILES) {
    const found = def.paths.find((p) => ctx.files.some((f) => f.rel === p));
    const body = found ? await ctx.read(found) ?? "" : "";
    const present = Boolean(found);
    if (found) docContents.set(def.name, body);
    const words = wordCount(body);
    documents.push({
      name: def.name,
      path: found ?? def.paths[0],
      present,
      words,
      score: present ? Math.min(100, 40 + Math.min(60, Math.floor(words / 20))) : 0,
      note: present ? `${words} words` : "Not found"
    });
  }
  const readme = docContents.get("README") ?? "";
  const hasReadme = readme.length > 0;
  const readmeWords = wordCount(readme);
  const qualityChecks = [
    check("readme-present", "README exists", hasReadme, 3, hasReadme ? "README.md found." : "No README found.", false, "Add a README.md describing the project."),
    check("readme-depth", "README is substantial", readmeWords >= 200, 2, `${readmeWords} words.`, false, "Expand the README to cover setup, usage, and architecture."),
    check("install", "Install instructions", /\b(install|npm i|pnpm|yarn|getting started)\b/i.test(readme), 2, "Looks for setup steps.", false, "Document how to install and run the project."),
    check("usage", "Usage / examples", /```|\bexample\b|\busage\b/i.test(readme), 2, "Looks for code blocks or usage.", false, "Add usage examples or code snippets."),
    check("license", "License declared", documents.find((d) => d.name === "LICENSE").present, 1, "LICENSE file presence.", false, "Add a LICENSE file."),
    check("contributing", "Contributing guide", documents.find((d) => d.name === "CONTRIBUTING").present, 1, "CONTRIBUTING file presence.", false, "Add a CONTRIBUTING.md.")
  ];
  const llms = docContents.get("llms.txt") ?? "";
  const llmsChecks = [
    check("llms-present", "llms.txt present", llms.length > 0, 3, llms ? "Found llms.txt." : "No llms.txt.", true, "Add an llms.txt to guide AI agents (llmstxt.org)."),
    check("llms-links", "Contains structured links", /\[.+\]\(.+\)/.test(llms), 2, "Markdown links for agents to follow.", true, "List key docs as markdown links in llms.txt."),
    check("agents-md", "AGENTS.md present", (docContents.get("AGENTS.md") ?? "").length > 0, 2, "Agent contribution guide.", true, "Add an AGENTS.md describing build/test commands for agents.")
  ];
  const hasMeta = ctx.files.some((f) => /metadata|head|sitemap|robots/.test(f.rel));
  const vercelChecks = [
    check("metadata", "SEO metadata", hasMeta, 2, "Looks for metadata/sitemap/robots.", true, "Export metadata and add sitemap.ts/robots.ts."),
    check("readme-deploy", "Deploy docs", /deploy|vercel|netlify|docker/i.test(readme), 1, "Deployment guidance in README.", false, "Document deployment steps.")
  ];
  let commentedExports = 0;
  let totalExports = 0;
  for (const f of ctx.codeFiles().slice(0, 200)) {
    const c = await ctx.read(f.rel);
    if (!c) continue;
    const exportMatches = c.match(/^export\s+(async\s+)?(function|const|class|interface|type)\s/gm) ?? [];
    totalExports += exportMatches.length;
    commentedExports += (c.match(/\/\*\*[\s\S]*?\*\/\s*export\s/g) ?? []).length;
  }
  const docCoverage = totalExports > 0 ? commentedExports / totalExports : 0;
  const farmingChecks = [
    check("jsdoc", "Exports documented", docCoverage >= 0.2, 2, `${Math.round(docCoverage * 100)}% of exports have JSDoc.`, true, "Add JSDoc comments to exported APIs."),
    check("todos", "Few stray TODOs", true, 1, "Tracked separately in Setup.", false)
  ];
  const standards = [
    buildStandard("quality", "Documentation Quality", "Is the project understandable to humans?", "CodeLens", "#", 0.4, qualityChecks),
    buildStandard("llmstxt", "llms.txt", "Can AI agents discover your docs?", "llmstxt.org", "https://llmstxt.org", 0.25, llmsChecks),
    buildStandard("vercel", "Web & SEO Readiness", "Is the app discoverable and deployable?", "Vercel", "https://vercel.com", 0.2, vercelChecks),
    buildStandard("farming", "Inline API Docs", "Are exported APIs documented in code?", "CodeLens", "#", 0.15, farmingChecks)
  ];
  const score = Math.round(standards.reduce((sum, s) => sum + s.score * s.weight, 0));
  const agentStandards = standards.filter((s) => s.id === "llmstxt" || s.id === "vercel");
  const agentScore = Math.round(
    agentStandards.reduce((sum, s) => sum + s.score, 0) / (agentStandards.length || 1)
  );
  return {
    score,
    grade: gradeFor(score),
    band: bandFor(score),
    agentReady: agentScore >= 60,
    agentScore,
    liveUrl: null,
    // populated only in live-URL probe mode
    standards,
    documents
  };
}
function check(id, label, passed, weight, detail, agent, fix) {
  return { id, label, status: passed ? "pass" : "fail", detail, weight, agent, fix: passed ? void 0 : fix };
}
function buildStandard(id, label, tagline, source, href, weight, checks) {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = checks.reduce((s, c) => s + (c.status === "pass" ? c.weight : 0), 0);
  const score = Math.round(earned / totalWeight * 100);
  return { id, label, tagline, source, href, score, weight, band: bandFor(score), checks };
}

// src/insights/database.ts
var CLIENTS = [
  { dep: "@neondatabase/serverless", engine: "postgres", client: "Neon", pooled: true },
  { dep: "pg", engine: "postgres", client: "node-postgres" },
  { dep: "postgres", engine: "postgres", client: "postgres.js" },
  { dep: "@vercel/postgres", engine: "postgres", client: "Vercel Postgres", pooled: true },
  { dep: "drizzle-orm", engine: "postgres", client: "Drizzle ORM" },
  { dep: "@prisma/client", engine: "postgres", client: "Prisma", pooled: true },
  { dep: "mysql2", engine: "mysql", client: "mysql2" },
  { dep: "mysql", engine: "mysql", client: "mysql" },
  { dep: "mongodb", engine: "mongodb", client: "MongoDB driver" },
  { dep: "mongoose", engine: "mongodb", client: "Mongoose" },
  { dep: "better-sqlite3", engine: "sqlite", client: "better-sqlite3" },
  { dep: "@libsql/client", engine: "sqlite", client: "libSQL/Turso", pooled: true },
  { dep: "ioredis", engine: "redis", client: "ioredis" },
  { dep: "redis", engine: "redis", client: "node-redis" },
  { dep: "@upstash/redis", engine: "redis", client: "Upstash Redis", pooled: true }
];
var DB_ENV_HINTS = /(DATABASE_URL|POSTGRES_URL|PG_|MYSQL_|MONGO_URL|MONGODB_URI|REDIS_URL|KV_URL|DB_)/i;
async function collectDatabase(ctx) {
  const connections = [];
  const findings = [];
  const queries = [];
  const detected = CLIENTS.filter((c) => ctx.hasDep(c.dep));
  let connEnv = "";
  const envExample = await ctx.read(".env.example") ?? await ctx.read(".env") ?? "";
  connEnv = envExample.split("\n").map((l) => l.split("=")[0]?.trim()).find((k) => k && DB_ENV_HINTS.test(k)) ?? "";
  detected.forEach((c, i) => {
    connections.push({
      id: `db-${i + 1}`,
      engine: c.engine,
      name: c.client,
      client: c.client,
      host: connEnv ? `env:${connEnv}` : "unknown",
      ssl: c.pooled === true || /postgres|mysql/.test(c.engine),
      pooled: c.pooled ?? false,
      envVar: connEnv,
      collections: 0,
      filePath: "package.json"
    });
  });
  const sqlEngine = detected.find((d) => d.engine === "postgres" || d.engine === "mysql")?.engine ?? "postgres";
  let queryId = 0;
  for (const file of ctx.codeFiles()) {
    const content = await ctx.read(file.rel);
    if (!content) continue;
    if (!/(query|sql|prisma|db\.|collection|find\(|aggregate|execute|\$queryRaw)/i.test(content)) continue;
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (/(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}/i.test(line) && /`[^`]*\$\{|["'][^"']*"\s*\+|\+\s*(req|request|params|query|body)/.test(line)) {
        findings.push(finding(`db-inj-${++queryId}`, sqlEngine, "injection", "critical", "Possible SQL injection", "Query appears to interpolate user input directly into SQL. Use parameterized queries.", file.rel, lineNo, "Use parameterized queries / prepared statements instead of string concatenation.", snippetAround(content, lineNo)));
      }
      if (/queryRawUnsafe|executeRawUnsafe|\.raw\(/.test(line)) {
        findings.push(finding(`db-raw-${++queryId}`, sqlEngine, "unparameterized", "high", "Unsafe raw query", "Raw/unsafe query execution bypasses parameterization.", file.rel, lineNo, "Prefer the safe tagged-template or parameterized variant.", snippetAround(content, lineNo)));
      }
      if (/SELECT\s+\*/i.test(line) && !/\blimit\b/i.test(line)) {
        findings.push(finding(`db-unb-${++queryId}`, sqlEngine, "unbounded-query", "medium", "Unbounded SELECT *", "Selecting all columns/rows without a LIMIT can load excessive data.", file.rel, lineNo, "Select only needed columns and add a LIMIT / pagination.", snippetAround(content, lineNo)));
        queries.push({ id: `q-${queryId}`, engine: sqlEngine, operation: "SELECT", target: "(table)", filePath: file.rel, line: lineNo, estMs: 120, fullScan: true, note: "SELECT * without LIMIT" });
      }
      if (/\.(find|findOne|findUnique|aggregate)\s*\(/.test(line) && /(\.map\(|for\s*\(|forEach)/.test(lines.slice(Math.max(0, idx - 3), idx).join("\n"))) {
        findings.push(finding(`db-nplus-${++queryId}`, detected.find((d) => d.engine === "mongodb") ? "mongodb" : sqlEngine, "n+1", "high", "Potential N+1 query", "A query inside a loop can trigger many round-trips.", file.rel, lineNo, "Batch with a single query, JOIN, or use an IN clause / dataloader.", snippetAround(content, lineNo)));
      }
    });
  }
  if (detected.some((d) => d.engine === "postgres") && !detected.some((d) => d.pooled)) {
    findings.push(finding("db-pool", "postgres", "no-pooling", "medium", "No connection pooling detected", "Direct Postgres connections without pooling can exhaust connections under load on serverless.", "package.json", void 0, "Use a pooled driver (Neon serverless, @vercel/postgres) or a pooler like PgBouncer."));
  }
  const collections = connections.reduce((s, c) => s + c.collections, 0);
  const slowQueries = queries.filter((q) => q.fullScan || q.estMs > 100).length;
  return {
    connections,
    findings: findings.sort((a, b) => sevRank(b.severity) - sevRank(a.severity)),
    queries,
    counts: { connections: connections.length, collections, findings: findings.length, slowQueries }
  };
}
function finding(id, engine, kind, severity, title, detail, filePath, line, recommendation, snippet) {
  return { id, engine, kind, severity, title, detail, filePath, line, recommendation, snippet };
}
function sevRank(s) {
  const order = { critical: 6, high: 5, error: 5, medium: 4, warning: 3, low: 2, info: 1 };
  return order[s] ?? 0;
}

// src/insights/accessibility.ts
var RULES = [
  {
    rule: "image-alt",
    impact: "critical",
    principle: "Perceivable",
    wcag: ["1.1.1"],
    description: "Images must have alternate text",
    help: "Add an alt attribute to <img> elements",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/image-alt",
    test: (l) => /<img\b/.test(l) && !/\balt\s*=/.test(l),
    recommendation: 'Add a descriptive alt="" (empty for decorative images).'
  },
  {
    rule: "button-name",
    impact: "critical",
    principle: "Operable",
    wcag: ["4.1.2"],
    description: "Buttons must have discernible text",
    help: "Provide text content or aria-label on buttons",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/button-name",
    test: (l) => /<button\b[^>]*\/>/.test(l) || /<button\b[^>]*>\s*<\/button>/.test(l) && !/aria-label/.test(l),
    recommendation: "Add text content or an aria-label to the button."
  },
  {
    rule: "label",
    impact: "serious",
    principle: "Perceivable",
    wcag: ["1.3.1", "4.1.2"],
    description: "Form elements must have labels",
    help: "Associate a <label> or aria-label with inputs",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/label",
    test: (l) => /<input\b/.test(l) && !/(aria-label|aria-labelledby|id\s*=|type\s*=\s*["'](hidden|submit|button)["'])/.test(l),
    recommendation: "Associate a <label htmlFor> or add aria-label to the input."
  },
  {
    rule: "anchor-has-content",
    impact: "serious",
    principle: "Operable",
    wcag: ["2.4.4", "4.1.2"],
    description: "Links must have discernible text",
    help: "Provide text content or aria-label on links",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/link-name",
    test: (l) => /<a\b[^>]*>\s*<\/a>/.test(l) && !/aria-label/.test(l),
    recommendation: "Add link text or an aria-label."
  },
  {
    rule: "html-has-lang",
    impact: "serious",
    principle: "Understandable",
    wcag: ["3.1.1"],
    description: "<html> element must have a lang attribute",
    help: "Add lang to the root <html>",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/html-has-lang",
    test: (l) => /<html\b/.test(l) && !/\blang\s*=/.test(l),
    recommendation: 'Add lang="en" (or appropriate locale) to <html>.'
  },
  {
    rule: "no-positive-tabindex",
    impact: "serious",
    principle: "Operable",
    wcag: ["2.4.3"],
    description: "Avoid positive tabindex values",
    help: "Positive tabindex disrupts natural focus order",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/tabindex",
    test: (l) => /tabindex\s*=\s*["']?[1-9]/i.test(l),
    recommendation: "Use tabindex={0} or restructure DOM order instead of positive values."
  },
  {
    rule: "click-events-have-key-events",
    impact: "moderate",
    principle: "Operable",
    wcag: ["2.1.1"],
    description: "Clickable non-interactive elements need keyboard handlers",
    help: "Add onKeyDown/role/button when using onClick on div/span",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/aria-required-attr",
    test: (l) => /<(div|span)\b[^>]*onClick/.test(l) && !/(onKeyDown|onKeyUp|role\s*=)/.test(l),
    recommendation: "Use a <button>, or add role and keyboard handlers."
  },
  {
    rule: "viewport-no-zoom",
    impact: "moderate",
    principle: "Perceivable",
    wcag: ["1.4.4"],
    description: "Users must be able to zoom",
    help: "Avoid user-scalable=no / maximum-scale=1",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.8/meta-viewport",
    test: (l) => /user-scalable\s*=\s*no|maximum-scale\s*=\s*1\b/.test(l),
    recommendation: "Remove user-scalable=no and allow zooming."
  }
];
var IMPACT_WEIGHT = { critical: 12, serious: 7, moderate: 3, minor: 1 };
async function collectAccessibility(ctx) {
  const violations = [];
  let passes = 0;
  let id = 0;
  const jsxFiles = ctx.codeFiles((rel) => /\.(tsx|jsx|vue|svelte|html)$/.test(rel));
  for (const file of jsxFiles) {
    const content = await ctx.read(file.rel);
    if (!content || !/</.test(content)) continue;
    const lines = content.split("\n");
    for (const rule of RULES) {
      let matchedInFile = false;
      lines.forEach((line, idx) => {
        if (rule.test(line)) {
          matchedInFile = true;
          violations.push({
            id: `a11y-${++id}`,
            rule: rule.rule,
            impact: rule.impact,
            principle: rule.principle,
            wcag: rule.wcag,
            description: rule.description,
            help: rule.help,
            helpUrl: rule.helpUrl,
            filePath: file.rel,
            line: idx + 1,
            selector: extractSelector(line),
            nodes: 1,
            recommendation: rule.recommendation,
            snippet: snippetAround(content, idx + 1)
          });
        }
      });
      if (!matchedInFile) passes++;
    }
  }
  const counts = {
    critical: violations.filter((v) => v.impact === "critical").length,
    serious: violations.filter((v) => v.impact === "serious").length,
    moderate: violations.filter((v) => v.impact === "moderate").length,
    minor: violations.filter((v) => v.impact === "minor").length
  };
  const penalty = violations.reduce((s, v) => s + IMPACT_WEIGHT[v.impact], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const byPrincipleMap = /* @__PURE__ */ new Map();
  for (const v of violations) byPrincipleMap.set(v.principle, (byPrincipleMap.get(v.principle) ?? 0) + 1);
  const principles = ["Perceivable", "Operable", "Understandable", "Robust"];
  return {
    score,
    violations: violations.sort((a, b) => IMPACT_WEIGHT[b.impact] - IMPACT_WEIGHT[a.impact]),
    passes,
    incomplete: 0,
    counts,
    byPrinciple: principles.map((principle) => ({ principle, count: byPrincipleMap.get(principle) ?? 0 }))
  };
}
function extractSelector(line) {
  const tag = line.match(/<([a-zA-Z][\w-]*)/)?.[1] ?? "element";
  const cls = line.match(/className\s*=\s*["']([^"']+)["']/)?.[1]?.split(/\s+/)[0];
  return cls ? `${tag}.${cls}` : tag;
}

// src/insights/performance.ts
import { promises as fs6 } from "fs";
import path6 from "path";
var HEAVY_DEPS = {
  moment: 290,
  lodash: 70,
  "moment-timezone": 180,
  rxjs: 200,
  "chart.js": 240,
  "@mui/material": 350,
  three: 600,
  "pdfjs-dist": 400,
  "monaco-editor": 900,
  "@ffmpeg/ffmpeg": 800
};
async function dirSizeKb2(dir2) {
  let total = 0;
  try {
    const entries = await fs6.readdir(dir2, { withFileTypes: true });
    for (const e of entries) {
      const p = path6.join(dir2, e.name);
      if (e.isDirectory()) total += await dirSizeKb2(p);
      else {
        try {
          total += (await fs6.stat(p)).size;
        } catch {
        }
      }
    }
  } catch {
  }
  return total / 1024;
}
async function collectPerformance(ctx) {
  const findings = [];
  let id = 0;
  let usesNextImage = false;
  for (const file of ctx.codeFiles((rel) => /\.(tsx|jsx|vue|svelte|html)$/.test(rel))) {
    const content = await ctx.read(file.rel);
    if (!content) continue;
    if (/from\s+["']next\/image["']/.test(content)) usesNextImage = true;
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (/<img\b/.test(line) && ctx.hasDep("next")) {
        findings.push(perf(`perf-img-${++id}`, "unoptimized-image", "medium", "Unoptimized <img> tag", "Using a raw <img> in a Next.js app skips automatic image optimization.", file.rel, lineNo, "Use next/image for automatic resizing, lazy-loading, and modern formats.", 40, snippetAround(content, lineNo)));
      }
      if (/<script\b(?![^>]*\b(async|defer)\b)[^>]*\bsrc=/.test(line)) {
        findings.push(perf(`perf-script-${++id}`, "sync-script", "medium", "Render-blocking script", "A synchronous <script src> blocks rendering until it loads.", file.rel, lineNo, "Add async or defer to the script tag.", 0, snippetAround(content, lineNo)));
      }
    });
  }
  for (const [dep, kb] of Object.entries(HEAVY_DEPS)) {
    if (ctx.hasDep(dep)) {
      findings.push(perf(`perf-dep-${++id}`, "large-dependency", kb > 300 ? "high" : "medium", `Heavy dependency: ${dep}`, `${dep} adds roughly ${kb}KB to the bundle.`, "package.json", void 0, suggestionFor(dep), kb));
    }
  }
  const usesDynamic = await anyFileMatches(ctx, /(import\(|next\/dynamic|React\.lazy|defineAsyncComponent)/);
  if (!usesDynamic && ctx.codeFiles().length > 60) {
    findings.push(perf(`perf-split-${++id}`, "no-code-split", "low", "No code-splitting detected", "The project doesn't appear to use dynamic imports, so all code may ship in one chunk.", "\u2014", void 0, "Lazy-load heavy routes/components with dynamic import().", 0));
  }
  const bundles = [];
  let totalBundleKb = 0;
  for (const outDir of [".next/static", "dist/assets", "build/static", "out/_next"]) {
    const abs = path6.join(ctx.root, outDir);
    const kb = await dirSizeKb2(abs);
    if (kb > 0) {
      totalBundleKb = Math.round(kb);
      break;
    }
  }
  if (totalBundleKb === 0) {
    const depCount = Object.keys(ctx.deps).length;
    totalBundleKb = Math.round(120 + depCount * 6 + Object.entries(HEAVY_DEPS).reduce((s, [d, kb]) => s + (ctx.hasDep(d) ? kb : 0), 0));
  }
  const penalty = findings.reduce((s, f) => s + sevWeight(f.severity), 0);
  const bundlePenalty = totalBundleKb > 500 ? Math.min(25, Math.round((totalBundleKb - 500) / 80)) : 0;
  const score = Math.max(0, Math.min(100, 100 - penalty - bundlePenalty + (usesNextImage ? 3 : 0)));
  const vitals = [];
  return {
    score,
    vitals,
    bundles,
    findings: findings.sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity)),
    totalBundleKb,
    counts: { findings: findings.length }
  };
}
async function anyFileMatches(ctx, re) {
  for (const f of ctx.codeFiles()) {
    const c = await ctx.read(f.rel);
    if (c && re.test(c)) return true;
  }
  return false;
}
function suggestionFor(dep) {
  const map = {
    moment: "Replace moment with date-fns or day.js (far smaller and tree-shakeable).",
    "moment-timezone": "Use date-fns-tz or Intl.DateTimeFormat instead.",
    lodash: "Import individual functions (lodash-es) or use native methods.",
    three: "Lazy-load the 3D view and import only needed three modules.",
    "monaco-editor": "Lazy-load the editor and load it on demand."
  };
  return map[dep] ?? `Consider a lighter alternative to ${dep} or load it lazily.`;
}
function perf(id, kind, severity, title, detail, filePath, line, recommendation, estimatedSavingKb, snippet) {
  return { id, kind, severity, title, detail, filePath, line, recommendation, estimatedSavingKb, snippet };
}
function sevWeight(s) {
  const order = { critical: 14, high: 9, error: 9, medium: 5, warning: 4, low: 2, info: 1 };
  return order[s] ?? 0;
}

// src/insights/tests.ts
import { promises as fs7 } from "fs";
import path7 from "path";
function detectFramework(ctx) {
  if (ctx.hasDep("vitest")) return "Vitest";
  if (ctx.hasDep("jest")) return "Jest";
  if (ctx.hasDep("@playwright/test")) return "Playwright";
  if (ctx.hasDep("mocha")) return "Mocha";
  if (ctx.hasDep("ava")) return "AVA";
  if (ctx.hasDep("@testing-library/react")) return "Testing Library";
  return "none";
}
async function readCoverage(root) {
  const candidates = [
    "coverage/coverage-summary.json",
    "coverage/coverage-final.json",
    ".nyc_output/coverage-summary.json"
  ];
  for (const rel of candidates) {
    try {
      const raw = await fs7.readFile(path7.join(root, rel), "utf8");
      const json = JSON.parse(raw);
      const total = json.total;
      if (!total) continue;
      const pct = (k) => Math.round(total[k]?.pct ?? 0);
      const files = [];
      for (const [key, val] of Object.entries(json)) {
        if (key === "total" || !val || typeof val !== "object") continue;
        files.push({
          filePath: path7.relative(root, key).split(path7.sep).join("/"),
          lines: Math.round(val.lines?.pct ?? 0),
          functions: Math.round(val.functions?.pct ?? 0),
          branches: Math.round(val.branches?.pct ?? 0),
          statements: Math.round(val.statements?.pct ?? 0)
        });
      }
      return {
        totals: { lines: pct("lines"), functions: pct("functions"), branches: pct("branches"), statements: pct("statements") },
        files
      };
    } catch {
    }
  }
  return null;
}
async function collectTests(ctx) {
  const framework = detectFramework(ctx);
  const findings = [];
  const suites = [];
  const testFiles = ctx.files.filter((f) => f.isTest && f.isCode);
  for (const f of testFiles) {
    const content = await ctx.read(f.rel);
    if (!content) continue;
    const cases = (content.match(/\b(it|test)\s*(\.\s*(only|skip|concurrent|each))?\s*\(/g) ?? []).length;
    const skipped = (content.match(/\b(it|test|describe)\s*\.\s*skip\s*\(/g) ?? []).length;
    const todos = (content.match(/\b(it|test)\s*\.\s*todo\s*\(/g) ?? []).length;
    const total = cases + todos;
    if (total === 0) continue;
    suites.push({
      id: `suite-${suites.length + 1}`,
      name: f.rel.split("/").pop() ?? f.rel,
      filePath: f.rel,
      total,
      passed: 0,
      // unknown without running
      failed: 0,
      skipped: skipped + todos,
      durationMs: 0,
      status: "skipped"
    });
    if (cases > 40) {
      findings.push(tf(`test-large-${suites.length}`, "slow", "low", `Large test file (${cases} cases)`, "Very large test files are slow to run and hard to maintain.", f.rel, "Split into focused suites."));
    }
  }
  const cov = await readCoverage(ctx.root);
  const coverage = cov?.totals ?? { lines: 0, functions: 0, branches: 0, statements: 0 };
  const files = cov?.files ?? [];
  if (framework === "none") {
    findings.push(tf("test-none", "no-tests", "high", "No test framework detected", "The project has no test runner configured, so regressions can ship undetected.", "package.json", "Add Vitest or Jest and start with smoke tests for critical paths."));
  } else if (testFiles.length === 0) {
    findings.push(tf("test-empty", "no-tests", "high", `${framework} installed but no test files found`, "A test runner is present but there are no test files.", "\u2014", "Add *.test.ts / *.spec.ts files covering core logic."));
  }
  if (framework !== "none") {
    const sourceFiles = ctx.codeFiles((rel) => !/(test|spec)\./.test(rel) && !/\.d\.ts$/.test(rel) && /(lib|src|app|components|server|utils)\//.test(rel));
    const tested = new Set(testFiles.map((f) => f.rel.replace(/\.(test|spec)\./, ".")));
    const uncovered = sourceFiles.filter((f) => !tested.has(f.rel)).slice(0, 0);
    void uncovered;
  }
  if (cov && coverage.lines < 60) {
    findings.push(tf("test-lowcov", "uncovered", coverage.lines < 30 ? "high" : "medium", `Line coverage is ${coverage.lines}%`, "Coverage is below a healthy threshold; large parts of the code are untested.", "coverage", "Add tests to raise line coverage above 70%."));
  }
  const counts = {
    total: suites.reduce((s, x) => s + x.total, 0),
    passed: suites.reduce((s, x) => s + x.passed, 0),
    failed: suites.reduce((s, x) => s + x.failed, 0),
    skipped: suites.reduce((s, x) => s + x.skipped, 0),
    suites: suites.length,
    durationMs: suites.reduce((s, x) => s + x.durationMs, 0)
  };
  return { framework, coverage, suites, findings, files, counts };
}
function tf(id, kind, severity, title, detail, filePath, recommendation) {
  return { id, kind, severity, title, detail, filePath, recommendation };
}

// src/insights/typedefs.ts
async function collectTypeDefinitions(ctx) {
  const defs = [];
  const files = ctx.codeFiles((rel) => /\.(ts|tsx)$/.test(rel) && !rel.endsWith(".d.ts"));
  for (const file of files) {
    const content = await ctx.read(file.rel);
    if (!content) continue;
    extractFromFile(file.rel, content, defs);
  }
  if (defs.length > 0 && defs.length <= 400) {
    const names = defs.map((d) => d.name);
    const counts = new Map(names.map((n) => [n, 0]));
    for (const file of files) {
      const content = await ctx.read(file.rel);
      if (!content) continue;
      for (const name of names) {
        const re = new RegExp(`\\b${escapeRe(name)}\\b`, "g");
        const m = content.match(re);
        if (m) counts.set(name, (counts.get(name) ?? 0) + m.length);
      }
    }
    for (const d of defs) {
      d.references = Math.max(0, (counts.get(d.name) ?? 1) - 1);
    }
  }
  return defs.sort((a, b) => b.references - a.references).slice(0, 500);
}
var DECL_RE = /(?:^|\n)([ \t]*)(export\s+)?(?:declare\s+)?(?:(abstract)\s+)?(interface|type|enum|class)\s+([A-Za-z_$][\w$]*)\s*(<[^>{=]*>)?/g;
function extractFromFile(filePath, content, out) {
  const lines = content.split("\n");
  let m;
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(content)) !== null) {
    const [, , exportKw, , kindRaw, name, generics] = m;
    const kind = kindRaw;
    const declStart = m.index + (m[0].startsWith("\n") ? 1 : 0);
    const line = content.slice(0, declStart).split("\n").length;
    const doc = extractDocAbove(lines, line - 1);
    let source = "";
    let members = [];
    let extendsFrom;
    if (kind === "type") {
      const eq = content.indexOf("=", m.index);
      const body = readTypeAlias(content, eq + 1);
      source = `type ${name}${generics ?? ""} = ${body.trim()}`;
      members = parseUnionOrObjectMembers(body);
      extendsFrom = parseUnionRefs(body);
    } else {
      const braceStart = content.indexOf("{", m.index);
      if (braceStart === -1) continue;
      const heading = content.slice(m.index, braceStart);
      extendsFrom = parseHeritage(heading);
      const block = readBalanced(content, braceStart);
      source = `${exportKw ? "export " : ""}${kindRaw} ${name}${generics ?? ""}${formatHeritage(extendsFrom, kind)} ${block}`;
      members = kind === "enum" ? parseEnumMembers(block) : parseInterfaceMembers(block);
    }
    out.push({
      id: `type-${out.length + 1}`,
      name,
      kind,
      filePath,
      line,
      exported: Boolean(exportKw),
      references: 1,
      generics: generics ? splitGenerics(generics) : void 0,
      extendsFrom: extendsFrom && extendsFrom.length ? extendsFrom : void 0,
      members,
      source: source.slice(0, 4e3),
      doc
    });
  }
}
function extractDocAbove(lines, declLineIdx) {
  let i = declLineIdx - 1;
  if (i < 0) return void 0;
  if (!lines[i]?.trim().endsWith("*/")) return void 0;
  const collected = [];
  while (i >= 0) {
    collected.unshift(lines[i]);
    if (lines[i].trim().startsWith("/**") || lines[i].trim().startsWith("/*")) break;
    i--;
  }
  const text = collected.join("\n").replace(/\/\*\*?|\*\//g, "").split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean).join(" ").trim();
  return text || void 0;
}
function readBalanced(content, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return content.slice(openIdx, i + 1);
    }
  }
  return content.slice(openIdx, Math.min(content.length, openIdx + 4e3));
}
function readTypeAlias(content, start) {
  let depth = 0;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (ch === "{" || ch === "(" || ch === "<" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === ">" || ch === "]") depth--;
    else if ((ch === ";" || ch === "\n") && depth <= 0) {
      const slice = content.slice(start, i);
      if (ch === "\n" && /[=|&,(<{[]\s*$/.test(slice)) continue;
      return slice;
    }
  }
  return content.slice(start, Math.min(content.length, start + 2e3));
}
function parseInterfaceMembers(block) {
  const inner = block.replace(/^\{/, "").replace(/\}$/, "");
  const members = [];
  let depth = 0;
  let buf = "";
  const flush = () => {
    const line = buf.trim();
    buf = "";
    if (!line || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) return;
    const mm = line.match(/^(readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*([\s\S]+)$/);
    if (mm) {
      members.push({
        name: mm[2],
        type: mm[4].replace(/[;,]\s*$/, "").trim().slice(0, 200),
        optional: Boolean(mm[3]),
        readonly: Boolean(mm[1])
      });
    }
  };
  for (const ch of inner) {
    if (ch === "{" || ch === "(" || ch === "<" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === ">" || ch === "]") depth--;
    if ((ch === ";" || ch === "\n") && depth <= 0) flush();
    else buf += ch;
  }
  flush();
  return members.slice(0, 60);
}
function parseEnumMembers(block) {
  const inner = block.replace(/^\{/, "").replace(/\}$/, "");
  return inner.split(",").map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [name, value] = entry.split("=").map((x) => x.trim());
    return { name: name.replace(/['"]/g, ""), type: value ? value.slice(0, 80) : "auto" };
  }).slice(0, 60);
}
function parseUnionOrObjectMembers(body) {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) return parseInterfaceMembers(readBalanced(trimmed, 0));
  if (trimmed.includes("|")) {
    return trimmed.split("|").map((s) => s.trim().replace(/[;]/g, "")).filter(Boolean).slice(0, 40).map((v) => ({ name: v, type: "union member" }));
  }
  return [];
}
function parseUnionRefs(body) {
  if (!body.includes("|")) return void 0;
  const refs = body.split("|").map((s) => s.trim().replace(/[;]/g, "")).filter((s) => /^[A-Za-z_$][\w$.]*$/.test(s));
  return refs.length ? refs.slice(0, 20) : void 0;
}
function parseHeritage(heading) {
  const ext = heading.match(/extends\s+([^{]+?)(?:implements|$)/)?.[1] ?? "";
  const impl = heading.match(/implements\s+([^{]+)$/)?.[1] ?? "";
  return [...ext.split(","), ...impl.split(",")].map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 80));
}
function formatHeritage(refs, kind) {
  if (!refs || !refs.length || kind === "enum") return "";
  return ` extends ${refs.join(", ")}`;
}
function splitGenerics(generics) {
  return generics.replace(/^<|>$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/insights/index.ts
async function collectInsights(scan, onProgress) {
  const safe = async (label, fn, fallback) => {
    try {
      const result = await fn();
      onProgress?.(label);
      return result;
    } catch (err) {
      onProgress?.(`${label} (failed)`);
      if (process.env.CODELENS_DEBUG) {
        console.error(`[codelens] insight "${label}" failed:`, err);
      }
      return fallback;
    }
  };
  const [env, network, git2, setup, docs, database, accessibility, performance, tests, typeDefinitions] = await Promise.all([
    safe("env", () => collectEnv(scan), emptyEnv()),
    safe("network", () => collectNetwork(scan), emptyNetwork()),
    safe("git", () => collectGit(scan), emptyGit()),
    safe("setup", () => collectSetup(scan), emptySetup()),
    safe("docs", () => collectDocs(scan), emptyDocs()),
    safe("database", () => collectDatabase(scan), emptyDb()),
    safe("accessibility", () => collectAccessibility(scan), emptyA11y()),
    safe("performance", () => collectPerformance(scan), emptyPerf()),
    safe("tests", () => collectTests(scan), emptyTests()),
    safe("types", () => collectTypeDefinitions(scan), [])
  ]);
  return {
    insights: { env, network, git: git2, setup, docs, database, accessibility, performance, tests },
    typeDefinitions
  };
}
function emptyEnv() {
  return { files: [], variables: [], counts: { total: 0, client: 0, server: 0, issues: 0 } };
}
function emptyNetwork() {
  return { calls: [], domains: [], counts: { total: 0, external: 0, insecure: 0, issues: 0 } };
}
function emptyGit() {
  return {
    state: {
      branch: "\u2014",
      defaultBranch: "main",
      ahead: 0,
      behind: 0,
      remote: "",
      lastCommit: { hash: "", message: "unavailable", author: "\u2014", relative: "\u2014" },
      changes: [],
      staged: 0,
      contributors: 0,
      totalCommits: 0
    },
    issues: [],
    workflows: []
  };
}
function emptySetup() {
  return {
    configs: [],
    stats: {
      totalFiles: 0,
      totalLoc: 0,
      codeLoc: 0,
      commentLoc: 0,
      blankLoc: 0,
      testFiles: 0,
      testLoc: 0,
      components: 0,
      routes: 0,
      largestFiles: [],
      languages: [],
      commentRatio: 0,
      testRatio: 0,
      todoCount: 0
    },
    tooling: []
  };
}
function emptyDocs() {
  return {
    score: 0,
    grade: "F",
    band: "poor",
    agentReady: false,
    agentScore: 0,
    liveUrl: null,
    standards: [],
    documents: []
  };
}
function emptyDb() {
  return { connections: [], findings: [], queries: [], counts: { connections: 0, collections: 0, findings: 0, slowQueries: 0 } };
}
function emptyA11y() {
  return {
    score: 100,
    violations: [],
    passes: 0,
    incomplete: 0,
    counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    byPrinciple: []
  };
}
function emptyPerf() {
  return { score: 100, vitals: [], bundles: [], findings: [], totalBundleKb: 0, counts: { findings: 0 } };
}
function emptyTests() {
  return {
    framework: "none",
    coverage: { lines: 0, functions: 0, branches: 0, statements: 0 },
    suites: [],
    findings: [],
    files: [],
    counts: { total: 0, passed: 0, failed: 0, skipped: 0, suites: 0, durationMs: 0 }
  };
}

// src/run.ts
async function runAnalysis(opts2) {
  const { cwd: cwd2, ai: ai2, onEvent } = opts2;
  const emit = (e) => onEvent?.(e);
  const startedAt = Date.now();
  const project = await detectProject(cwd2);
  emit({ type: "phase", phase: "detect", status: "done", project });
  emit({ type: "phase", phase: "lint", status: "running" });
  const lint = await runEslint(cwd2, project);
  emit({ type: "phase", phase: "lint", status: "done", lint });
  emit({ type: "phase", phase: "types", status: "running" });
  const types = await runTsc(cwd2, project);
  emit({ type: "phase", phase: "types", status: "done", types });
  emit({ type: "phase", phase: "deps", status: "running" });
  const advisories = await runAudit(cwd2, project);
  emit({ type: "phase", phase: "security", status: ai2 ? "running" : "skipped" });
  const security = ai2 ? await runSecurityAudit({ cwd: cwd2, project, advisories, lint, types }) : { findings: [], dependencies: advisories, skipped: true };
  emit({ type: "phase", phase: "security", status: "done", security });
  emit({ type: "phase", phase: "insights", status: "running" });
  const scan = await ScanContext.create(cwd2, project);
  const [deps, bundle] = await Promise.all([
    buildDependencyResult(scan, advisories),
    collectInsights(scan)
  ]);
  emit({ type: "phase", phase: "deps", status: "done" });
  types.definitions = bundle.typeDefinitions;
  const insights = bundle.insights;
  emit({ type: "phase", phase: "insights", status: "done" });
  const report = buildReport({
    meta: {
      cwd: cwd2,
      project,
      startedAt: new Date(startedAt).toISOString(),
      aiEnabled: ai2
    },
    startedAt,
    lint,
    types,
    security,
    deps,
    insights
  });
  emit({ type: "report", report });
  const history = [...opts2.history ?? []];
  const state = { report, insights, history };
  emit({ type: "state", state });
  return { report, insights };
}

// src/server.ts
import http from "http";
import { promises as fs8 } from "fs";
import path8 from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
var __dirname = path8.dirname(fileURLToPath(import.meta.url));
var STATIC_ROOT = path8.join(__dirname, "..", "public");
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};
async function startServer(opts2) {
  const { state, onRunRequest } = opts2;
  let running = false;
  const server = http.createServer(async (req, res) => {
    const url2 = new URL(req.url ?? "/", "http://localhost");
    if (url2.pathname === "/api/run" && req.method === "POST") {
      if (!onRunRequest) {
        res.writeHead(501, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "re-run not supported" }));
        return;
      }
      if (running) {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "a run is already in progress" }));
        return;
      }
      running = true;
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      Promise.resolve().then(() => onRunRequest()).finally(() => {
        running = false;
      });
      return;
    }
    if (url2.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state.current));
      return;
    }
    if (url2.pathname === "/api/latest") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state.current?.report ?? null));
      return;
    }
    if (url2.pathname === "/api/insights") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state.current?.insights ?? null));
      return;
    }
    if (url2.pathname === "/api/history") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state.current?.history ?? []));
      return;
    }
    await serveStatic(url2.pathname, res);
  });
  const wss = new WebSocketServer({ server, path: "/ws" });
  const sockets = /* @__PURE__ */ new Set();
  wss.on("connection", (ws) => {
    sockets.add(ws);
    if (state.current) {
      ws.send(JSON.stringify({ type: "state", state: state.current }));
    }
    ws.on("close", () => sockets.delete(ws));
  });
  const port = await listen(server, opts2.port);
  const url = `http://localhost:${port}`;
  return {
    url,
    broadcast(event) {
      const payload = JSON.stringify(event);
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    },
    close() {
      return new Promise((resolve) => {
        for (const ws of sockets) ws.close();
        wss.close(() => server.close(() => resolve()));
      });
    }
  };
}
async function serveStatic(pathname, res) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  let filePath = path8.join(STATIC_ROOT, rel);
  try {
    let data = await fs8.readFile(filePath);
    res.writeHead(200, { "content-type": MIME[path8.extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    try {
      const data = await fs8.readFile(path8.join(STATIC_ROOT, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Dashboard assets not found. Run `pnpm build` in the CLI package.");
    }
  }
}
function listen(server, preferred) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err.code === "EADDRINUSE") {
        server.listen(0);
      } else {
        reject(err);
      }
    };
    server.on("error", onError);
    server.listen(preferred, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : preferred;
      server.off("error", onError);
      resolve(port);
    });
  });
}

// src/store.ts
import { promises as fs9 } from "fs";
import path9 from "path";
var DIR = ".codelens";
var HISTORY_FILE = "history.json";
var LATEST_FILE = "latest.json";
var INSIGHTS_FILE = "insights.json";
function dir(cwd2) {
  return path9.join(cwd2, DIR);
}
async function saveRun(cwd2, report, insights) {
  const base = dir(cwd2);
  await fs9.mkdir(base, { recursive: true });
  await fs9.writeFile(path9.join(base, LATEST_FILE), JSON.stringify(report, null, 2), "utf8");
  await fs9.writeFile(path9.join(base, INSIGHTS_FILE), JSON.stringify(insights, null, 2), "utf8");
  const history = await readHistory(cwd2);
  const point = {
    runId: report.meta.id,
    timestamp: report.meta.finishedAt,
    score: report.health.score,
    lintErrors: report.lint.messages.filter((m) => m.severity === "error").length,
    lintWarnings: report.lint.messages.filter((m) => m.severity === "warning").length,
    typeErrors: report.types.diagnostics.length,
    securityFindings: report.security.findings.length
  };
  history.push(point);
  const trimmed = history.slice(-50);
  await fs9.writeFile(path9.join(base, HISTORY_FILE), JSON.stringify(trimmed, null, 2), "utf8");
}
async function readHistory(cwd2) {
  try {
    const raw = await fs9.readFile(path9.join(dir(cwd2), HISTORY_FILE), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function readLatest(cwd2) {
  try {
    const raw = await fs9.readFile(path9.join(dir(cwd2), LATEST_FILE), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function readLatestInsights(cwd2) {
  try {
    const raw = await fs9.readFile(path9.join(dir(cwd2), INSIGHTS_FILE), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function readState(cwd2) {
  const [report, insights, history] = await Promise.all([
    readLatest(cwd2),
    readLatestInsights(cwd2),
    readHistory(cwd2)
  ]);
  if (!report || !insights) return null;
  return { report, insights, history };
}

// src/cli.ts
var program = new Command();
program.name("codelens").description("Local lint, type-check & AI security dashboard for JS/TS projects").version("0.1.0").option("-p, --port <number>", "preferred dashboard port", "4321").option("--no-ai", "skip the AI security audit").option("--no-open", "do not auto-open the browser").option("--ci", "run once, print summary, exit non-zero if issues are found").option("--json", "print the full report as JSON and exit").option("--min-score <number>", "fail in --ci mode if health score is below this", "0");
program.parse();
var opts = program.opts();
var cwd = process.cwd();
var ai = Boolean(opts.ai) && aiEnabled();
if (Boolean(opts.ai) && !aiEnabled()) {
  console.error(
    "\x1B[33m![codelens]\x1B[0m AI security audit is enabled but no model key was found.\n  Set AI_GATEWAY_API_KEY (or OPENAI_API_KEY) to enable it, or pass --no-ai to silence this.\n  Lint and type-check will still run.\n"
  );
}
async function main() {
  if (opts.ci || opts.json) {
    const history = await readHistory(cwd);
    const { report: report2, insights } = await runAnalysis({ cwd, ai, history });
    if (opts.json) {
      process.stdout.write(JSON.stringify({ report: report2, insights, history }, null, 2) + "\n");
      return;
    }
    printCiSummary(report2);
    await saveRun(cwd, report2, insights);
    const minScore = Number(opts.minScore) || 0;
    const hasBlockingIssues = report2.lint.errorCount > 0 || report2.types.diagnostics.length > 0 || report2.security.findings.some((f) => f.severity === "critical" || f.severity === "high");
    if (report2.health.score < minScore || hasBlockingIssues) {
      process.exitCode = 1;
    }
    return;
  }
  const state = {
    // Hydrate from a previous run if one exists, so the dashboard isn't empty
    // while the fresh analysis is still in flight.
    current: await readState(cwd)
  };
  const onEvent = (event) => {
    server.broadcast(event);
    if (event.type === "state") {
      state.current = event.state;
    }
  };
  const analyze = async () => {
    const priorHistory = await readHistory(cwd);
    const { report: report2, insights } = await runAnalysis({ cwd, ai, history: priorHistory, onEvent });
    await saveRun(cwd, report2, insights);
    const refreshed = { report: report2, insights, history: await readHistory(cwd) };
    state.current = refreshed;
    server.broadcast({ type: "state", state: refreshed });
    return report2;
  };
  const server = await startServer({
    port: Number(opts.port) || 4321,
    state,
    onRunRequest: async () => {
      await analyze();
    }
  });
  console.log(`
  \x1B[36mCodeLens\x1B[0m dashboard \u2192 \x1B[1m${server.url}\x1B[0m
`);
  if (opts.open) {
    open(server.url).catch(() => {
      console.log("  (could not auto-open browser; open the URL above manually)");
    });
  }
  const report = await analyze();
  console.log(
    `  Done. Health \x1B[1m${report.health.score}\x1B[0m (${report.health.grade}) \xB7 ${report.lint.errorCount} lint errors \xB7 ${report.types.diagnostics.length} type errors \xB7 ${report.security.findings.length} security findings.
  Dashboard stays live. Press Ctrl+C to exit.
`
  );
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
function printCiSummary(report) {
  const { health, lint, types, security } = report;
  console.log(`
CodeLens \u2014 ${report.meta.project.framework} project`);
  console.log(`  Health score : ${health.score} (${health.grade})`);
  console.log(`  Lint         : ${lint.errorCount} errors, ${lint.warningCount} warnings`);
  console.log(`  Types        : ${types.diagnostics.length} errors`);
  console.log(
    `  Security     : ${security.findings.length} findings` + (security.skipped ? " (AI skipped)" : "")
  );
}
main().catch((err) => {
  console.error("\x1B[31m[codelens] fatal:\x1B[0m", err);
  process.exit(1);
});
