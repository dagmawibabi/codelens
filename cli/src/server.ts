import http from "node:http"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { WebSocketServer, WebSocket } from "ws"
import type { AnalysisReport, RunEvent, TrendPoint } from "./types.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// The dashboard is prebuilt into ../public when the package is bundled.
const STATIC_ROOT = path.join(__dirname, "..", "public")

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
}

export interface ServerHandle {
  url: string
  /** Broadcast a streaming event to every connected dashboard. */
  broadcast: (event: RunEvent) => void
  close: () => Promise<void>
}

export interface ServerState {
  latest: AnalysisReport | null
  history: TrendPoint[]
}

/**
 * Starts the local dashboard server.
 * - Serves the prebuilt dashboard from /public
 * - Exposes /api/latest and /api/history for initial hydration
 * - Streams live RunEvents over a WebSocket so the UI updates as checks finish
 */
export async function startServer(opts: {
  port: number
  state: ServerState
}): Promise<ServerHandle> {
  const { state } = opts

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")

    if (url.pathname === "/api/latest") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(state.latest))
      return
    }
    if (url.pathname === "/api/history") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(state.history))
      return
    }

    // Static file serving with SPA fallback to index.html
    await serveStatic(url.pathname, res)
  })

  const wss = new WebSocketServer({ server, path: "/ws" })
  const sockets = new Set<WebSocket>()
  wss.on("connection", (ws) => {
    sockets.add(ws)
    // Hydrate the freshly connected client with the latest known state.
    if (state.latest) {
      ws.send(JSON.stringify({ type: "report", report: state.latest } satisfies RunEvent))
    }
    ws.on("close", () => sockets.delete(ws))
  })

  const port = await listen(server, opts.port)
  const url = `http://localhost:${port}`

  return {
    url,
    broadcast(event) {
      const payload = JSON.stringify(event)
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload)
      }
    },
    close() {
      return new Promise((resolve) => {
        for (const ws of sockets) ws.close()
        wss.close(() => server.close(() => resolve()))
      })
    },
  }
}

async function serveStatic(pathname: string, res: http.ServerResponse) {
  let rel = pathname === "/" ? "/index.html" : pathname
  let filePath = path.join(STATIC_ROOT, rel)

  try {
    let data = await fs.readFile(filePath)
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" })
    res.end(data)
  } catch {
    // SPA fallback
    try {
      const data = await fs.readFile(path.join(STATIC_ROOT, "index.html"))
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end("Dashboard assets not found. Run `pnpm build` in the CLI package.")
    }
  }
}

/** Try the requested port, falling back to an ephemeral one if taken. */
function listen(server: http.Server, preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        server.listen(0)
      } else {
        reject(err)
      }
    }
    server.on("error", onError)
    server.listen(preferred, () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : preferred
      server.off("error", onError)
      resolve(port)
    })
  })
}
