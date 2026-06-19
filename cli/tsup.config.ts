import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  // Keep heavy/native deps external; they're installed alongside the package.
  external: ["ai", "execa", "ws", "open", "commander", "zod"],
  // The shebang is already present at the top of src/cli.ts; tsup preserves it.
  // Adding a banner here would duplicate it and break ESM parsing.
})
