import type {
  LintMessage,
  TypeDiagnostic,
  SecurityFinding,
  DependencyFinding,
  Severity,
} from "./schema"

export type IssueSource = "lint" | "types" | "security" | "deps"

/** A normalized issue used by the shared detail sheet. */
export interface Issue {
  source: IssueSource
  severity: Severity
  title: string
  filePath: string
  line: number
  column?: number
  endLine?: number
  ruleId?: string | null
  code?: string
  category?: string
  confidence?: number
  fixable?: boolean
  description: string
  recommendation?: string
  suggestedFix?: string
  related?: { message: string; depth: number }[]
  snippet?: { startLine: number; code: string }
  /** Primary external reference label + url. */
  reference?: string
  /** CVE identifiers (security + deps). */
  cves?: string[]
  /** Dependency-specific metadata, present when source === "deps". */
  dep?: {
    name: string
    current: string
    latest?: string
    fixedIn?: string
    type: string
    kind: string
    license?: string
    usedIn?: string[]
  }
}

export interface DocLink {
  label: string
  href: string
  /** Short provenance label, e.g. "ESLint", "OWASP". */
  kind: string
}

/* ------------------------------------------------------------------ */
/* Converters                                                          */
/* ------------------------------------------------------------------ */

export function lintToIssue(m: LintMessage): Issue {
  return {
    source: "lint",
    severity: m.severity,
    title: m.message,
    filePath: m.filePath,
    line: m.line,
    column: m.column,
    endLine: m.endLine,
    ruleId: m.ruleId,
    fixable: m.fixable,
    description: m.message,
    snippet: m.snippet,
  }
}

export function typeToIssue(d: TypeDiagnostic): Issue {
  return {
    source: "types",
    severity: "error",
    title: d.message,
    filePath: d.filePath,
    line: d.line,
    column: d.column,
    code: d.code,
    description: d.message,
    related: d.related,
  }
}

export function securityToIssue(f: SecurityFinding): Issue {
  return {
    source: "security",
    severity: f.severity,
    title: f.title,
    filePath: f.filePath,
    line: f.line,
    endLine: f.endLine,
    category: f.category,
    confidence: f.confidence,
    description: f.description,
    recommendation: f.recommendation,
    suggestedFix: f.suggestedFix,
    snippet: f.snippet,
    reference: f.reference,
  }
}

export function depToIssue(d: DependencyFinding): Issue {
  return {
    source: "deps",
    severity: d.severity,
    title: d.title,
    filePath: "package.json",
    line: 1,
    category: d.kind,
    description: d.detail,
    recommendation: d.recommendation,
    reference: d.reference,
    cves: d.cves,
    dep: {
      name: d.name,
      current: d.current,
      latest: d.latest,
      fixedIn: d.fixedIn,
      type: d.type,
      kind: d.kind,
      license: d.license,
      usedIn: d.usedIn,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Curated documentation + resource links                             */
/* ------------------------------------------------------------------ */

function lintRuleDoc(ruleId: string): DocLink | null {
  if (ruleId.startsWith("@typescript-eslint/")) {
    return {
      label: `typescript-eslint: ${ruleId}`,
      href: `https://typescript-eslint.io/rules/${ruleId.replace("@typescript-eslint/", "")}/`,
      kind: "typescript-eslint",
    }
  }
  if (ruleId.startsWith("react-hooks/")) {
    return { label: "React: Rules of Hooks", href: "https://react.dev/reference/rules/rules-of-hooks", kind: "React" }
  }
  if (ruleId.startsWith("jsx-a11y/")) {
    return {
      label: `eslint-plugin-jsx-a11y: ${ruleId}`,
      href: `https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/${ruleId.replace("jsx-a11y/", "")}.md`,
      kind: "a11y",
    }
  }
  if (ruleId.startsWith("import/")) {
    return {
      label: `eslint-plugin-import: ${ruleId}`,
      href: `https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/${ruleId.replace("import/", "")}.md`,
      kind: "import",
    }
  }
  // Core ESLint rule
  return { label: `ESLint: ${ruleId}`, href: `https://eslint.org/docs/latest/rules/${ruleId}`, kind: "ESLint" }
}

const SECURITY_RESOURCES: Record<string, DocLink[]> = {
  injection: [
    { label: "OWASP: SQL Injection Prevention", href: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html", kind: "OWASP" },
    { label: "PortSwigger: SQL injection", href: "https://portswigger.net/web-security/sql-injection", kind: "PortSwigger" },
  ],
  xss: [
    { label: "OWASP: XSS Prevention", href: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html", kind: "OWASP" },
    { label: "React: dangerouslySetInnerHTML", href: "https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html", kind: "React" },
  ],
  auth: [
    { label: "OWASP: Authorization Cheat Sheet", href: "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html", kind: "OWASP" },
    { label: "OWASP: Broken Access Control", href: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/", kind: "OWASP" },
  ],
  secrets: [
    { label: "OWASP: Secrets Management", href: "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html", kind: "OWASP" },
    { label: "Next.js: Environment Variables", href: "https://nextjs.org/docs/app/building-your-application/configuring/environment-variables", kind: "Next.js" },
  ],
  crypto: [
    { label: "OWASP: Cryptographic Storage", href: "https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html", kind: "OWASP" },
    { label: "Node.js: crypto.randomBytes", href: "https://nodejs.org/api/crypto.html#cryptorandombytessize-callback", kind: "Node.js" },
  ],
  ssrf: [
    { label: "OWASP: SSRF Prevention", href: "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html", kind: "OWASP" },
  ],
  config: [{ label: "OWASP: Security Misconfiguration", href: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/", kind: "OWASP" }],
  "data-exposure": [{ label: "OWASP: Sensitive Data Exposure", href: "https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure", kind: "OWASP" }],
  other: [{ label: "OWASP Top 10", href: "https://owasp.org/www-project-top-ten/", kind: "OWASP" }],
}

/** Returns curated documentation/resource links for an issue. */
export function issueDocs(issue: Issue): DocLink[] {
  const links: DocLink[] = []

  if (issue.source === "lint" && issue.ruleId) {
    const d = lintRuleDoc(issue.ruleId)
    if (d) links.push(d)
  }

  if (issue.source === "types" && issue.code) {
    links.push(
      { label: `Explained: ${issue.code}`, href: `https://typescript.tv/errors/#${issue.code}`, kind: "typescript.tv" },
      { label: "TypeScript Handbook", href: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html", kind: "TypeScript" },
    )
  }

  if (issue.source === "security") {
    if (issue.reference?.startsWith("CWE-")) {
      links.push({
        label: issue.reference,
        href: `https://cwe.mitre.org/data/definitions/${issue.reference.replace("CWE-", "")}.html`,
        kind: "MITRE CWE",
      })
    }
    if (issue.category && SECURITY_RESOURCES[issue.category]) {
      links.push(...SECURITY_RESOURCES[issue.category])
    }
  }

  // Per-CVE links to the National Vulnerability Database.
  for (const cve of issue.cves ?? []) {
    links.push({ label: cve, href: `https://nvd.nist.gov/vuln/detail/${cve}`, kind: "NVD" })
  }

  if (issue.source === "deps" && issue.dep) {
    const { name } = issue.dep
    const enc = encodeURIComponent(name)
    if (issue.reference) {
      links.push({ label: "Primary advisory", href: issue.reference, kind: "Advisory" })
    }
    links.push(
      { label: `npm: ${name}`, href: `https://www.npmjs.com/package/${enc}`, kind: "npm" },
      { label: `Snyk vulnerability DB`, href: `https://security.snyk.io/package/npm/${enc}`, kind: "Snyk" },
      { label: `GitHub Advisories`, href: `https://github.com/advisories?query=${enc}`, kind: "GitHub" },
      { label: `Socket.dev supply-chain report`, href: `https://socket.dev/npm/package/${enc}`, kind: "Socket" },
      { label: `deps.dev dependency graph`, href: `https://deps.dev/npm/${enc}`, kind: "deps.dev" },
    )
    if (issue.dep.kind === "license") {
      links.push({ label: "SPDX license list", href: "https://spdx.org/licenses/", kind: "SPDX" })
    }
  }

  return links
}

/* ------------------------------------------------------------------ */
/* Editor deep-links                                                   */
/* ------------------------------------------------------------------ */

export interface EditorTarget {
  id: string
  label: string
  /** Builds a deep-link URL for the given absolute path + position. */
  url: (absPath: string, line: number, col: number) => string
}

export const EDITORS: EditorTarget[] = [
  { id: "vscode", label: "VS Code", url: (p, l, c) => `vscode://file/${p}:${l}:${c}` },
  { id: "cursor", label: "Cursor", url: (p, l, c) => `cursor://file/${p}:${l}:${c}` },
  { id: "windsurf", label: "Windsurf", url: (p, l, c) => `windsurf://file/${p}:${l}:${c}` },
  { id: "vscode-insiders", label: "VS Code Insiders", url: (p, l, c) => `vscode-insiders://file/${p}:${l}:${c}` },
  { id: "webstorm", label: "WebStorm", url: (p, l) => `webstorm://open?file=${encodeURIComponent(p)}&line=${l}` },
  { id: "zed", label: "Zed", url: (p, l, c) => `zed://file/${p}:${l}:${c}` },
]

/** Joins a project root and a relative path into an absolute path. */
export function absolutePath(root: string, relPath: string): string {
  if (relPath.startsWith("/")) return relPath
  return `${root.replace(/\/$/, "")}/${relPath}`
}
