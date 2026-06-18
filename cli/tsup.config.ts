import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  // Keep heavy/native deps external; they're installed alongside the package.
  external: ["ai", "execa", "ws", "open", "commander", "zod"],
  banner: { js: "#!/usr/bin/env node" },
})
