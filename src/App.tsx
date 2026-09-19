import { useState, useCallback, useRef, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const SAMPLES: Record<string, { language: string; code: string }> = {
  Python: {
    language: 'python',
    code: `# Python – runs in your browser\nprint("Hello from Python!")\nprint("2 + 2 =", 2 + 2)\n\nnums = [1, 2, 3, 4, 5]\nprint("Squares:", [n**2 for n in nums])\n\ndef greet(name):\n    return f"Hi, {name}!"\n\nprint(greet("Developer"))\n`,
  },
  JavaScript: {
    language: 'javascript',
    code: `// JavaScript\nconsole.log("Hello from JavaScript!");\nconsole.log("2 + 2 =", 2 + 2);\n\nconst nums = [1, 2, 3, 4, 5];\nconsole.log("Squares:", nums.map(n => n ** 2));\n\nfunction greet(name) {\n  return "Hi, " + name + "!";\n}\nconsole.log(greet("Developer"));\n`,
  },
  TypeScript: {
    language: 'typescript',
    code: `// TypeScript\nconst message: string = "Hello from TypeScript!";\nconsole.log(message);\n\nfunction add(a: number, b: number): number {\n  return a + b;\n}\nconsole.log("3 + 5 =", add(3, 5));\n`,
  },
  HTML: {
    language: 'html',
    code: `<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body {\n      font-family: system-ui, sans-serif;\n      display: flex;\n      justify-content: center;\n      align-items: center;\n      height: 100vh;\n      margin: 0;\n      background: linear-gradient(135deg, #0f172a, #1e293b);\n      color: #e2e8f0;\n    }\n    h1 { color: #34d399; font-size: 1.8rem; }\n  </style>\n</head>\n<body>\n  <h1>Hello from HTML</h1>\n</body>\n</html>\n`,
  },
  'Python Data': {
    language: 'python',
    code: `# Simple data analysis\ndata = [23, 45, 12, 67, 34, 89, 21, 56]\n\nprint("Data:", data)\nprint("Count:", len(data))\nprint("Sum:", sum(data))\nprint("Average:", round(sum(data) / len(data), 2))\nprint("Min:", min(data), "| Max:", max(data))\nprint("Sorted:", sorted(data))\n`,
  },
}

type Lang = 'python' | 'javascript' | 'typescript' | 'html'

interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>
  setStdout: (opts: { batched: (text: string) => void }) => void
  setStderr: (opts: { batched: (text: string) => void }) => void
}

declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<PyodideInterface>
    pyodide?: PyodideInterface
  }
}

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
  const [activeTab, setActiveTab] = useState<'editor' | 'terminal' | 'preview'>('editor')
  const [isMobile, setIsMobile] = useState(false)

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const pyodideRef = useRef<PyodideInterface | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!termContainerRef.current || termRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "SF Mono", "Courier New", monospace',
      theme: {
        background: '#0a0f1a',
        foreground: '#e2e8f0',
        cursor: '#34d399',
        selectionBackground: '#1e293b',
      },
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(termContainerRef.current)
    fitAddon.fit()

    term.writeln('  Code Sandbox v2')
    term.writeln('  Python · JS · TS · HTML')
    term.writeln('  Tap Run or press Ctrl+Enter')
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

  useEffect(() => {
    if ((showTerminal || activeTab === 'terminal') && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 80)
    }
  }, [showTerminal, showPreview, activeTab])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (window.pyodide) {
        pyodideRef.current = window.pyodide
        setPyodideReady(true)
        return
      }
      setStatus('Loading Python…')
      try {
        if (!document.getElementById('pyodide-script')) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script')
            s.id = 'pyodide-script'
            s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js'
            s.onload = () => resolve()
            s.onerror = () => reject(new Error('Pyodide load failed'))
            document.head.appendChild(s)
          })
        }
        const py = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
        })
        if (cancelled) return
        window.pyodide = py
        pyodideRef.current = py
        setPyodideReady(true)
        setStatus('Ready')
        termRef.current?.writeln('  Python ready')
      } catch {
        setStatus('Python failed')
        termRef.current?.writeln('  Python failed to load')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const clearTerm = useCallback(() => termRef.current?.clear(), [])

  const runCode = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setStatus('Running…')
    if (isMobile) setActiveTab('terminal')

    const term = termRef.current

    try {
      if (language === 'python') {
        if (!pyodideRef.current) {
          term?.writeln('Python not ready yet…')
          setStatus('Wait for Python')
          return
        }
        term?.writeln('-- Python --')
        const py = pyodideRef.current
        py.setStdout({ batched: (t) => term?.writeln(t) })
        py.setStderr({ batched: (t) => term?.writeln(t) })
        try {
          await py.runPythonAsync(code)
          term?.writeln('-- done --')
          setStatus('Done')
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          term?.writeln(msg)
          setStatus('Error')
        }
      } else if (language === 'javascript' || language === 'typescript') {
        term?.writeln('-- ' + (language === 'typescript' ? 'TypeScript' : 'JavaScript') + ' --')
        const origLog = console.log
        const origError = console.error
        const origWarn = console.warn
        console.log = (...a: unknown[]) => {
          term?.writeln(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '))
          origLog(...a)
        }
        console.error = (...a: unknown[]) => {
          term?.writeln(a.map(String).join(' '))
          origError(...a)
        }
        console.warn = (...a: unknown[]) => {
          term?.writeln(a.map(String).join(' '))
          origWarn(...a)
        }
        try {
          // eslint-disable-next-line no-new-func
          new Function(code)()
          term?.writeln('-- done --')
          setStatus('Done')
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          term?.writeln(msg)
          setStatus('Error')
        } finally {
          console.log = origLog
          console.error = origError
          console.warn = origWarn
        }
      } else if (language === 'html') {
        term?.writeln('-- HTML Preview --')
        setPreviewHtml(code)
        setShowPreview(true)
        if (isMobile) setActiveTab('preview')
        term?.writeln('Preview updated')
        setStatus('Preview ready')
      }
    } finally {
      setIsRunning(false)
    }
  }, [code, language, isRunning, isMobile])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        runCode()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [runCode])

  const onMount: OnMount = (ed) => { editorRef.current = ed }

  const changeSample = (name: string) => {
    const s = SAMPLES[name]
    if (s) {
      setCode(s.code)
      setLanguage(s.language as Lang)
    }
  }

  const fontSize = isMobile ? 13 : 14

  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col bg-[#070b14] text-slate-100 safe-top safe-bottom">
        <header className="shrink-0 px-3 pt-2 pb-1.5 flex items-center justify-between border-b border-slate-800/80 bg-[#0c1220]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-white font-bold text-sm">CS</span>
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight">Code Sandbox</h1>
              <p className="text-[10px] text-slate-500 leading-none">
                {language === 'python' ? (pyodideReady ? 'Python ready' : 'Loading Python…') : language}
              </p>
            </div>
          </div>
          <button
            onClick={() => setTheme(t => t === 'vs-dark' ? 'light' : 'vs-dark')}
            className="w-9 h-9 rounded-xl bg-slate-800/80 flex items-center justify-center text-base"
          >
            {theme === 'vs-dark' ? '☀️' : '🌙'}
          </button>
        </header>

        <div className="shrink-0 px-3 py-2 flex gap-2 overflow-x-auto border-b border-slate-800/60">
          <select
            className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs min-w-[110px]"
            onChange={(e) => changeSample(e.target.value)}
            defaultValue="Python"
          >
            {Object.keys(SAMPLES).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select
            className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Lang)}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="html">HTML</option>
          </select>
        </div>

        <div className="shrink-0 flex border-b border-slate-800/60 bg-[#0a101c]">
          {(['editor', 'terminal', 'preview'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium capitalize ${
                activeTab === tab
                  ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                  : 'text-slate-500'
              }`}
            >
              {tab === 'editor' ? 'Code' : tab === 'terminal' ? 'Terminal' : 'Preview'}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 relative">
          <div className={`absolute inset-0 ${activeTab === 'editor' ? 'z-10' : 'z-0 invisible'}`}>
            <Editor
              height="100%"
              language={language === 'python' ? 'python' : language}
              theme={theme}
              value={code}
              onChange={(v) => setCode(v || '')}
              onMount={onMount}
              options={{
                fontSize,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                folding: false,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>

          <div className={`absolute inset-0 flex flex-col bg-[#0a0f1a] ${activeTab === 'terminal' ? 'z-10' : 'z-0 invisible'}`}>
            <div ref={termContainerRef} className="flex-1 min-h-0 p-1" />
          </div>

          <div className={`absolute inset-0 flex flex-col bg-white ${activeTab === 'preview' ? 'z-10' : 'z-0 invisible'}`}>
            <iframe
              title="Preview"
              srcDoc={previewHtml || '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;color:#94a3b8;background:#f8fafc"><p>Run HTML to see preview</p></body></html>'}
              className="flex-1 w-full border-0"
              sandbox="allow-scripts"
            />
          </div>
        </div>

        <div className="shrink-0 px-3 py-2.5 flex items-center gap-2 border-t border-slate-800/80 bg-[#0c1220] safe-bottom">
          <button
            onClick={clearTerm}
            className="w-11 h-11 rounded-2xl bg-slate-800/90 flex items-center justify-center text-slate-400"
          >
            Clear
          </button>
          <div className="flex-1 text-center">
            <p className="text-[11px] text-slate-500 truncate">{status}</p>
          </div>
          <button
            onClick={runCode}
            disabled={isRunning || (language === 'python' && !pyodideReady)}
            className="h-11 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 disabled:opacity-40 flex items-center gap-2"
          >
            {isRunning ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#070b14] text-slate-100">
      <header className="shrink-0 border-b border-slate-800/80 bg-[#0c1220]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-white font-bold text-sm">CS</span>
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Code Sandbox</h1>
              <p className="text-[11px] text-slate-500">Terminal · Python · JS · Preview</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="bg-slate-800/90 border border-slate-700/70 rounded-xl px-3 py-2 text-sm"
              onChange={(e) => changeSample(e.target.value)}
              defaultValue="Python"
            >
              {Object.keys(SAMPLES).map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            <select
              className="bg-slate-800/90 border border-slate-700/70 rounded-xl px-3 py-2 text-sm"
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
              className="w-9 h-9 rounded-xl bg-slate-800/90 border border-slate-700/70 flex items-center justify-center"
            >
              {theme === 'vs-dark' ? '☀️' : '🌙'}
            </button>

            <button
              onClick={() => setShowTerminal(s => !s)}
              className={`px-3 py-2 rounded-xl text-sm border ${
                showTerminal
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-800/90 border-slate-700/70 text-slate-300'
              }`}
            >
              Terminal
            </button>

            <button
              onClick={() => setShowPreview(s => !s)}
              className={`px-3 py-2 rounded-xl text-sm border ${
                showPreview
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-800/90 border-slate-700/70 text-slate-300'
              }`}
            >
              Preview
            </button>

            <button
              onClick={clearTerm}
              className="px-3 py-2 rounded-xl text-sm bg-slate-800/90 border border-slate-700/70 text-slate-300"
            >
              Clear
            </button>

            <button
              onClick={runCode}
              disabled={isRunning || (language === 'python' && !pyodideReady)}
              className="ml-1 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 disabled:opacity-40"
            >
              {isRunning ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className={`flex flex-col min-h-0 border-slate-800/80 ${
          showTerminal || showPreview ? 'w-1/2 border-r' : 'w-full'
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
                fontSize,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
          <div className="h-8 px-4 flex items-center justify-between text-xs bg-[#0c1220] border-t border-slate-800/80 text-slate-500">
            <span>{status}</span>
            <span>
              {language === 'python' ? (pyodideReady ? 'Python' : 'Loading…') : language}
            </span>
          </div>
        </div>

        {(showTerminal || showPreview) && (
          <div className="w-1/2 flex flex-col min-h-0">
            {showTerminal && (
              <div className={`flex flex-col min-h-0 bg-[#0a0f1a] ${
                showPreview ? 'h-1/2 border-b border-slate-800/80' : 'h-full'
              }`}>
                <div className="px-3 py-1.5 text-xs border-b border-slate-800/80 flex justify-between items-center bg-[#0c1220] text-slate-400">
                  <span className="font-medium text-slate-300">Terminal</span>
                  <span className="text-[10px]">Ctrl + Enter</span>
                </div>
                <div ref={termContainerRef} className="flex-1 min-h-0 p-1" />
              </div>
            )}

            {showPreview && (
              <div className={`flex flex-col min-h-0 bg-white ${
                showTerminal ? 'h-1/2' : 'h-full'
              }`}>
                <div className="px-3 py-1.5 text-xs border-b border-slate-200 flex justify-between items-center bg-slate-50 text-slate-600">
                  <span className="font-medium">Preview</span>
                  <button onClick={() => setShowPreview(false)} className="text-slate-400 text-sm">X</button>
                </div>
                <iframe
                  title="Preview"
                  srcDoc={previewHtml || '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;color:#94a3b8;background:#f8fafc"><p>Run HTML code to see preview</p></body></html>'}
                  className="flex-1 w-full border-0"
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
