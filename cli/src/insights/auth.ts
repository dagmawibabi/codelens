import type { ScanContext } from "./scan.js"
import type {
  AuthResult,
  AuthPlugin,
  AuthMethod,
  AuthConfigItem,
  AuthFinding,
  AuthPluginCategory,
  AuthProviderId,
  AuthProviderInfo,
  Severity,
} from "../types.js"

const DOCS = "https://www.better-auth.com/docs"

/**
 * Provider detection table, in priority order. The first dependency that's
 * present wins. Better Auth has deep introspection; the others are detected
 * and surfaced with provider-level findings and guidance.
 */
interface ProviderDef extends AuthProviderInfo {
  /** Packages that indicate this provider is in use (any match). */
  packages: string[]
}

const PROVIDER_CATALOG: ProviderDef[] = [
  { id: "better-auth", name: "Better Auth", packageName: "better-auth", packages: ["better-auth"], docsUrl: "https://www.better-auth.com/docs", deepSupport: true },
  { id: "clerk", name: "Clerk", packageName: "@clerk/nextjs", packages: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/clerk-sdk-node", "@clerk/express", "@clerk/backend", "@clerk/clerk-js", "@clerk/remix", "@clerk/astro", "@clerk/tanstack-start"], docsUrl: "https://clerk.com/docs", deepSupport: false },
  { id: "next-auth", name: "Auth.js (NextAuth)", packageName: "next-auth", packages: ["next-auth", "@auth/core", "@auth/sveltekit", "@auth/express"], docsUrl: "https://authjs.dev", deepSupport: false },
  { id: "supabase", name: "Supabase Auth", packageName: "@supabase/supabase-js", packages: ["@supabase/ssr", "@supabase/auth-helpers-nextjs", "@supabase/supabase-js", "@supabase/auth-js"], docsUrl: "https://supabase.com/docs/guides/auth", deepSupport: false },
  { id: "lucia", name: "Lucia", packageName: "lucia", packages: ["lucia", "@lucia-auth/adapter-drizzle", "@lucia-auth/adapter-prisma"], docsUrl: "https://lucia-auth.com", deepSupport: false },
  { id: "firebase", name: "Firebase Auth", packageName: "firebase", packages: ["firebase", "firebase-admin", "@firebase/auth"], docsUrl: "https://firebase.google.com/docs/auth", deepSupport: false },
  { id: "auth0", name: "Auth0", packageName: "@auth0/nextjs-auth0", packages: ["@auth0/nextjs-auth0", "@auth0/auth0-react", "@auth0/auth0-spa-js", "express-openid-connect"], docsUrl: "https://auth0.com/docs", deepSupport: false },
  { id: "passport", name: "Passport.js", packageName: "passport", packages: ["passport"], docsUrl: "https://www.passportjs.org/docs", deepSupport: false },
]

function detectProvider(ctx: ScanContext): ProviderDef | undefined {
  for (const def of PROVIDER_CATALOG) {
    if (def.packages.some((p) => ctx.hasDep(p))) return def
  }
  return undefined
}

function providerInfo(def: ProviderDef): AuthProviderInfo {
  return { id: def.id, name: def.name, packageName: def.packageName, docsUrl: def.docsUrl, deepSupport: def.deepSupport }
}

function frameworkIntegration(ctx: ScanContext): string | undefined {
  if (ctx.hasDep("next")) return "Next.js"
  if (ctx.hasDep("@sveltejs/kit")) return "SvelteKit"
  if (ctx.hasDep("nuxt")) return "Nuxt"
  if (ctx.hasDep("@remix-run/node") || ctx.hasDep("@remix-run/react")) return "Remix"
  if (ctx.hasDep("astro")) return "Astro"
  if (ctx.hasDep("hono")) return "Hono"
  if (ctx.hasDep("express")) return "Express"
  return undefined
}

function matchedVersion(ctx: ScanContext, def: ProviderDef): string | undefined {
  for (const p of def.packages) {
    const v = ctx.deps[p]
    if (v) return v.replace(/^[\^~]/, "") || undefined
  }
  return undefined
}

/**
 * Catalog of Better Auth's built-in plugins. Detection keys are the function
 * names imported from `better-auth/plugins` (server) and
 * `better-auth/client/plugins` (client). `needsClient` marks plugins that
 * require a matching client plugin to be usable from the browser.
 */
interface PluginDef {
  id: string
  name: string
  category: AuthPluginCategory
  side: "server" | "client" | "both"
  needsClient: boolean
  description: string
  doc: string
  addsTables?: string[]
}

const PLUGIN_CATALOG: PluginDef[] = [
  { id: "twoFactor", name: "Two-Factor (2FA)", category: "two-factor", side: "both", needsClient: true, description: "TOTP and OTP-based two-factor authentication.", doc: "plugins/2fa", addsTables: ["twoFactor"] },
  { id: "username", name: "Username", category: "passwordless", side: "both", needsClient: true, description: "Lets users sign in with a username in addition to email.", doc: "plugins/username" },
  { id: "anonymous", name: "Anonymous", category: "passwordless", side: "both", needsClient: true, description: "Creates temporary anonymous sessions that can later be linked to an account.", doc: "plugins/anonymous" },
  { id: "phoneNumber", name: "Phone Number", category: "passwordless", side: "both", needsClient: true, description: "Phone-number sign-in with OTP verification.", doc: "plugins/phone-number" },
  { id: "magicLink", name: "Magic Link", category: "passwordless", side: "both", needsClient: true, description: "Passwordless email magic-link sign-in.", doc: "plugins/magic-link" },
  { id: "emailOTP", name: "Email OTP", category: "passwordless", side: "both", needsClient: true, description: "One-time codes sent over email for sign-in or verification.", doc: "plugins/email-otp" },
  { id: "passkey", name: "Passkey (WebAuthn)", category: "passwordless", side: "both", needsClient: true, description: "Passwordless WebAuthn / passkey authentication.", doc: "plugins/passkey", addsTables: ["passkey"] },
  { id: "genericOAuth", name: "Generic OAuth", category: "social", side: "both", needsClient: true, description: "Add arbitrary OAuth2 / OIDC providers beyond the built-in ones.", doc: "plugins/generic-oauth" },
  { id: "oneTap", name: "Google One Tap", category: "social", side: "both", needsClient: true, description: "Google One Tap sign-in flow.", doc: "plugins/one-tap" },
  { id: "siwe", name: "Sign in with Ethereum", category: "social", side: "both", needsClient: true, description: "Web3 wallet authentication (EIP-4361).", doc: "plugins/siwe" },
  { id: "admin", name: "Admin", category: "authorization", side: "both", needsClient: true, description: "Admin APIs: user management, banning, impersonation, role checks.", doc: "plugins/admin" },
  { id: "organization", name: "Organization", category: "authorization", side: "both", needsClient: true, description: "Multi-tenant organizations, members, invitations and roles.", doc: "plugins/organization", addsTables: ["organization", "member", "invitation"] },
  { id: "apiKey", name: "API Key", category: "api", side: "both", needsClient: true, description: "Issue and verify API keys with optional rate limits.", doc: "plugins/api-key", addsTables: ["apikey"] },
  { id: "multiSession", name: "Multi Session", category: "session", side: "both", needsClient: true, description: "Keep multiple accounts signed in at once and switch between them.", doc: "plugins/multi-session" },
  { id: "oidcProvider", name: "OIDC Provider", category: "enterprise", side: "both", needsClient: true, description: "Turn your app into an OpenID Connect identity provider.", doc: "plugins/oidc-provider", addsTables: ["oauthApplication", "oauthAccessToken"] },
  { id: "sso", name: "SSO (SAML/OIDC)", category: "enterprise", side: "both", needsClient: true, description: "Enterprise single sign-on via SAML or OIDC.", doc: "plugins/sso" },
  { id: "deviceAuthorization", name: "Device Authorization", category: "enterprise", side: "both", needsClient: true, description: "OAuth device authorization grant for input-constrained devices.", doc: "plugins/device-authorization" },
  { id: "bearer", name: "Bearer Token", category: "api", side: "server", needsClient: false, description: "Accept session tokens via the Authorization header instead of cookies.", doc: "plugins/bearer" },
  { id: "jwt", name: "JWT", category: "api", side: "server", needsClient: false, description: "Issue JWTs / expose a JWKS endpoint for service-to-service auth.", doc: "plugins/jwt", addsTables: ["jwks"] },
  { id: "mcp", name: "MCP", category: "api", side: "server", needsClient: false, description: "OAuth provider endpoints for Model Context Protocol clients.", doc: "plugins/mcp" },
  { id: "openAPI", name: "OpenAPI", category: "utility", side: "server", needsClient: false, description: "Auto-generated OpenAPI reference for all auth endpoints.", doc: "plugins/open-api" },
  { id: "haveIBeenPwned", name: "Have I Been Pwned", category: "utility", side: "server", needsClient: false, description: "Rejects passwords found in known breach corpuses.", doc: "plugins/have-i-been-pwned" },
  { id: "captcha", name: "Captcha", category: "utility", side: "server", needsClient: false, description: "Protects endpoints with Turnstile / hCaptcha / reCAPTCHA.", doc: "plugins/captcha" },
  { id: "oneTimeToken", name: "One-Time Token", category: "utility", side: "server", needsClient: false, description: "Short-lived single-use tokens (e.g. for cross-domain handoff).", doc: "plugins/one-time-token" },
  { id: "oAuthProxy", name: "OAuth Proxy", category: "utility", side: "server", needsClient: false, description: "Proxies OAuth callbacks for preview / multi-domain deployments.", doc: "plugins/oauth-proxy" },
  { id: "customSession", name: "Custom Session", category: "session", side: "server", needsClient: false, description: "Augments the session payload with extra computed fields.", doc: "plugins/custom-session" },
  { id: "lastLoginMethod", name: "Last Login Method", category: "utility", side: "both", needsClient: false, description: "Tracks and surfaces the user's most recent sign-in method.", doc: "plugins/last-login-method" },
  { id: "nextCookies", name: "Next.js Cookies", category: "integration", side: "server", needsClient: false, description: "Handles cookie setting inside Next.js server actions.", doc: "integrations/next" },
  { id: "stripe", name: "Stripe", category: "integration", side: "both", needsClient: true, description: "Subscriptions and billing tied to Better Auth users.", doc: "plugins/stripe", addsTables: ["subscription"] },
  { id: "polar", name: "Polar", category: "integration", side: "both", needsClient: true, description: "Polar.sh billing and entitlements integration.", doc: "plugins/polar" },
]

/** Known social provider ids for the `socialProviders` block. */
const SOCIAL_PROVIDERS = [
  "google", "github", "apple", "discord", "facebook", "microsoft", "twitter", "x",
  "twitch", "gitlab", "linkedin", "spotify", "dropbox", "reddit", "tiktok", "kick",
  "roblox", "vk", "zoom", "notion", "slack", "figma", "salesforce", "atlassian", "cognito", "huggingface",
]

/** Extract the body of a top-level `key: { ... }` / `key: [ ... ]` block. */
function extractBlock(src: string, key: string, open: "{" | "[" = "{"): string | null {
  const close = open === "{" ? "}" : "]"
  const re = new RegExp(`${key}\\s*:\\s*\\${open}`)
  const m = re.exec(src)
  if (!m) return null
  let depth = 0
  const start = m.index + m[0].length - 1
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return src.slice(start + 1, i)
    }
  }
  return null
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length
}

export async function collectAuth(ctx: ScanContext): Promise<AuthResult> {
  const provider = detectProvider(ctx)
  if (!provider) return empty()

  // Better Auth gets full config introspection; everything else uses the
  // lighter-weight generic collector below.
  if (provider.id === "better-auth") return collectBetterAuth(ctx, provider)
  return collectGenericProvider(ctx, provider)
}

async function collectBetterAuth(ctx: ScanContext, provider: ProviderDef): Promise<AuthResult> {
  const version = matchedVersion(ctx, provider)

  // --- Locate server + client config files --------------------------------
  let configPath: string | undefined
  let serverSrc = ""
  let clientPath: string | undefined
  let clientSrc = ""

  for (const file of ctx.codeFiles()) {
    if (configPath && clientPath) break
    // Cheap filename prefilter before reading.
    if (!/auth/i.test(file.rel)) continue
    const content = await ctx.read(file.rel)
    if (!content) continue
    if (!configPath && /betterAuth\s*\(/.test(content)) {
      configPath = file.rel
      serverSrc = content
    }
    if (!clientPath && /createAuthClient\s*\(/.test(content)) {
      clientPath = file.rel
      clientSrc = content
    }
  }
  // Fallback: scan everything if the prefilter missed it.
  if (!configPath || !clientPath) {
    for (const file of ctx.codeFiles()) {
      if (configPath && clientPath) break
      const content = await ctx.read(file.rel)
      if (!content) continue
      if (!configPath && /betterAuth\s*\(/.test(content)) {
        configPath = file.rel
        serverSrc = content
      }
      if (!clientPath && /createAuthClient\s*\(/.test(content)) {
        clientPath = file.rel
        clientSrc = content
      }
    }
  }

  // --- Framework integration ----------------------------------------------
  const integration = frameworkIntegration(ctx)

  // --- Database adapter ----------------------------------------------------
  let databaseAdapter: AuthResult["databaseAdapter"]
  if (/drizzleAdapter\s*\(/.test(serverSrc)) databaseAdapter = { name: "Drizzle", detail: "drizzleAdapter()" }
  else if (/prismaAdapter\s*\(/.test(serverSrc)) databaseAdapter = { name: "Prisma", detail: "prismaAdapter()" }
  else if (/mongodbAdapter\s*\(/.test(serverSrc)) databaseAdapter = { name: "MongoDB", detail: "mongodbAdapter()" }
  else if (/memoryAdapter\s*\(/.test(serverSrc)) databaseAdapter = { name: "Memory", detail: "memoryAdapter() — not for production" }
  else if (/database\s*:/.test(serverSrc)) databaseAdapter = { name: "Kysely / direct", detail: "database: { ... }" }

  // --- Sign-in methods -----------------------------------------------------
  const methods: AuthMethod[] = []
  const emailBlock = extractBlock(serverSrc, "emailAndPassword")
  const emailEnabled = emailBlock != null && !/enabled\s*:\s*false/.test(emailBlock)
  if (emailBlock != null) {
    const requireVerif = /requireEmailVerification\s*:\s*true/.test(emailBlock)
    methods.push({
      id: "email-password",
      label: "Email & Password",
      kind: "credential",
      enabled: emailEnabled,
      detail: emailEnabled
        ? `Enabled${requireVerif ? " · email verification required" : " · no email verification"}`
        : "Present but disabled",
    })
  }

  // Social providers.
  const socialBlock = extractBlock(serverSrc, "socialProviders")
  const socialProviders: string[] = []
  if (socialBlock) {
    for (const p of SOCIAL_PROVIDERS) {
      if (new RegExp(`(^|[^a-zA-Z])${p}\\s*:`).test(socialBlock)) socialProviders.push(p)
    }
    if (socialProviders.length > 0) {
      methods.push({
        id: "social",
        label: "Social Login",
        kind: "social",
        enabled: true,
        detail: `${socialProviders.length} provider${socialProviders.length === 1 ? "" : "s"}`,
        providers: socialProviders,
      })
    }
  }

  // --- Plugins -------------------------------------------------------------
  const serverPlugins = extractBlock(serverSrc, "plugins", "[") ?? ""
  const clientPlugins = extractBlock(clientSrc, "plugins", "[") ?? ""
  const detectedServer = new Set<string>()
  const detectedClient = new Set<string>()
  for (const def of PLUGIN_CATALOG) {
    const re = new RegExp(`\\b${def.id}\\s*\\(`)
    if (re.test(serverPlugins)) detectedServer.add(def.id)
    if (re.test(clientPlugins)) detectedClient.add(def.id)
  }
  // nextCookies is often added without arguments — also catch bare reference.
  if (/\bnextCookies\b/.test(serverPlugins)) detectedServer.add("nextCookies")

  const seen = new Set<string>()
  const plugins: AuthPlugin[] = []
  for (const def of PLUGIN_CATALOG) {
    if (seen.has(def.id)) continue
    const onServer = detectedServer.has(def.id)
    const onClient = detectedClient.has(def.id)
    if (!onServer && !onClient) continue
    seen.add(def.id)
    plugins.push({
      id: def.id,
      name: def.name,
      category: def.category,
      side: def.side,
      detectedServer: onServer,
      detectedClient: onClient,
      needsClient: def.needsClient,
      clientMissing: def.needsClient && onServer && !onClient,
      description: def.description,
      docsUrl: `${DOCS}/${def.doc}`,
      addsTables: def.addsTables,
    })
  }

  // --- Session config ------------------------------------------------------
  const sessionBlock = extractBlock(serverSrc, "session") ?? ""
  const expiresIn = numOpt(sessionBlock, "expiresIn")
  const updateAge = numOpt(sessionBlock, "updateAge")
  const cookieCache = /cookieCache\s*:\s*\{[^}]*enabled\s*:\s*true/.test(sessionBlock)
  const session = { expiresIn, updateAge, cookieCache }

  // --- Resolved configuration ---------------------------------------------
  const advancedBlock = extractBlock(serverSrc, "advanced") ?? ""
  const hasSecretEnv = /secret\s*:\s*(process\.env|import\.meta\.env)/.test(serverSrc)
  const hardcodedSecret = /secret\s*:\s*["'][^"']+["']/.test(serverSrc)
  const baseURLset = /baseURL\s*:/.test(serverSrc)
  const trustedOrigins = /trustedOrigins\s*:/.test(serverSrc)
  const rateLimitBlock = extractBlock(serverSrc, "rateLimit")
  const rateLimitEnabled = rateLimitBlock != null && /enabled\s*:\s*true/.test(rateLimitBlock)
  const secureCookies = /useSecureCookies\s*:\s*true/.test(advancedBlock)

  const config: AuthConfigItem[] = [
    {
      key: "secret",
      label: "Secret",
      value: hasSecretEnv ? "From environment" : hardcodedSecret ? "Hardcoded" : "Inferred (BETTER_AUTH_SECRET)",
      status: hardcodedSecret ? "fail" : "ok",
      recommendation: hardcodedSecret ? "Move the secret to BETTER_AUTH_SECRET and rotate it." : undefined,
    },
    {
      key: "baseURL",
      label: "Base URL",
      value: baseURLset ? "Set" : "Inferred from request",
      status: baseURLset ? "ok" : "warn",
      recommendation: baseURLset ? undefined : "Set baseURL or BETTER_AUTH_URL explicitly for stable callbacks.",
    },
    {
      key: "trustedOrigins",
      label: "Trusted Origins",
      value: trustedOrigins ? "Configured" : "Defaults to baseURL only",
      status: trustedOrigins ? "ok" : "info",
    },
    {
      key: "session",
      label: "Session lifetime",
      value: expiresIn ? `${Math.round(expiresIn / 86400)}d` : "7d (default)",
      status: "ok",
      detail: cookieCache ? "Cookie cache enabled" : "No cookie cache",
    },
    {
      key: "rateLimit",
      label: "Rate limiting",
      value: rateLimitEnabled ? "Enabled" : "Default (prod only)",
      status: rateLimitEnabled ? "ok" : "info",
    },
    {
      key: "cookies",
      label: "Secure cookies",
      value: secureCookies ? "Forced" : "Auto (prod)",
      status: "ok",
    },
  ]

  // --- Findings ------------------------------------------------------------
  const findings: AuthFinding[] = []
  const push = (
    id: string,
    severity: Severity,
    title: string,
    detail: string,
    recommendation: string,
    doc?: string,
  ) => findings.push({ id, severity, title, detail, recommendation, filePath: configPath, docsUrl: doc })

  if (hardcodedSecret && !hasSecretEnv) {
    const idx = serverSrc.search(/secret\s*:\s*["']/)
    findings.push({
      id: "auth-secret",
      severity: "critical",
      title: "Auth secret is hardcoded",
      detail: "The Better Auth secret is written as a string literal in the config instead of being loaded from an environment variable.",
      recommendation: "Set BETTER_AUTH_SECRET (e.g. `openssl rand -base64 32`) and read it from the environment.",
      filePath: configPath,
      line: idx >= 0 ? lineOf(serverSrc, idx) : undefined,
      docsUrl: `${DOCS}/reference/options#secret`,
    })
  }

  if (emailEnabled && emailBlock && !/requireEmailVerification\s*:\s*true/.test(emailBlock)) {
    push(
      "auth-email-verif",
      "medium",
      "Email verification not required",
      "Email & password sign-in is enabled but accounts can be created without verifying ownership of the email address.",
      "Set emailAndPassword.requireEmailVerification = true and wire up emailVerification.sendVerificationEmail.",
      `${DOCS}/authentication/email-password`,
    )
  }

  if (!baseURLset) {
    push(
      "auth-baseurl",
      "low",
      "baseURL relies on request inference",
      "No baseURL is configured, so Better Auth infers it from incoming requests. This is discouraged for production.",
      "Set baseURL in the config or the BETTER_AUTH_URL environment variable.",
      `${DOCS}/reference/options#baseurl`,
    )
  }

  if (!trustedOrigins && socialProviders.length > 0) {
    push(
      "auth-trusted-origins",
      "low",
      "No explicit trustedOrigins",
      "Social providers are configured but trustedOrigins is left at its default (baseURL only), which can break OAuth callbacks across domains.",
      "Add the domains you redirect to/from under trustedOrigins.",
      `${DOCS}/reference/options#trustedorigins`,
    )
  }

  for (const p of plugins) {
    if (p.clientMissing) {
      push(
        `auth-client-${p.id}`,
        "medium",
        `${p.name} is missing its client plugin`,
        `The ${p.name} server plugin is registered but no matching client plugin was found in ${clientPath ?? "the auth client"}. Its client actions won't be available.`,
        `Add ${p.id}Client() (or the documented client plugin) to createAuthClient({ plugins: [...] }).`,
        p.docsUrl,
      )
    }
  }

  const tableAdders = plugins.filter((p) => p.addsTables && p.addsTables.length > 0)
  if (tableAdders.length > 0 && databaseAdapter) {
    push(
      "auth-migrations",
      "info",
      "Plugins add database tables",
      `${tableAdders.map((p) => p.name).join(", ")} extend the schema with new tables. Make sure migrations were generated and applied.`,
      "Run `npx @better-auth/cli generate` then your migration tool to sync the schema.",
      `${DOCS}/concepts/database`,
    )
  }

  if (!clientPath && plugins.some((p) => p.needsClient)) {
    push(
      "auth-no-client",
      "low",
      "No auth client detected",
      "Plugins that need a client counterpart are configured, but no createAuthClient() setup was found.",
      "Create an auth-client with createAuthClient() and register the matching client plugins.",
      `${DOCS}/concepts/client`,
    )
  }

  findings.sort((a, b) => sevRank(b.severity) - sevRank(a.severity))

  return {
    present: true,
    provider: providerInfo(provider),
    version,
    integration,
    configPath,
    clientPath,
    databaseAdapter,
    methods,
    socialProviders,
    plugins,
    config,
    session,
    findings,
    counts: {
      plugins: plugins.length,
      methods: methods.filter((m) => m.enabled).length,
      providers: socialProviders.length,
      findings: findings.length,
    },
  }
}

/**
 * Lighter-weight collector for providers other than Better Auth. We detect the
 * library, locate its config/usage, and surface provider-specific methods,
 * social providers, environment expectations and common misconfigurations
 * without claiming the deep config introspection Better Auth gets.
 */
async function collectGenericProvider(ctx: ScanContext, provider: ProviderDef): Promise<AuthResult> {
  const version = matchedVersion(ctx, provider)
  const integration = frameworkIntegration(ctx)

  // Gather a bounded slice of auth-related source to scan for usage signals.
  let configPath: string | undefined
  let blob = ""
  const envKeys = new Set<string>()
  let scanned = 0
  for (const file of ctx.codeFiles()) {
    if (scanned > 4000 * 60) break
    if (!/auth|middleware|clerk|session|login|signin|sign-in|supabase|firebase|lucia/i.test(file.rel)) continue
    const content = await ctx.read(file.rel)
    if (!content) continue
    scanned += content.length
    blob += "\n" + content
    if (!configPath && provider.packages.some((p) => content.includes(p))) configPath = file.rel
    for (const m of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) envKeys.add(m[1])
    for (const m of content.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) envKeys.add(m[1])
  }

  const methods: AuthMethod[] = []
  const socialProviders: string[] = []
  for (const p of SOCIAL_PROVIDERS) {
    if (new RegExp(`["'\`]${p}["'\`]|\\b${p}Provider\\b|/${p}\\b`, "i").test(blob)) {
      if (!socialProviders.includes(p)) socialProviders.push(p)
    }
  }

  const findings: AuthFinding[] = []
  const push = (id: string, severity: Severity, title: string, detail: string, recommendation: string) =>
    findings.push({ id, severity, title, detail, recommendation, filePath: configPath, docsUrl: provider.docsUrl })

  // Hardcoded secret/key heuristics shared across providers.
  const hardcodedKey = /(secret|api[_-]?key|client[_-]?secret|service[_-]?role)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i.test(blob)
  if (hardcodedKey) {
    push(
      "auth-hardcoded-key",
      "critical",
      "Possible hardcoded auth credential",
      `A long string literal assigned to a secret/key was found in auth code for ${provider.name}.`,
      "Move secrets to environment variables and rotate any value that was committed.",
    )
  }

  // Provider-specific detection.
  switch (provider.id) {
    case "clerk": {
      methods.push({ id: "clerk-hosted", label: "Clerk Hosted Auth", kind: "credential", enabled: true, detail: "Sign-in/up handled by Clerk components & <ClerkProvider>." })
      if (socialProviders.length > 0) {
        methods.push({ id: "social", label: "Social Login", kind: "social", enabled: true, detail: `${socialProviders.length} provider${socialProviders.length === 1 ? "" : "s"} referenced`, providers: socialProviders })
      }
      const hasMiddleware = /clerkMiddleware|authMiddleware/.test(blob)
      if (!hasMiddleware) {
        push("clerk-middleware", "high", "No Clerk middleware detected", "Clerk is installed but no clerkMiddleware()/authMiddleware was found, so routes may be unprotected.", "Add clerkMiddleware() in middleware.ts and configure protected route matchers.")
      }
      if (!hasEnv(envKeys, "CLERK_SECRET_KEY")) {
        push("clerk-secret", "medium", "CLERK_SECRET_KEY not referenced", "The Clerk secret key wasn't found in environment usage; server-side verification needs it.", "Set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment.")
      }
      break
    }
    case "next-auth": {
      methods.push({ id: "authjs", label: "Auth.js Providers", kind: "credential", enabled: true, detail: "Providers configured via the Auth.js config." })
      if (/Credentials(Provider)?\s*\(/.test(blob)) methods.push({ id: "credentials", label: "Credentials", kind: "credential", enabled: true, detail: "Custom credentials provider." })
      if (socialProviders.length > 0) methods.push({ id: "social", label: "OAuth Providers", kind: "social", enabled: true, detail: `${socialProviders.length} provider${socialProviders.length === 1 ? "" : "s"}`, providers: socialProviders })
      if (!hasEnv(envKeys, "AUTH_SECRET") && !hasEnv(envKeys, "NEXTAUTH_SECRET")) {
        push("authjs-secret", "high", "AUTH_SECRET not configured", "Auth.js requires a secret to encrypt JWTs/sessions; none was found in env usage.", "Set AUTH_SECRET (v5) or NEXTAUTH_SECRET (v4) — e.g. `openssl rand -base64 32`.")
      }
      break
    }
    case "supabase": {
      methods.push({ id: "supabase-auth", label: "Supabase Auth", kind: "credential", enabled: true, detail: "Email/password & magic links via supabase.auth." })
      if (socialProviders.length > 0) methods.push({ id: "social", label: "OAuth Providers", kind: "social", enabled: true, detail: `${socialProviders.length} provider${socialProviders.length === 1 ? "" : "s"}`, providers: socialProviders })
      if (/service[_-]?role/i.test(blob) && /createClient/.test(blob)) {
        push("supabase-service-role", "high", "Service-role key may be used client-side", "A service_role reference appears near client creation. This key bypasses Row Level Security and must never reach the browser.", "Use the anon key on the client; keep the service-role key server-only.")
      }
      if (!/auth-helpers|@supabase\/ssr/.test(blob) && integration === "Next.js") {
        push("supabase-ssr", "low", "Not using @supabase/ssr", "For Next.js, @supabase/ssr handles cookie-based sessions across server and client correctly.", "Adopt @supabase/ssr for server-side session handling.")
      }
      break
    }
    case "lucia": {
      methods.push({ id: "lucia-sessions", label: "Lucia Sessions", kind: "credential", enabled: true, detail: "Session-based auth managed by Lucia." })
      push("lucia-v3", "info", "Verify Lucia version & adapter", "Lucia v3 changed its API significantly. Ensure your session/adapter setup matches the installed version.", "Confirm the adapter (Drizzle/Prisma) and session cookie config against the Lucia docs.")
      break
    }
    case "firebase": {
      methods.push({ id: "firebase-auth", label: "Firebase Auth", kind: "credential", enabled: true, detail: "Authentication via the Firebase SDK." })
      if (socialProviders.length > 0) methods.push({ id: "social", label: "OAuth Providers", kind: "social", enabled: true, detail: `${socialProviders.length} provider${socialProviders.length === 1 ? "" : "s"}`, providers: socialProviders })
      if (!ctx.hasDep("firebase-admin")) {
        push("firebase-admin", "medium", "No firebase-admin for server verification", "Only the client Firebase SDK is present. Verifying ID tokens on the server needs firebase-admin.", "Add firebase-admin and verify ID tokens in your API/server routes.")
      }
      break
    }
    case "auth0": {
      methods.push({ id: "auth0-hosted", label: "Auth0 Universal Login", kind: "credential", enabled: true, detail: "Hosted login handled by Auth0." })
      if (!hasEnv(envKeys, "AUTH0_SECRET")) {
        push("auth0-secret", "medium", "AUTH0_SECRET not referenced", "The Auth0 SDK needs a session encryption secret; none was found in env usage.", "Set AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET.")
      }
      break
    }
    case "passport": {
      methods.push({ id: "passport-strategies", label: "Passport Strategies", kind: "credential", enabled: true, detail: "Auth via Passport strategies/middleware." })
      if (socialProviders.length > 0) methods.push({ id: "social", label: "OAuth Strategies", kind: "social", enabled: true, detail: `${socialProviders.length} provider${socialProviders.length === 1 ? "" : "s"}`, providers: socialProviders })
      break
    }
    default:
      break
  }

  const config: AuthConfigItem[] = [
    { key: "provider", label: "Provider", value: provider.name, status: "ok" },
    { key: "version", label: "Version", value: version ? `v${version}` : "unknown", status: "info" },
    { key: "integration", label: "Integration", value: integration ?? "—", status: "info" },
    {
      key: "depth",
      label: "Analysis depth",
      value: "Provider-level",
      status: "info",
      detail: "CodeLens surfaces provider detection and common pitfalls. Deep config introspection is available for Better Auth.",
    },
  ]

  findings.sort((a, b) => sevRank(b.severity) - sevRank(a.severity))

  return {
    present: true,
    provider: providerInfo(provider),
    version,
    integration,
    configPath,
    methods,
    socialProviders,
    plugins: [],
    config,
    session: {},
    findings,
    counts: {
      plugins: 0,
      methods: methods.filter((m) => m.enabled).length,
      providers: socialProviders.length,
      findings: findings.length,
    },
  }
}

function hasEnv(keys: Set<string>, name: string): boolean {
  return keys.has(name)
}

function numOpt(src: string, key: string): number | undefined {
  const m = new RegExp(`${key}\\s*:\\s*([0-9_]+)`).exec(src)
  if (!m) return undefined
  const n = Number(m[1].replace(/_/g, ""))
  return Number.isFinite(n) ? n : undefined
}

function sevRank(s: Severity): number {
  const order: Record<string, number> = { critical: 6, high: 5, error: 5, medium: 4, warning: 3, low: 2, info: 1 }
  return order[s] ?? 0
}

function empty(): AuthResult {
  return {
    present: false,
    methods: [],
    socialProviders: [],
    plugins: [],
    config: [],
    session: {},
    findings: [],
    counts: { plugins: 0, methods: 0, providers: 0, findings: 0 },
  }
}
