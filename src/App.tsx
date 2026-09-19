import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { SAMPLES } from './samples'

type Lang = 'python' | 'javascript' | 'typescript' | 'html' | 'dart'

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

const IPHONE_URLS = [
  '/iphone/index.html',
  'https://i-phone17-mock.vercel.app',
  'https://iphone17-mock.vercel.app',
]

const PLACEHOLDER_HTML =
  '<html><body style="display:flex;align-items:center;justify-content:center;height:100%;margin:0;font-family:-apple-system,system-ui;color:#94a3b8;background:#000;text-align:center;padding:24px"><div><p style="font-size:15px">Tap <b style="color:#34d399">Run</b> to preview HTML</p><p style="font-size:12px;opacity:0.7;margin-top:10px">or open full iPhone simulator</p></div></body></html>'

function IPhoneFrame({ html }: { html: string }) {
  return (
    <div className="iphone-stage">
      <div className="iphone-17">
        <div className="iphone-side action" />
        <div className="iphone-side vol-up" />
        <div className="iphone-side vol-down" />
        <div className="iphone-side power" />
        <div className="iphone-17-body">
          <div className="iphone-17-screen-wrap">
            <div className="iphone-17-island" />
            <iframe
              title="iPhone Preview"
              srcDoc={html || PLACEHOLDER_HTML}
              className="iphone-17-screen"
              sandbox="allow-scripts"
            />
            <div className="iphone-17-home" />
          </div>
        </div>
      </div>
    </div>
  )
}

function monacoLang(lang: Lang): string {
  if (lang === 'dart') return 'dart'
  if (lang === 'python') return 'python'
  return lang
}

export default function App() {
  const [code, setCode] = useState(SAMPLES['iPhone Home'].code)
  const [language, setLanguage] = useState<Lang>('html')
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark')
  const [status, setStatus] = useState('Ready')
  const [isRunning, setIsRunning] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [pyodideReady, setPyodideReady] = useState(false)
  const [activeTab, setActiveTab] = useState<'editor' | 'terminal' | 'preview'>('editor')
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : true
  )
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showIPhone, setShowIPhone] = useState(false)
  const [iphoneSrc, setIphoneSrc] = useState(IPHONE_URLS[0])

  const termRef = useRef<Terminal | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const pyodideRef = useRef<PyodideInterface | null>(null)
  const editorRef = useRef<any>(null)
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/iphone/index.html', { method: 'HEAD' })
        if (!cancelled && r.ok) {
          setIphoneSrc('/iphone/index.html')
          return
        }
      } catch { /* ignore */ }
      if (!cancelled) setIphoneSrc(IPHONE_URLS[1])
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const el = termContainerRef.current
    if (!el) return
    if (termRef.current) {
      try {
        if (!(termRef.current as any).element?.isConnected) termRef.current.open(el)
        fitAddonRef.current?.fit()
      } catch { /* ignore */ }
      return
    }
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, monospace',
      theme: {
        background: '#0a0f1a',
        foreground: '#e2e8f0',
        cursor: '#34d399',
        selectionBackground: '#1e293b',
      },
      convertEol: true,
      scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(el)
    fitAddon.fit()
    term.writeln('Code Sandbox ready')
    term.writeln('Dart · Python · JS · HTML · iPhone preview')
    term.writeln('')
    termRef.current = term
    fitAddonRef.current = fitAddon
    const onResize = () => { try { fitAddon.fit() } catch { /* */ } }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeTab, isMobile])

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
            s.onerror = () => reject(new Error('fail'))
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
      } catch {
        setStatus('Python offline')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const clearTerminal = useCallback(() => {
    const term = termRef.current
    if (!term) {
      setStatus('Open Terminal tab first')
      setActiveTab('terminal')
      return
    }
    term.reset()
    term.clear()
    term.write('\x1b[2J\x1b[3J\x1b[H')
    term.writeln('Terminal cleared')
    term.writeln('')
    setActiveTab('terminal')
    setStatus('Terminal cleared')
    try { fitAddonRef.current?.fit() } catch { /* */ }
  }, [])

  const clearCode = useCallback(() => {
    setCode('')
    if (editorRef.current) editorRef.current.setValue('')
    setStatus('Code erased')
    setActiveTab('editor')
  }, [])

  const pasteCode = useCallback(async () => {
    setActiveTab('editor')
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          const ed = editorRef.current
          if (ed) {
            ed.executeEdits('paste', [{
              identifier: { major: 1, minor: 1 },
              range: ed.getSelection(),
              text,
              forceMoveMarkers: true,
            }])
            setCode(ed.getValue())
          } else {
            setCode((prev) => (prev ? prev + '\n' + text : text))
          }
          setStatus('Pasted from clipboard')
          return
        }
      }
    } catch { /* fall through */ }
    setPasteText('')
    setShowPasteBox(true)
    setTimeout(() => pasteAreaRef.current?.focus(), 100)
  }, [])

  const applyPasteBox = useCallback(() => {
    const text = pasteText
    if (!text) {
      setShowPasteBox(false)
      return
    }
    const ed = editorRef.current
    if (ed) {
      ed.executeEdits('paste', [{
        identifier: { major: 1, minor: 1 },
        range: ed.getSelection(),
        text,
        forceMoveMarkers: true,
      }])
      setCode(ed.getValue())
    } else {
      setCode((prev) => (prev ? prev + '\n' + text : text))
    }
    setShowPasteBox(false)
    setPasteText('')
    setStatus('Pasted')
    setActiveTab('editor')
  }, [pasteText])

  const runDart = async (src: string, term: Terminal | null) => {
    term?.writeln('-- Dart --')
    try {
      const res = await fetch('https://stable.api.dartpad.dev/api/v3/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: src }),
      })
      if (res.ok) {
        const data = await res.json()
        const issues = data?.issues || data?.errors || []
        if (Array.isArray(issues) && issues.length) {
          issues.forEach((iss: any) => {
            term?.writeln(`[${iss.kind || 'info'}] ${iss.message || JSON.stringify(iss)}`)
          })
        } else {
          term?.writeln('Analyze: no issues')
        }
      }
    } catch {
      term?.writeln('(Dart analyze API unavailable offline)')
    }
    if (src.includes('print(')) {
      term?.writeln('Simulated output:')
      if (src.includes('Hello from Dart')) term?.writeln('Hello from Dart!')
      if (src.includes('2 + 2')) term?.writeln('2 + 2 = 4')
      if (src.includes('Squares')) term?.writeln('Squares: [1, 4, 9, 16, 25]')
      if (src.includes('greet')) term?.writeln('Hi, Developer!')
    }
    term?.writeln('-- done --')
    term?.writeln('Tip: Full Flutter UI → use HTML sample or Full iPhone')
  }

  const runCode = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setStatus('Running…')
    const term = termRef.current
    try {
      if (language === 'html') {
        setPreviewHtml(code)
        setActiveTab('preview')
        term?.writeln('HTML → iPhone preview')
        setStatus('Preview ready')
      } else if (language === 'dart') {
        setActiveTab('terminal')
        await runDart(code, term)
        setStatus('Done')
      } else if (language === 'python') {
        setActiveTab('terminal')
        if (!pyodideRef.current) {
          term?.writeln('Python still loading…')
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
          term?.writeln(err instanceof Error ? err.message : String(err))
          setStatus('Error')
        }
      } else {
        setActiveTab('terminal')
        term?.writeln('-- JavaScript --')
        const origLog = console.log
        console.log = (...a: unknown[]) => {
          term?.writeln(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '))
          origLog(...a)
        }
        try {
          // eslint-disable-next-line no-new-func
          new Function(code)()
          term?.writeln('-- done --')
          setStatus('Done')
        } catch (err: unknown) {
          term?.writeln(err instanceof Error ? err.message : String(err))
          setStatus('Error')
        } finally {
          console.log = origLog
        }
      }
    } finally {
      setIsRunning(false)
    }
  }, [code, language, isRunning])

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

  const changeSample = (name: string) => {
    const s = SAMPLES[name]
    if (s) {
      setCode(s.code)
      setLanguage(s.language as Lang)
      setStatus('Sample loaded')
      setActiveTab('editor')
    }
  }

  const fontSize = isMobile ? 13 : 14

  if (showIPhone) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-black/90 border-b border-white/10">
          <button onClick={() => setShowIPhone(false)} className="h-9 px-4 rounded-full bg-white/10 text-white text-sm font-medium">← Back</button>
          <span className="text-xs text-white/60">iPhone 17 · Passcode 000000</span>
          <button onClick={() => { const el = document.getElementById('iphone-frame') as HTMLIFrameElement | null; if (el) el.src = el.src }} className="h-9 px-3 rounded-full bg-white/10 text-white text-xs">Reboot</button>
        </div>
        <iframe id="iphone-frame" title="iPhone 17 Simulator" src={iphoneSrc} className="flex-1 w-full border-0 bg-black" allow="camera; microphone; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
      </div>
    )
  }

  const PasteModal = () => {
    if (!showPasteBox) return null
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
        <div className="w-full max-w-lg bg-[#0c1220] border border-slate-700 rounded-2xl p-4 shadow-2xl">
          <h3 className="text-sm font-semibold text-slate-100 mb-2">Paste your code</h3>
          <p className="text-[11px] text-slate-500 mb-3">Long-press below → Paste, then Apply</p>
          <textarea ref={pasteAreaRef} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste code here…" className="w-full h-40 bg-[#0a0f1a] border border-slate-700 rounded-xl p-3 text-sm text-slate-100 font-mono resize-none focus:outline-none focus:border-emerald-500" autoFocus />
          <div className="flex gap-2 mt-3">
            <button onClick={() => { setShowPasteBox(false); setPasteText('') }} className="flex-1 h-11 rounded-xl bg-slate-800 text-slate-300 text-sm">Cancel</button>
            <button onClick={applyPasteBox} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm">Apply Paste</button>
          </div>
        </div>
      </div>
    )
  }

  const LangSelect = ({ className }: { className?: string }) => (
    <select className={className || 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs'} value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
      <option value="html">HTML</option>
      <option value="dart">Dart</option>
      <option value="javascript">JavaScript</option>
      <option value="python">Python</option>
      <option value="typescript">TypeScript</option>
    </select>
  )

  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col bg-[#070b14] text-slate-100 safe-top">
        <PasteModal />
        <header className="shrink-0 px-3 pt-2 pb-1.5 flex items-center justify-between border-b border-slate-800 bg-[#0c1220]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center"><span className="text-white font-bold text-sm">CS</span></div>
            <div>
              <h1 className="text-[15px] font-semibold">Code Sandbox</h1>
              <p className="text-[10px] text-slate-500">{language === 'python' ? (pyodideReady ? 'Python ready' : 'Loading Python…') : language}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setShowIPhone(true)} className="h-9 px-3 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30">📱 iPhone</button>
            <button onClick={() => setTheme(t => t === 'vs-dark' ? 'light' : 'vs-dark')} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">{theme === 'vs-dark' ? '☀️' : '🌙'}</button>
          </div>
        </header>
        <div className="shrink-0 px-3 py-2 flex gap-2 overflow-x-auto border-b border-slate-800">
          <select className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs min-w-[120px]" onChange={(e) => changeSample(e.target.value)} defaultValue="iPhone Home">
            {Object.keys(SAMPLES).map(n => (<option key={n} value={n}>{n}</option>))}
          </select>
          <LangSelect />
        </div>
        <div className="shrink-0 flex border-b border-slate-800 bg-[#0a101c]">
          {(['editor', 'terminal', 'preview'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'terminal') setTimeout(() => { try { fitAddonRef.current?.fit() } catch { /* */ } }, 50) }} className={`flex-1 py-2.5 text-xs font-medium ${activeTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'}`}>
              {tab === 'editor' ? 'Code' : tab === 'terminal' ? 'Terminal' : 'Preview'}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 relative">
          <div className={`absolute inset-0 ${activeTab === 'editor' ? 'z-10' : 'invisible'}`}>
            <Editor height="100%" language={monacoLang(language)} theme={theme} value={code} onChange={(v) => setCode(v || '')} onMount={(editor) => { editorRef.current = editor }} options={{ fontSize, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on', lineNumbers: 'on', lineNumbersMinChars: 3, folding: false, padding: { top: 8, bottom: 8 } }} />
          </div>
          <div className={`absolute inset-0 flex flex-col bg-[#0a0f1a] ${activeTab === 'terminal' ? 'z-10' : 'invisible'}`}>
            <div className="px-3 py-1.5 text-xs border-b border-slate-800 flex justify-between bg-[#0c1220] text-slate-400">
              <span className="text-slate-300 font-medium">Terminal</span>
              <button onClick={clearTerminal} className="text-emerald-400 font-medium">Clear</button>
            </div>
            <div ref={termContainerRef} className="flex-1 min-h-0 p-1" />
          </div>
          <div className={`absolute inset-0 ${activeTab === 'preview' ? 'z-10' : 'invisible'}`}>
            <IPhoneFrame html={previewHtml} />
          </div>
        </div>
        <div className="shrink-0 px-2 py-2 flex items-center gap-1.5 border-t border-slate-800 bg-[#0c1220] safe-bottom">
          <button onClick={clearCode} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300">Erase</button>
          <button onClick={pasteCode} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300">Paste</button>
          <button onClick={clearTerminal} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300">Clear</button>
          <button onClick={() => setShowIPhone(true)} className="h-10 px-2.5 rounded-xl bg-slate-700 text-[11px] text-emerald-300 font-medium">iPhone</button>
          <div className="flex-1 text-center min-w-0"><p className="text-[10px] text-slate-500 truncate">{status}</p></div>
          <button onClick={runCode} disabled={isRunning} className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm disabled:opacity-40">{isRunning ? '…' : 'Run'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#070b14] text-slate-100">
      <PasteModal />
      <header className="shrink-0 border-b border-slate-800 bg-[#0c1220]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center"><span className="text-white font-bold text-sm">CS</span></div>
            <div>
              <h1 className="text-base font-semibold">Code Sandbox</h1>
              <p className="text-[11px] text-slate-500">Dart · Python · JS · HTML · iPhone 17 preview</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => setShowIPhone(true)} className="px-4 py-2 rounded-xl text-sm bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/40">📱 Full iPhone</button>
            <select className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm" onChange={(e) => changeSample(e.target.value)} defaultValue="iPhone Home">
              {Object.keys(SAMPLES).map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
            <LangSelect className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm" />
            <button onClick={pasteCode} className="px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-300">Paste</button>
            <button onClick={clearCode} className="px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-300">Erase</button>
            <button onClick={clearTerminal} className="px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-300">Clear</button>
            <button onClick={() => setTheme(t => t === 'vs-dark' ? 'light' : 'vs-dark')} className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">{theme === 'vs-dark' ? '☀️' : '🌙'}</button>
            <button onClick={runCode} disabled={isRunning} className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-semibold disabled:opacity-40">{isRunning ? 'Running…' : 'Run'}</button>
          </div>
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-1/2 flex flex-col border-r border-slate-800 min-h-0">
          <div className="flex-1 min-h-0">
            <Editor height="100%" language={monacoLang(language)} theme={theme} value={code} onChange={(v) => setCode(v || '')} onMount={(editor) => { editorRef.current = editor }} options={{ fontSize, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on', padding: { top: 12, bottom: 12 } }} />
          </div>
          <div className="h-8 px-4 flex items-center justify-between text-xs bg-[#0c1220] border-t border-slate-800 text-slate-500">
            <span>{status}</span><span>{language}</span>
          </div>
        </div>
        <div className="w-1/2 flex flex-col min-h-0">
          <div className="h-[42%] flex flex-col min-h-0 border-b border-slate-800 bg-[#0a0f1a]">
            <div className="px-3 py-1.5 text-xs border-b border-slate-800 flex justify-between bg-[#0c1220] text-slate-400">
              <span className="text-slate-300 font-medium">Terminal</span>
              <button onClick={clearTerminal} className="text-emerald-400 hover:underline font-medium">Clear</button>
            </div>
            <div ref={termContainerRef} className="flex-1 min-h-0 p-1" />
          </div>
          <div className="flex-1 flex flex-col min-h-0 bg-[#070b14]">
            <div className="px-3 py-1.5 text-xs border-b border-slate-800 flex justify-between bg-[#0c1220] text-slate-400">
              <span className="text-slate-300 font-medium">iPhone 17 Preview</span>
              <button onClick={() => setShowIPhone(true)} className="text-emerald-400 hover:underline">Full device →</button>
            </div>
            <div className="flex-1 min-h-0">
              <IPhoneFrame html={previewHtml} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
