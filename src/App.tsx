import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { SAMPLES } from './samples'
import { TEMPLATES } from './templates'
import { type Lang, loadProject, saveProject, exportProjectJson, importProjectJson, buildShareUrl, decodeShare } from './storage'
import { ProTerminal } from './proTerminal'

interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>
  setStdout: (opts: { batched: (text: string) => void }) => void
  setStderr: (opts: { batched: (text: string) => void }) => void
  loadPackage?: (names: string | string[]) => Promise<void>
}
declare global {
  interface Window {
    loadPyodide: (c?: { indexURL?: string }) => Promise<PyodideInterface>
    pyodide?: PyodideInterface
  }
}

const IPHONE_LIVE = 'https://i-phone17-mock.vercel.app/'
const PLACEHOLDER = '<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100%;background:#000;color:#94a3b8;font-family:system-ui;text-align:center;padding:24px"><div><p>Tap <b style="color:#34d399">Run</b> for HTML preview</p><p style="font-size:12px;opacity:.7;margin-top:8px">Or open Terminal · type <b>help</b></p></div></body></html>'

const DEFAULT_CODE: Record<Lang, string> = {
  html: SAMPLES['iPhone Home']?.code ?? '<html><body>Hello</body></html>',
  python: SAMPLES.Python?.code ?? 'print("Hello")',
  javascript: SAMPLES.JavaScript?.code ?? 'console.log("Hello")',
  dart: SAMPLES.Dart?.code ?? 'void main() { print("Hello"); }',
  typescript: 'console.log("Hello TS");\n',
}

function IPhoneFrame({ html }: { html: string }) {
  return (
    <div className="iphone-stage">
      <div className="iphone-17">
        <div className="iphone-side action" /><div className="iphone-side vol-up" />
        <div className="iphone-side vol-down" /><div className="iphone-side power" />
        <div className="iphone-17-body">
          <div className="iphone-17-screen-wrap">
            <div className="iphone-17-island" />
            <iframe title="Preview" srcDoc={html || PLACEHOLDER} className="iphone-17-screen" sandbox="allow-scripts" />
            <div className="iphone-17-home" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const saved = typeof window !== 'undefined' ? loadProject() : null
  const shareInit = typeof window !== 'undefined' ? decodeShare(window.location.hash) : null

  const [codeByLang, setCodeByLang] = useState<Record<Lang, string>>(() => {
    if (shareInit) return { ...DEFAULT_CODE, [shareInit.language]: shareInit.code }
    return saved?.codeByLang ?? { ...DEFAULT_CODE }
  })
  const [language, setLanguage] = useState<Lang>(() => shareInit?.language ?? saved?.language ?? 'html')
  const code = codeByLang[language]
  const setCode = useCallback((v: string | ((p: string) => string)) => {
    setCodeByLang((prev) => {
      const next = typeof v === 'function' ? v(prev[language]) : v
      return { ...prev, [language]: next }
    })
  }, [language])

  const [theme, setTheme] = useState<'vs-dark' | 'light'>(saved?.theme ?? 'vs-dark')
  const [status, setStatus] = useState('Ready')
  const [isRunning, setIsRunning] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewLang, setPreviewLang] = useState<Lang | null>(null)
  const [pyodideReady, setPyodideReady] = useState(false)
  const [activeTab, setActiveTab] = useState<'editor' | 'terminal' | 'preview'>('editor')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : true)
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showIPhone, setShowIPhone] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([])

  const termRef = useRef<Terminal | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const pyodideRef = useRef<PyodideInterface | null>(null)
  const proTermRef = useRef<ProTerminal | null>(null)
  const editorRef = useRef<any>(null)
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null)
  const termBufferRef = useRef<string[]>([])
  const codeByLangRef = useRef(codeByLang)
  const languageRef = useRef(language)
  const runCodeRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => { codeByLangRef.current = codeByLang }, [codeByLang])
  useEffect(() => { languageRef.current = language }, [language])

  useEffect(() => {
    const t = setTimeout(() => saveProject({ language, codeByLang, theme }), 600)
    return () => clearTimeout(t)
  }, [language, codeByLang, theme])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const el = termContainerRef.current
    if (!el) return
    if (termRef.current) {
      try {
        if (!(termRef.current as any).element?.isConnected) termRef.current.open(el)
        fitAddonRef.current?.fit()
      } catch {}
      return
    }
    const term = new Terminal({
      cursorBlink: true, fontSize: 13, fontFamily: 'Menlo, Monaco, monospace',
      theme: { background: '#0a0f1a', foreground: '#e2e8f0', cursor: '#34d399', selectionBackground: '#1e293b' },
      convertEol: true, scrollback: 8000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(el)
    fitAddon.fit()
    termRef.current = term
    fitAddonRef.current = fitAddon

    const pro = new ProTerminal(term, {
      getCode: () => codeByLangRef.current[languageRef.current] || '',
      getLanguage: () => languageRef.current,
      runEditorCode: async () => { await runCodeRef.current() },
      pyodide: () => pyodideRef.current,
    })
    pro.start()
    proTermRef.current = pro

    const onResize = () => { try { fitAddon.fit() } catch {} }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      pro.dispose()
      proTermRef.current = null
    }
  }, [activeTab, isMobile])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (window.pyodide) { pyodideRef.current = window.pyodide; setPyodideReady(true); return }
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
        const py = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/' })
        if (cancelled) return
        window.pyodide = py
        pyodideRef.current = py
        setPyodideReady(true)
        setStatus('Ready')
      } catch { setStatus('Python offline') }
    })()
    return () => { cancelled = true }
  }, [])

  const clearPreview = useCallback(() => { setPreviewHtml(''); setPreviewLang(null); setConsoleLogs([]) }, [])
  const switchLanguage = useCallback((next: Lang) => {
    setLanguage(next); clearPreview(); setActiveTab('editor'); setStatus('Switched to ' + next)
  }, [clearPreview])

  const writeTerm = useCallback((line: string) => {
    termRef.current?.writeln(line)
    termBufferRef.current.push(line)
  }, [])

  const clearTerminal = useCallback(() => {
    const term = termRef.current
    if (!term) { setActiveTab('terminal'); return }
    term.reset(); term.clear(); term.write('\x1b[2J\x1b[3J\x1b[H')
    termBufferRef.current = []
    setActiveTab('terminal')
    setStatus('Terminal cleared')
    proTermRef.current?.dispose()
    const pro = new ProTerminal(term, {
      getCode: () => codeByLangRef.current[languageRef.current] || '',
      getLanguage: () => languageRef.current,
      runEditorCode: async () => { await runCodeRef.current() },
      pyodide: () => pyodideRef.current,
    })
    pro.start()
    proTermRef.current = pro
  }, [])

  const copyTerminal = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(termBufferRef.current.join('\n') || '(empty)')
      setStatus('Copied')
    } catch { setStatus('Copy failed') }
  }, [])

  const clearCode = useCallback(() => {
    setCode('')
    if (editorRef.current) editorRef.current.setValue('')
    clearPreview()
    setStatus('Erased')
  }, [setCode, clearPreview])

  const pasteCode = useCallback(async () => {
    setActiveTab('editor')
    try {
      const text = await navigator.clipboard?.readText?.()
      if (text) { setCode((p) => (p ? p + '\n' + text : text)); setStatus('Pasted'); return }
    } catch {}
    setPasteText(''); setShowPasteBox(true)
  }, [setCode])

  const runCode = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setStatus('Running…')
    setActiveTab('terminal')
    try {
      if (language === 'html') {
        let html = code
        const inject = "<script>(function(){var o=console.log;console.log=function(){o.apply(console,arguments);parent.postMessage({type:'sb-log',args:Array.from(arguments).map(String)},'*')}})();<\/script>"
        if (html.includes('<head>')) html = html.replace('<head>', '<head>' + inject)
        else html = inject + html
        setPreviewHtml(html)
        setPreviewLang('html')
        setActiveTab('preview')
        writeTerm('HTML → preview')
        setStatus('Preview ready')
      } else if (language === 'python') {
        clearPreview()
        if (!pyodideRef.current) { writeTerm('Python loading…'); setStatus('Wait'); return }
        writeTerm('-- Python --')
        const py = pyodideRef.current
        const pkgMatch = code.match(/^#\s*packages:\s*(.+)$/m)
        if (pkgMatch && py.loadPackage) {
          const pkgs = pkgMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
          writeTerm('packages: ' + pkgs.join(', '))
          try { await py.loadPackage(pkgs) } catch (e: any) { writeTerm(String(e?.message || e)) }
        }
        py.setStdout({ batched: (t) => writeTerm(t) })
        py.setStderr({ batched: (t) => writeTerm(t) })
        try {
          await py.runPythonAsync(code)
          writeTerm('-- done --')
          setStatus('Done')
        } catch (err: unknown) {
          writeTerm(err instanceof Error ? err.message : String(err))
          setStatus('Error')
        }
      } else if (language === 'dart') {
        clearPreview()
        writeTerm('-- Dart --')
        writeTerm('Tip: use Terminal js/python REPL, or Open DartPad from menu')
        setStatus('Done')
      } else {
        clearPreview()
        writeTerm('-- ' + language + ' --')
        const orig = console.log
        console.log = (...a: unknown[]) => {
          writeTerm(a.map((x) => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '))
          orig(...a)
        }
        try {
          // eslint-disable-next-line no-new-func
          new Function(code)()
          writeTerm('-- done --')
          setStatus('Done')
        } catch (err: unknown) {
          writeTerm(err instanceof Error ? err.message : String(err))
          setStatus('Error')
        } finally { console.log = orig }
      }
    } finally {
      setIsRunning(false)
    }
  }, [code, language, isRunning, clearPreview, writeTerm])

  useEffect(() => { runCodeRef.current = runCode }, [runCode])

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'sb-log') setConsoleLogs((p) => [...p.slice(-40), (e.data.args || []).join(' ')])
    }
    window.addEventListener('message', h)
    return () => window.removeEventListener('message', h)
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [runCode])

  const changeSample = (name: string) => {
    const s = SAMPLES[name]
    if (!s) return
    const lang = s.language as Lang
    setCodeByLang((p) => ({ ...p, [lang]: s.code }))
    setLanguage(lang); clearPreview(); setStatus('Sample: ' + name); setActiveTab('editor')
  }

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    setLanguage(t.language as Lang)
    setCodeByLang((p) => ({ ...p, [t.language]: t.code }))
    clearPreview(); setShowTemplates(false); setActiveTab('editor'); setStatus('Template: ' + t.name)
  }

  const frameHtml = previewLang === 'html' && language === 'html' ? previewHtml : ''
  const fontSize = isMobile ? 13 : 14

  if (showIPhone) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-black/95 border-b border-white/10 safe-top">
          <button onClick={() => setShowIPhone(false)} className="h-9 px-4 rounded-full bg-white/15 text-white text-sm">← Back</button>
          <span className="text-[11px] text-white/55">Passcode 000000</span>
          <button onClick={() => { const el = document.getElementById('iphone-frame') as HTMLIFrameElement | null; if (el) el.src = IPHONE_LIVE + '?t=' + Date.now() }} className="h-9 px-3 rounded-full bg-white/15 text-white text-xs">Reboot</button>
        </div>
        <iframe id="iphone-frame" title="iPhone" src={IPHONE_LIVE} className="flex-1 w-full border-0 bg-black" allow="camera; microphone; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
      </div>
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#070b14] text-slate-100 safe-top">
      {showMenu && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setShowMenu(false)}>
          <div className="w-full max-w-md bg-[#0c1220] rounded-t-2xl p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={async () => { try { await navigator.clipboard.writeText(buildShareUrl({ language, code })); setStatus('Link copied') } catch {} setShowMenu(false) }} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">Share link</button>
            <button onClick={() => { const j = exportProjectJson({ language, codeByLang, theme }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([j], { type: 'application/json' })); a.download = 'project.json'; a.click(); setShowMenu(false) }} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">Export</button>
            <button onClick={() => { setShowTemplates(true); setShowMenu(false) }} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">Templates</button>
            {language === 'dart' && <button onClick={() => { window.open('https://dartpad.dev/', '_blank'); setShowMenu(false) }} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm text-emerald-300">Open DartPad</button>}
            <button onClick={() => setShowMenu(false)} className="w-full h-11 rounded-xl bg-slate-700 text-sm">Close</button>
          </div>
        </div>
      )}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-3" onClick={() => setShowTemplates(false)}>
          <div className="w-full max-w-lg max-h-[80dvh] overflow-y-auto bg-[#0c1220] rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Templates</h3>
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => loadTemplate(t.id)} className="w-full text-left p-3 rounded-xl bg-slate-800 border border-slate-700 mb-2">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-[11px] text-slate-500">{t.description}</div>
              </button>
            ))}
            <button onClick={() => setShowTemplates(false)} className="w-full h-11 mt-2 rounded-xl bg-slate-700 text-sm">Close</button>
          </div>
        </div>
      )}
      {showPasteBox && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3">
          <div className="w-full max-w-lg bg-[#0c1220] rounded-2xl p-4">
            <textarea ref={pasteAreaRef} value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="w-full h-36 bg-[#0a0f1a] border border-slate-700 rounded-xl p-3 text-sm font-mono" placeholder="Paste here…" autoFocus />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowPasteBox(false)} className="flex-1 h-11 rounded-xl bg-slate-800 text-sm">Cancel</button>
              <button onClick={() => { setCode((p) => (p ? p + '\n' + pasteText : pasteText)); setShowPasteBox(false); setPasteText('') }} className="flex-1 h-11 rounded-xl bg-emerald-500 text-white text-sm font-semibold">Apply</button>
            </div>
          </div>
        </div>
      )}

      <header className="shrink-0 px-3 pt-2 pb-1.5 flex items-center justify-between border-b border-slate-800 bg-[#0c1220]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center"><span className="text-white font-bold text-sm">CS</span></div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold">Code Sandbox</h1>
            <p className="text-[10px] text-slate-500">{language} · pro terminal{pyodideReady && language === 'python' ? ' · py ready' : ''}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setShowMenu(true)} className="h-9 px-3 rounded-xl bg-slate-800 text-xs">☰</button>
          <button onClick={() => setShowIPhone(true)} className="h-9 px-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30">📱</button>
          <button onClick={() => setTheme((t) => t === 'vs-dark' ? 'light' : 'vs-dark')} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">{theme === 'vs-dark' ? '☀️' : '🌙'}</button>
        </div>
      </header>

      <div className="shrink-0 px-3 py-2 flex gap-2 overflow-x-auto border-b border-slate-800">
        <select className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs" onChange={(e) => changeSample(e.target.value)} defaultValue="">
          <option value="" disabled>Samples</option>
          {Object.keys(SAMPLES).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs" value={language} onChange={(e) => switchLanguage(e.target.value as Lang)}>
          <option value="html">HTML</option>
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="dart">Dart</option>
          <option value="typescript">TypeScript</option>
        </select>
        <button onClick={() => setShowTemplates(true)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs">Templates</button>
      </div>

      <div className="shrink-0 flex border-b border-slate-800 bg-[#0a101c]">
        {(['editor', 'terminal', 'preview'] as const).map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'terminal') setTimeout(() => { try { fitAddonRef.current?.fit() } catch {} }, 50) }}
            className={`flex-1 py-2.5 text-xs font-medium ${activeTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'}`}>
            {tab === 'editor' ? 'Code' : tab === 'terminal' ? 'Terminal' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${activeTab === 'editor' ? 'z-10' : 'invisible'}`}>
          <Editor height="100%" language={language === 'dart' ? 'dart' : language} theme={theme} value={code}
            onChange={(v) => setCode(v || '')} onMount={(ed) => { editorRef.current = ed }}
            options={{ fontSize, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on', padding: { top: 8, bottom: 8 } }} />
        </div>
        <div className={`absolute inset-0 flex flex-col bg-[#0a0f1a] ${activeTab === 'terminal' ? 'z-10' : 'invisible'}`}>
          <div className="px-3 py-1.5 text-xs border-b border-slate-800 flex justify-between bg-[#0c1220]">
            <span className="text-slate-300 font-medium">Terminal · type help</span>
            <div className="flex gap-3">
              <button onClick={copyTerminal} className="text-slate-400">Copy</button>
              <button onClick={clearTerminal} className="text-emerald-400 font-medium">Clear</button>
            </div>
          </div>
          <div ref={termContainerRef} className="flex-1 min-h-0 p-1" />
        </div>
        <div className={`absolute inset-0 flex flex-col ${activeTab === 'preview' ? 'z-10' : 'invisible'}`}>
          <div className="flex-1 min-h-0"><IPhoneFrame html={frameHtml} /></div>
          {consoleLogs.length > 0 && (
            <div className="shrink-0 max-h-20 overflow-y-auto bg-black/80 text-[10px] text-emerald-300 p-2 border-t border-slate-800">
              {consoleLogs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-2 py-2 flex items-center gap-1 border-t border-slate-800 bg-[#0c1220] safe-bottom overflow-x-auto">
        <button onClick={clearCode} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300">Erase</button>
        <button onClick={pasteCode} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300">Paste</button>
        <button onClick={clearTerminal} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300">Clear</button>
        <button onClick={() => setShowIPhone(true)} className="h-10 px-2 rounded-xl bg-slate-700 text-[11px] text-emerald-300">iPhone</button>
        <div className="flex-1 text-center min-w-0"><p className="text-[10px] text-slate-500 truncate">{status}</p></div>
        <button onClick={runCode} disabled={isRunning} className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm disabled:opacity-40">{isRunning ? '…' : 'Run'}</button>
      </div>
    </div>
  )
}
