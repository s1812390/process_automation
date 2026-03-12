import Editor from '@monaco-editor/react'

interface ScriptEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  height?: string
  readOnly?: boolean
}

export function ScriptEditor({
  value,
  onChange,
  language = 'python',
  height = '400px',
  readOnly = false,
}: ScriptEditorProps) {
  return (
    <div className="rounded-lg overflow-hidden border border-[rgba(99,112,156,0.15)] bg-ink-1">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: '"DM Mono", monospace',
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          readOnly,
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  )
}
