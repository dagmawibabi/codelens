interface CodeBlockProps {
  /** Line number the snippet starts at. */
  startLine: number
  code: string
  /** 1-based absolute line number to highlight. */
  highlightLine?: number
  className?: string
}

/**
 * Minimal monospace code preview with gutter line numbers and a highlighted
 * row. Deliberately dependency-free so it works in the static CLI bundle.
 */
export function CodeBlock({ startLine, code, highlightLine, className }: CodeBlockProps) {
  const lines = code.replace(/\n$/, "").split("\n")

  return (
    <pre
      className={`overflow-x-auto rounded-md border border-border bg-background/60 py-2 font-mono text-xs leading-relaxed ${className ?? ""}`}
    >
      <code className="block">
        {lines.map((line, i) => {
          const lineNo = startLine + i
          const isHit = lineNo === highlightLine
          return (
            <div
              key={lineNo}
              className={`flex ${isHit ? "bg-[color:var(--sev-critical)]/10" : ""}`}
            >
              <span
                className={`sticky left-0 w-10 shrink-0 select-none px-2 text-right tabular-nums ${
                  isHit ? "text-[color:var(--sev-critical)]" : "text-muted-foreground/50"
                }`}
              >
                {lineNo}
              </span>
              <span
                className={`flex-1 whitespace-pre pl-3 pr-4 ${
                  isHit
                    ? "border-l-2 border-[color:var(--sev-critical)] text-foreground"
                    : "border-l-2 border-transparent text-foreground/80"
                }`}
              >
                {line || " "}
              </span>
            </div>
          )
        })}
      </code>
    </pre>
  )
}
