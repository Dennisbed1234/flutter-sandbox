import { useState, useCallback, useRef, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import 'xterm/css/xterm.css'

/* ------------------------------------------------------------------ */
/*  Language samples                                                   */
/* ------------------------------------------------------------------ */
const SAMPLES: Record<string, { language: string; code: string }> = {
  Python: {
    language: 'python',
    code: `# Python Sandbox – runs in your browser via Pyodide
print("Hello from Python!")
print("2 + 2 =", 2 + 2)

# Try lists, loops, functions…
nums = [1, 2, 3, 4, 5]
print("Squares:", [n**2 for n in nums])

def greet(name):
    return f"Hi, {name}!"

print(greet("Developer"))
`,
  },
  JavaScript: {
    language: 'javascript',
    code: `// JavaScript runs directly in the browser
console.log("Hello from JavaScript!");
console.log("2 + 2 =", 2 + 2);

const nums = [1, 2, 3, 4, 5];
console.log("Squares:", nums.map(n => n ** 2));

function greet(name) {
  return \`Hi, \${name}!\`;
}
console.log(greet("Developer"));
`,
  },
  TypeScript: {
    language: 'typescript',
    code: `// TypeScript (compiled on the fly for demo)
const message: string = "Hello from TypeScript!";
console.log(message);

function add(a: number, b: number): number {
  return a + b;
}
console.log("3 + 5 =", add(3, 5));
`,
  },
  HTML: {
    language: 'html',
    code: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    h1 { color: #38bdf8; }
  </style>
</head>
<body>
  <h1>Hello from HTML Preview!</h1>
</body>
</html>
`,
  },
  'Python Data': {
    language: 'python',
    code: `# Simple data analysis example (pure Python)
data = [23, 45, 12, 67, 34, 89, 21, 56]

print("Data:", data)
print("Count:", len(data))
print("Sum:", sum(data))
print("Average:", sum(data) / len(data))
print("Min:", min(data), "Max:", max(data))

# Sort and show
sorted_data = sorted(data)
print("Sorted:", sorted_data)
`,
  },
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type Lang = 'python' | 'javascript' | 'typescript' | 'html'

interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>
  setStdout: (opts: { batched: (text: string) => void }) => void
  setStderr: (opts: { batched: (text: string) => void }) => void
  loadPackage: (names: string | string[]) => Promise<void>
}

declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<PyodideInterface>
    pyodide?: PyodideInterface
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function App() {
  const [code, setCode] = useState(SAMPLES.Python.code)
  const [language, setLanguage] = useState<Lang>('python')
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark')
  const [status, setStatus] = useState('Ready')
  const [isRunning, setIsRunning] = useState(false)
  const [showTerminal, setShowTerminal] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [pyodideReady, setPyodideReady] = useState(false)

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const pyodideRef = useRef<PyodideInterface | null>(null)

  /* -------------------- Terminal setup -------------------- */
  useEffect(() => {
    if (!termContainerRef.current || termRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#334155',
      },
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    const webLinks = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinks)
    term.open(termContainerRef.current)
    fitAddon.fit()

    term.writeln('\x1b[1;34m╔══════════════════════════════════════╗\x1b[0m')
    term.writeln('\x1b[1;34m║   Code Sandbox – Terminal Ready      ║\x1b[0m')
    term.writeln('\x1b[1;34m╚══════════════════════════════════════╝\x1b[0m')
    term.writeln('')
    term.writeln('Supported: \x1b[32mPython\x1b[0m (Pyodide), \x1b[33mJavaScript\x1b[0m, \x1b[36mTypeScript\x1b[0m, \x1b[35mHTML\x1b[0m')
    term.writeln('Click \x1b[1mRun\x1b[0m or press \x1b[1mCtrl+Enter\x1b[0m to execute.')
    term.writeln('')

    termRef.current = term
    fitAddonRef.current = fitAddon

    const onResize = () => fitAddon.fit()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      term.dispose()
      termRef.current = null
    }
  }, [])

  /* Refit terminal when panel visibility changes */
  useEffect(() => {
    if (showTerminal && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 50)
    }
  }, [showTerminal, showPreview])

  /* -------------------- Load Pyodide -------------------- */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (window.pyodide) {
        pyodideRef.current = window.pyodide
        setPyodideReady(true)
        return
      }
      setStatus('Loading Python runtime (Pyodide)…')
      try {
        // Load Pyodide script dynamically
        if (!document.getElementById('pyodide-script')) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.id = 'pyodide-script'
            script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Failed to load Pyodide'))
            document.head.appendChild(script)
          })
        }
        const pyodide = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
        })
        if (cancelled) return
        window.pyodide = pyodide
        pyodideRef.current = pyodide
        setPyodideReady(true)
        setStatus('Python ready')
        termRef.current?.writeln('\x1b[32m✓ Python (Pyodide) loaded successfully\x1b[0m')
      } catch (err) {
        console.error(err)
        setStatus('Failed to load Python runtime')
        termRef.current?.writeln('\x1b[31m✗ Failed to load Pyodide\x1b[0m')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  /* -------------------- Helpers -------------------- */
  const writeToTerm = useCallback((text: string, color?: string) => {
    const t = termRef.current
    if (!t) return
    if (color) t.write(`\x1b[${color}m${text}\x1b[0m`)
    else t.write(text)
  }, [])

  const clearTerm = useCallback(() => {
    termRef.current?.clear()
  }, [])

  /* -------------------- Run code -------------------- */
  const runCode = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setStatus('Running…')
    const term = termRef.current

    try {
      if (language === 'python') {
        if (!pyodideRef.current) {
          term?.writeln('\x1b[31mPython runtime not ready yet. Wait a moment…\x1b[0m')
          setStatus('Python not ready')
          return
        }
        term?.writeln('\x1b[1;34m── Running Python ──\x1b[0m')
        const py = pyodideRef.current

        // Capture stdout / stderr
        let output = ''
        py.setStdout({
          batched: (text: string) => {
            output += text + '\n'
            term?.writeln(text)
          },
        })
        py.setStderr({
          batched: (text: string) => {
            term?.writeln(`\x1b[31m${text}\x1b[0m`)
          },
        })

        try {
          await py.runPythonAsync(code)
          term?.writeln('\x1b[32m── Finished ──\x1b[0m')
          setStatus('Finished')
        } catch (err: any) {
          const msg = err?.message || String(err)
          term?.writeln(`\x1b[31m${msg}\x1b[0m`)
          setStatus('Error')
        }
      } else if (language === 'javascript' || language === 'typescript') {
        term?.writeln(`\x1b[1;33m── Running ${language === 'typescript' ? 'TypeScript (as JS)' : 'JavaScript'} ──\x1b[0m`)

        // Capture console
        const logs: string[] = []
        const originalLog = console.log
        const originalError = console.error
        const originalWarn = console.warn

        console.log = (...args) => {
          const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')
          logs.push(line)
          term?.writeln(line)
          originalLog.apply(console, args)
        }
        console.error = (...args) => {
          const line = args.map(String).join(' ')
          term?.writeln(`\x1b[31m${line}\x1b[0m`)
          originalError.apply(console, args)
        }
        console.warn = (...args) => {
          const line = args.map(String).join(' ')
          term?.writeln(`\x1b[33m${line}\x1b[0m`)
          originalWarn.apply(console, args)
        }

        try {
          // Simple eval for demo (TypeScript treated as JS for now)
          // eslint-disable-next-line no-new-func
          const fn = new Function(code)
          fn()
          term?.writeln('\x1b[32m── Finished ──\x1b[0m')
          setStatus('Finished')
        } catch (err: any) {
          term?.writeln(`\x1b[31m${err.message || err}\x1b[0m`)
          setStatus('Error')
        } finally {
          console.log = originalLog
          console.error = originalError
          console.warn = originalWarn
        }
      } else if (language === 'html') {
        term?.writeln('\x1b[1;35m── Rendering HTML Preview ──\x1b[0m')
        setPreviewHtml(code)
        setShowPreview(true)
        term?.writeln('\x1b[32mPreview updated on the right / below\x1b[0m')
        setStatus('Preview ready')
      }
    } finally {
      setIsRunning(false)
    }
  }, [code, language, isRunning])

  /* Keyboard shortcut Ctrl/Cmd + Enter */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        runCode()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [runCode])

  const onMount: OnMount = (ed) => {
    editorRef.current = ed
  }

  const changeSample = (name: string) => {
    const sample = SAMPLES[name]
    if (sample) {
      setCode(sample.code)
      setLanguage(sample.language as Lang)
    }
  }

  const getFontSize = () => {
    if (typeof window === 'undefined') return 14
    const w = window.innerWidth
    if (w < 640) return 12
    if (w < 1024) return 13
    return 14
  }

  /* -------------------- Render -------------------- */
  return (
    <div className="h-[100dvh] flex flex-col bg-gray-950 text-gray-100 safe-top safe-bottom">
      {/* HEADER */}
      <header className="shrink-0 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-400 flex items-center justify-center font-bold text-white text-xs sm:text-sm shrink-0">
              CS
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate">Code Sandbox</h1>
              <p className="text-[10px] sm:text-xs text-gray-400 hidden sm:block">
                Terminal • Python • JS • Preview
              </p>
            </div>
          </div>

          {/* Desktop controls */}
          <div className="hidden md:flex items-center gap-2">
            <select
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm"
              value={Object.entries(SAMPLES).find(([, v]) => v.code === code)?.[0] || 'Python'}
              onChange={(e) => changeSample(e.target.value)}
            >
              {Object.keys(SAMPLES).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <select
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Lang)}
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="html">HTML</option>
            </select>

            <button
              onClick={() => setTheme(t => t === 'vs-dark' ? 'light' : 'vs-dark')}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm border border-gray-700"
            >
              {theme === 'vs-dark' ? '☀️' : '🌙'}
            </button>

            <button
              onClick={() => setShowTerminal(s => !s)}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm border border-gray-700"
            >
              {showTerminal ? 'Hide Term' : 'Terminal'}
            </button>

            <button
              onClick={() => setShowPreview(s => !s)}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm border border-gray-700"
            >
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>

            <button
              onClick={clearTerm}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm border border-gray-700"
            >
              Clear
            </button>

            <button
              onClick={runCode}
              disabled={isRunning || (language === 'python' && !pyodideReady)}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium"
            >
              {isRunning ? 'Running…' : '▶ Run'}
            </button>
          </div>
        </div>

        {/* Mobile controls */}
        <div className="md:hidden flex items-center gap-1.5 px-3 pb-2 overflow-x-auto">
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs shrink-0"
            onChange={(e) => changeSample(e.target.value)}
            defaultValue="Python"
          >
            {Object.keys(SAMPLES).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs shrink-0"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Lang)}
          >
            <option value="python">Python</option>
            <option value="javascript">JS</option>
            <option value="typescript">TS</option>
            <option value="html">HTML</option>
          </select>

          <button onClick={() => setShowTerminal(s => !s)} className="px-2.5 py-1.5 rounded bg-gray-800 text-xs border border-gray-700 shrink-0">
            Term
          </button>
          <button onClick={() => setShowPreview(s => !s)} className="px-2.5 py-1.5 rounded bg-gray-800 text-xs border border-gray-700 shrink-0">
            Preview
          </button>
          <button onClick={clearTerm} className="px-2.5 py-1.5 rounded bg-gray-800 text-xs border border-gray-700 shrink-0">
            Clear
          </button>
          <button
            onClick={runCode}
            disabled={isRunning || (language === 'python' && !pyodideReady)}
            className="px-3 py-1.5 rounded bg-emerald-600 disabled:opacity-50 text-xs font-medium shrink-0"
          >
            {isRunning ? '…' : '▶ Run'}
          </button>
        </div>
      </header>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Editor */}
        <div className={`flex flex-col min-h-0 border-gray-800 ${
          showTerminal || showPreview
            ? 'h-1/2 lg:h-full lg:w-1/2 border-b lg:border-b-0 lg:border-r'
            : 'h-full w-full'
        }`}>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={language === 'python' ? 'python' : language}
              theme={theme}
              value={code}
              onChange={(v) => setCode(v || '')}
              onMount={onMount}
              options={{
                fontSize: getFontSize(),
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                lineNumbers: typeof window !== 'undefined' && window.innerWidth < 640 ? 'off' : 'on',
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
          <div className="h-7 sm:h-8 px-2 sm:px-3 flex items-center justify-between text-[10px] sm:text-xs bg-gray-900 border-t border-gray-800 text-gray-400 shrink-0">
            <span className="truncate">{status}</span>
            <span className="shrink-0 ml-2">
              {language === 'python' ? (pyodideReady ? 'Python ✓' : 'Loading Python…') : language}
            </span>
          </div>
        </div>

        {/* Right / Bottom panels */}
        {(showTerminal || showPreview) && (
          <div className={`flex flex-col min-h-0 ${
            showTerminal && showPreview ? 'h-1/2 lg:h-full lg:w-1/2' : 'h-1/2 lg:h-full lg:w-1/2'
          }`}>
            {/* Terminal */}
            {showTerminal && (
              <div className={`flex flex-col min-h-0 bg-[#0f172a] ${
                showPreview ? 'h-1/2 border-b border-gray-800' : 'h-full'
              }`}>
                <div className="px-2 sm:px-3 py-1 text-[10px] sm:text-xs border-b border-gray-800 flex justify-between items-center shrink-0 bg-gray-900">
                  <span>Terminal</span>
                  <span className="text-gray-500">Ctrl+Enter to Run</span>
                </div>
                <div ref={termContainerRef} className="flex-1 min-h-0 p-1" />
              </div>
            )}

            {/* Preview */}
            {showPreview && (
              <div className={`flex flex-col min-h-0 bg-white ${
                showTerminal ? 'h-1/2' : 'h-full'
              }`}>
                <div className="px-2 sm:px-3 py-1 text-[10px] sm:text-xs border-b border-gray-300 flex justify-between items-center shrink-0 bg-gray-100 text-gray-800">
                  <span>Preview</span>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-gray-500 hover:text-gray-800"
                  >
                    ✕
                  </button>
                </div>
                <iframe
                  title="Preview"
                  srcDoc={previewHtml || '<html><body style="font-family:system-ui;padding:1rem;color:#64748b">Run HTML code to see preview here</body></html>'}
                  className="flex-1 w-full border-0 bg-white"
                  sandbox="allow-scripts"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
