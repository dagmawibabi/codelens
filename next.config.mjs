/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // When building the dashboard for distribution inside the CLI package,
  // export a fully static bundle. Guarded by an env flag so the normal
  // dev/preview build is unaffected.
  ...(process.env.CODELENS_EXPORT === "1"
    ? { output: "export", distDir: ".next-export" }
    : {}),
}

export default nextConfig
