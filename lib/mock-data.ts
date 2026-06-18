import type { AnalysisReport, TrendPoint } from "./schema"

/**
 * Realistic fixture representing a CodeLens run against a sample Next.js app.
 * Used in the v0 preview and as a fallback when no live CLI data is present.
 */
export const mockReport: AnalysisReport = {
  meta: {
    id: "run_8f3a2c",
    cwd: "/Users/dev/projects/storefront",
    project: {
      root: "/Users/dev/projects/storefront",
      framework: "Next.js",
      packageManager: "pnpm",
      hasTypeScript: true,
      hasLintScript: true,
    },
    startedAt: "2026-06-17T14:32:01.000Z",
    finishedAt: "2026-06-17T14:32:19.420Z",
    durationMs: 18420,
    aiEnabled: true,
  },
  health: {
    score: 72,
    grade: "C",
    breakdown: { lint: 78, types: 80, security: 58 },
  },
  lint: {
    errorCount: 4,
    warningCount: 7,
    fixableCount: 5,
    messages: [
      {
        filePath: "app/products/[id]/page.tsx",
        line: 23,
        column: 7,
        endLine: 23,
        endColumn: 34,
        severity: "error",
        ruleId: "react-hooks/rules-of-hooks",
        message: "React Hook \"useState\" is called conditionally. React Hooks must be called in the exact same order in every render.",
        fixable: false,
        snippet: {
          startLine: 21,
          code: "  if (!params.id) return null\n\n  const [qty, setQty] = useState(1)\n  const { data } = useProduct(params.id)",
        },
      },
      {
        filePath: "app/products/[id]/page.tsx",
        line: 48,
        column: 11,
        severity: "warning",
        ruleId: "@typescript-eslint/no-unused-vars",
        message: "'discount' is assigned a value but never used.",
        fixable: false,
        snippet: {
          startLine: 47,
          code: "  const price = data.price\n  const discount = data.discount ?? 0\n  return <PriceTag value={price} />",
        },
      },
      {
        filePath: "lib/cart.ts",
        line: 12,
        column: 1,
        severity: "error",
        ruleId: "@typescript-eslint/no-floating-promises",
        message: "Promises must be awaited, end with a call to .catch, or be explicitly marked as ignored with the `void` operator.",
        fixable: false,
        snippet: {
          startLine: 11,
          code: "export function addItem(id: string) {\n  syncCartToServer(id)\n}",
        },
      },
      {
        filePath: "lib/cart.ts",
        line: 30,
        column: 9,
        severity: "warning",
        ruleId: "prefer-const",
        message: "'total' is never reassigned. Use 'const' instead.",
        fixable: true,
        snippet: { startLine: 30, code: "  let total = items.reduce((s, i) => s + i.price, 0)" },
      },
      {
        filePath: "components/checkout-form.tsx",
        line: 67,
        column: 5,
        severity: "error",
        ruleId: "jsx-a11y/label-has-associated-control",
        message: "A form label must be associated with a control.",
        fixable: false,
      },
      {
        filePath: "components/checkout-form.tsx",
        line: 89,
        column: 13,
        severity: "warning",
        ruleId: "@typescript-eslint/no-explicit-any",
        message: "Unexpected any. Specify a different type.",
        fixable: false,
      },
      {
        filePath: "components/checkout-form.tsx",
        line: 92,
        column: 13,
        severity: "warning",
        ruleId: "@typescript-eslint/no-explicit-any",
        message: "Unexpected any. Specify a different type.",
        fixable: false,
      },
      {
        filePath: "app/api/orders/route.ts",
        line: 15,
        column: 3,
        severity: "error",
        ruleId: "no-console",
        message: "Unexpected console statement.",
        fixable: true,
      },
      {
        filePath: "app/api/orders/route.ts",
        line: 40,
        column: 7,
        severity: "warning",
        ruleId: "eqeqeq",
        message: "Expected '===' and instead saw '=='.",
        fixable: true,
      },
      {
        filePath: "hooks/use-product.ts",
        line: 8,
        column: 5,
        severity: "warning",
        ruleId: "react-hooks/exhaustive-deps",
        message: "React Hook useEffect has a missing dependency: 'productId'.",
        fixable: true,
      },
      {
        filePath: "hooks/use-product.ts",
        line: 22,
        column: 1,
        severity: "warning",
        ruleId: "import/order",
        message: "There should be no empty line within import group.",
        fixable: true,
      },
    ],
  },
  types: {
    diagnostics: [
      {
        filePath: "lib/cart.ts",
        line: 18,
        column: 14,
        code: "TS2345",
        message:
          "Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
        related: [
          { message: "Type 'undefined' is not assignable to type 'string'.", depth: 1 },
        ],
      },
      {
        filePath: "components/checkout-form.tsx",
        line: 54,
        column: 9,
        code: "TS2322",
        message:
          "Type '{ value: number; onChange: (v: string) => void; }' is not assignable to type 'IntrinsicAttributes & PriceInputProps'.",
        related: [
          {
            message:
              "Types of property 'onChange' are incompatible.",
            depth: 1,
          },
          {
            message:
              "Type '(v: string) => void' is not assignable to type '(v: number) => void'.",
            depth: 2,
          },
          {
            message: "Types of parameters 'v' and 'v' are incompatible.",
            depth: 3,
          },
          {
            message: "Type 'number' is not assignable to type 'string'.",
            depth: 4,
          },
        ],
      },
      {
        filePath: "app/api/orders/route.ts",
        line: 27,
        column: 20,
        code: "TS18048",
        message: "'session.user' is possibly 'undefined'.",
        related: [],
      },
    ],
  },
  security: {
    skipped: false,
    findings: [
      {
        id: "s1",
        title: "SQL injection via unparameterized query",
        severity: "critical",
        category: "injection",
        filePath: "app/api/orders/route.ts",
        line: 31,
        endLine: 33,
        confidence: 0.94,
        description:
          "User-controlled `email` is concatenated directly into a SQL string. An attacker can inject arbitrary SQL, reading or destroying order data.",
        recommendation:
          "Use a parameterized query so the driver escapes input. Never interpolate request values into SQL strings.",
        suggestedFix:
          "- const rows = await sql(`SELECT * FROM orders WHERE email = '${email}'`)\n+ const rows = await sql`SELECT * FROM orders WHERE email = ${email}`",
        reference: "CWE-89",
        snippet: {
          startLine: 31,
          code: "  const email = req.nextUrl.searchParams.get('email')\n  const rows = await sql(\n    `SELECT * FROM orders WHERE email = '${email}'`)",
        },
      },
      {
        id: "s2",
        title: "Service role key exposed to the client bundle",
        severity: "critical",
        category: "secrets",
        filePath: "lib/supabase.ts",
        line: 4,
        confidence: 0.9,
        description:
          "`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE` is read in a module imported by client components. The `NEXT_PUBLIC_` prefix inlines it into the browser bundle, leaking full database access.",
        recommendation:
          "Remove the NEXT_PUBLIC_ prefix and only use the service role key in server-only code (Route Handlers / Server Actions).",
        suggestedFix:
          "- const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE\n+ // server-only — never expose the service role to the client\n+ const key = process.env.SUPABASE_SERVICE_ROLE",
        reference: "CWE-200",
        snippet: {
          startLine: 4,
          code: "export const admin = createClient(url,\n  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!)",
        },
      },
      {
        id: "s3",
        title: "Missing authorization check on order lookup",
        severity: "high",
        category: "auth",
        filePath: "app/api/orders/route.ts",
        line: 22,
        confidence: 0.81,
        description:
          "The handler returns orders for any email passed in the query string without verifying the session user owns them. This is an IDOR allowing access to other customers' orders.",
        recommendation:
          "Derive the user from the authenticated session and scope the query to that user id rather than trusting query input.",
        suggestedFix:
          "- const email = req.nextUrl.searchParams.get('email')\n+ const session = await auth()\n+ if (!session?.user) return new Response('Unauthorized', { status: 401 })\n+ const email = session.user.email",
        reference: "CWE-639",
      },
      {
        id: "s4",
        title: "Unsafe innerHTML render of product description",
        severity: "high",
        category: "xss",
        filePath: "app/products/[id]/page.tsx",
        line: 60,
        confidence: 0.77,
        description:
          "Product description from the API is rendered with `dangerouslySetInnerHTML` without sanitization, enabling stored XSS if descriptions are attacker-controllable.",
        recommendation:
          "Sanitize the HTML with a library like DOMPurify, or render as plain text.",
        suggestedFix:
          "- <div dangerouslySetInnerHTML={{ __html: data.description }} />\n+ <div dangerouslySetInnerHTML={{ __html: sanitize(data.description) }} />",
        reference: "CWE-79",
      },
      {
        id: "s5",
        title: "Weak hashing for password reset tokens",
        severity: "medium",
        category: "crypto",
        filePath: "lib/tokens.ts",
        line: 9,
        confidence: 0.68,
        description:
          "Reset tokens are derived with MD5, which is fast and collision-prone. Tokens may be predictable or brute-forceable.",
        recommendation:
          "Generate tokens with `crypto.randomBytes(32)` and store a SHA-256 hash, comparing in constant time.",
        suggestedFix:
          "- const token = crypto.createHash('md5').update(email).digest('hex')\n+ const token = crypto.randomBytes(32).toString('hex')",
        reference: "CWE-327",
      },
    ],
    dependencies: [
      {
        name: "next",
        currentVersion: "14.1.0",
        dependencyType: "direct",
        severity: "high",
        title: "Server-Side Request Forgery in Next.js Image Optimization",
        cves: ["CVE-2024-34351"],
        fixedIn: "14.1.1",
        impact:
          "Reachable — this app uses next/image with remote patterns, so the optimizer endpoint is exposed. Upgrade is low-risk (patch).",
      },
      {
        name: "axios",
        currentVersion: "1.6.2",
        dependencyType: "direct",
        severity: "medium",
        title: "Cross-Site Request Forgery via crafted absolute URL",
        cves: ["CVE-2023-45857"],
        fixedIn: "1.6.5",
        impact:
          "Partially reachable — axios is used for server-to-server calls only, lowering practical risk. Still worth patching.",
      },
      {
        name: "semver",
        currentVersion: "7.5.1",
        dependencyType: "transitive",
        severity: "low",
        title: "Regular Expression Denial of Service in semver",
        cves: ["CVE-2022-25883"],
        fixedIn: "7.5.2",
        impact:
          "Low real-world risk — transitive, only parses trusted version strings during install. Safe to defer.",
      },
    ],
  },
}

export const mockHistory: TrendPoint[] = [
  { runId: "r1", timestamp: "2026-06-10T09:00:00Z", score: 54, lintErrors: 12, lintWarnings: 9, typeErrors: 8, securityFindings: 9 },
  { runId: "r2", timestamp: "2026-06-11T09:00:00Z", score: 58, lintErrors: 10, lintWarnings: 8, typeErrors: 7, securityFindings: 8 },
  { runId: "r3", timestamp: "2026-06-12T09:00:00Z", score: 61, lintErrors: 9, lintWarnings: 9, typeErrors: 6, securityFindings: 7 },
  { runId: "r4", timestamp: "2026-06-13T09:00:00Z", score: 60, lintErrors: 9, lintWarnings: 7, typeErrors: 6, securityFindings: 7 },
  { runId: "r5", timestamp: "2026-06-14T09:00:00Z", score: 65, lintErrors: 7, lintWarnings: 8, typeErrors: 5, securityFindings: 6 },
  { runId: "r6", timestamp: "2026-06-15T09:00:00Z", score: 68, lintErrors: 6, lintWarnings: 7, typeErrors: 4, securityFindings: 6 },
  { runId: "r7", timestamp: "2026-06-16T09:00:00Z", score: 70, lintErrors: 5, lintWarnings: 7, typeErrors: 3, securityFindings: 5 },
  { runId: "r8", timestamp: "2026-06-17T14:32:19Z", score: 72, lintErrors: 4, lintWarnings: 7, typeErrors: 3, securityFindings: 5 },
]
