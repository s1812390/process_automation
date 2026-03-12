import { useEffect, useRef, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { clsx } from 'clsx'

interface LogLine {
  id: number
  stream: string
  line_text: string
  logged_at: string
  type?: string
}

interface LogViewerProps {
  runId: number
  isLive?: boolean
  initialLogs?: LogLine[]
}

export function LogViewer({ runId, isLive = false, initialLogs = [] }: LogViewerProps) {
  const [logs, setLogs] = useState<LogLine[]>(initialLogs)
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (!isLive) {
      setLogs(initialLogs)
      return
    }

    const es = new EventSource(`/api/runs/${runId}/logs/stream`)
    setConnected(true)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'done') {
          es.close()
          setConnected(false)
          return
        }
        if (data.type === 'error') {
          es.close()
          setConnected(false)
          return
        }
        setLogs((prev) => [...prev, data])
      } catch {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      es.close()
      setConnected(false)
    }

    return () => {
      es.close()
      setConnected(false)
    }
  }, [runId, isLive])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setAutoScroll(atBottom)
  }

  const handleCopy = () => {
    const text = logs.map((l) => `[${l.stream}] ${l.line_text}`).join('\n')
    navigator.clipboard.writeText(text)
  }

  const handleDownload = () => {
    const text = logs.map((l) => `[${l.stream}] ${l.line_text}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `run-${runId}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[rgba(255,255,255,0.06)]">
      {/* Toolbar */}
      <div className="bg-[#0d1117] border-b border-[rgba(255,255,255,0.06)] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[11px] text-[rgba(255,255,255,0.3)] font-mono ml-2">
            run-{runId}.log
          </span>
          {connected && (
            <span className="flex items-center gap-1 text-[10px] text-success font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />
              live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-white/10 text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
            title="Copy logs"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-white/10 text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
            title="Download logs"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="bg-ink-1 text-[13px] font-mono p-4 h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-ink-2"
      >
        {logs.length === 0 ? (
          <div className="text-[rgba(255,255,255,0.2)] text-[12px]">
            {isLive ? 'Waiting for output...' : 'No logs available.'}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id || i} className="flex items-start gap-2 leading-5 py-0.5">
              <span
                className={clsx(
                  'text-[10px] font-mono mt-0.5 flex-shrink-0 w-10',
                  log.stream === 'stderr' ? 'text-[rgba(255,100,100,0.5)]' : 'text-[rgba(100,200,100,0.4)]'
                )}
              >
                {log.stream}
              </span>
              <span
                className={clsx(
                  'flex-1 break-all',
                  log.stream === 'stderr' ? 'text-[#ff8080]' : 'text-[#a8d8a8]'
                )}
              >
                {log.line_text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
