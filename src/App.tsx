import { useState, useCallback, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { SAMPLES } from './samples'
import { TEMPLATES } from './templates'
import {
  type Lang,
  loadProject,
  saveProject,
  exportProjectJson,
  importProjectJson,
  buildShareUrl,
  decodeShare,
} from './storage'

interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>
  setStdout: (opts: { batched: (text: string) => void }) => void
  setStderr: (opts: { batched: (text: string) => void }) => void
  loadPackage?: (names: string | string[]) => Promise<void>
}

declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<PyodideInterface>
    pyodide?: PyodideInterface
  }
}

const IPHONE_LIVE = 'https://i-phone17-mock.vercel.app/'

const PLACEHOLDER_HTML =
  '<html><body style="display:flex;align-items:center;justify-content:center;height:100%;margin:0;font-family:-apple-system,system-ui;color:#94a3b8;background:#000;text-align:center;padding:24px"><div><p style="font-size:15px">Tap <b style="color:#34d399">Run</b> for HTML preview</p><p style="font-size:12px;opacity:0.7;margin-top:10px">Preview is HTML-only</p></div></body></html>'

const DEFAULT_CODE: Record<Lang, string> = {
  html: SAMPLES['iPhone Home']?.code ?? '<html><body>Hello</body></html>',
  python: SAMPLES.Python?.code ?? 'print("Hello")',
  javascript: SAMPLES.JavaScript?.code ?? 'console.log("Hello")',
  dart: SAMPLES.Dart?.code ?? 'void main() { print("Hello"); }',
  typescript: 'console.log("Hello from TypeScript");\n',
}

const DEFAULT_HTML_FILES = {
  html: '<!DOCTYPE html>\n<html>\n<head>\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1 id="title">Hello</h1>\n  <button id="btn">Tap me</button>\n  <script src="app.js"></script>\n</body>\n</html>',
  css: 'body { font-family: system-ui; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }\nh1 { color: #34d399; }\nbutton { margin-top: 16px; padding: 12px 24px; border: none; border-radius: 12px; background: #10b981; color: white; font-size: 16px; }',
  js: 'document.getElementById("btn").onclick = () => { document.getElementById("title").textContent = "It works!"; console.log("clicked"); };',
}

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
            <iframe title="Preview" srcDoc={html || PLACEHOLDER_HTML} className="iphone-17-screen" sandbox="allow-scripts" />
            <div className="iphone-17-home" />
          </div>
        </div>
      </div>
    </div>
  )
}

function monacoLang(lang: Lang): string {
  if (lang === 'dart') return 'dart'
  return lang
}

function combineHtmlFiles(files: { html: string; css: string; js: string }) {
  let html = files.html
  if (files.css.trim()) {
    if (/href=["']style\.css["']/.test(html)) {
      html = html.replace(/<link[^>]*href=["']style\.css["'][^>]*>/i, '<style>' + files.css + '</style>')
    } else if (html.includes('</head>')) {
      html = html.replace('</head>', '<style>' + files.css + '</style></head>')
    } else {
      html = '<style>' + files.css + '</style>' + html
    }
  }
  if (files.js.trim()) {
    if (/src=["']app\.js["']/.test(html)) {
      html = html.replace(/<script[^>]*src=["']app\.js["'][^>]*><\/script>/i, '<script>' + files.js + '</script>')
    } else if (html.includes('</body>')) {
      html = html.replace('</body>', '<script>' + files.js + '</script></body>')
    } else {
      html = html + '<script>' + files.js + '</script>'
    }
  }
  return html
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

  const [htmlFiles, setHtmlFiles] = useState(() => saved?.htmlFiles ?? DEFAULT_HTML_FILES)
  const [activeHtmlFile, setActiveHtmlFile] = useState<'html' | 'css' | 'js'>(() => saved?.activeHtmlFile ?? 'html')
  const [multiFile, setMultiFile] = useState(false)

  const setCode = useCallback((v: string | ((prev: string) => string)) => {
    setCodeByLang((prev) => {
      const cur = prev[language]
      const next = typeof v === 'function' ? v(cur) : v
      return { ...prev, [language]: next }
    })
  }, [language])

  const systemDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const [theme, setTheme] = useState<'vs-dark' | 'light'>(() => saved?.theme ?? (systemDark ? 'vs-dark' : 'light'))
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
  const [lastRunCode, setLastRunCode] = useState('')
  const [consoleLogs, setConsoleLogs] = useState<string[]>([])

  const termRef = useRef<Terminal | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const pyodideRef = useRef<PyodideInterface | null>(null)
  const editorRef = useRef<any>(null)
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null)
  const termBufferRef = useRef<string[]>([])

  useEffect(() => {
    const t = setTimeout(() => {
      saveProject({ language, codeByLang, htmlFiles, activeHtmlFile, theme })
    }, 600)
    return () => clearTimeout(t)
  }, [language, codeByLang, htmlFiles, activeHtmlFile, theme])

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
      convertEol: true, scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(el)
    fitAddon.fit()
    term.writeln('Code Sandbox ready · auto-save on')
    term.writeln('')
    termRef.current = term
    fitAddonRef.current = fitAddon
    const onResize = () => { try { fitAddon.fit() } catch {} }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
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
    setLanguage(next)
    clearPreview()
    setActiveTab('editor')
    setStatus('Switched to ' + next)
    setMultiFile(false)
  }, [clearPreview])

  const writeTerm = useCallback((line: string) => {
    termRef.current?.writeln(line)
    termBufferRef.current.push(line)
    if (termBufferRef.current.length > 2000) termBufferRef.current = termBufferRef.current.slice(-1000)
  }, [])

  const clearTerminal = useCallback(() => {
    const term = termRef.current
    if (!term) { setActiveTab('terminal'); return }
    term.reset(); term.clear(); term.write('\x1b[2J\x1b[3J\x1b[H')
    term.writeln('Terminal cleared'); term.writeln('')
    termBufferRef.current = []
    setActiveTab('terminal'); setStatus('Terminal cleared')
    try { fitAddonRef.current?.fit() } catch {}
  }, [])

  const copyTerminal = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(termBufferRef.current.join('\n') || '(empty)')
      setStatus('Terminal copied')
    } catch { setStatus('Copy failed') }
  }, [])

  const clearCode = useCallback(() => {
    setCode('')
    if (editorRef.current) editorRef.current.setValue('')
    clearPreview()
    setStatus('Code erased')
    setActiveTab('editor')
  }, [setCode, clearPreview])

  const pasteCode = useCallback(async () => {
    setActiveTab('editor')
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          const ed = editorRef.current
          if (ed) {
            ed.executeEdits('paste', [{ identifier: { major: 1, minor: 1 }, range: ed.getSelection(), text, forceMoveMarkers: true }])
            setCode(ed.getValue())
          } else setCode((prev) => (prev ? prev + '\n' + text : text))
          setStatus('Pasted')
          return
        }
      }
    } catch {}
    setPasteText(''); setShowPasteBox(true)
    setTimeout(() => pasteAreaRef.current?.focus(), 100)
  }, [setCode])

  const applyPasteBox = useCallback(() => {
    if (!pasteText) { setShowPasteBox(false); return }
    const ed = editorRef.current
    if (ed) {
      ed.executeEdits('paste', [{ identifier: { major: 1, minor: 1 }, range: ed.getSelection(), text: pasteText, forceMoveMarkers: true }])
      setCode(ed.getValue())
    } else setCode((prev) => (prev ? prev + '\n' + pasteText : pasteText))
    setShowPasteBox(false); setPasteText(''); setStatus('Pasted')
  }, [pasteText, setCode])

  const markError = useCallback((msg: string) => {
    const ed = editorRef.current
    const monaco = (window as any).monaco
    if (!ed || !monaco) return
    const m = msg.match(/line\s+(\d+)/i) || msg.match(/:(\d+):/)
    const line = m ? Math.max(1, parseInt(m[1], 10)) : 1
    monaco.editor.setModelMarkers(ed.getModel(), 'sandbox', [{
      startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 200,
      message: msg.slice(0, 200), severity: monaco.MarkerSeverity.Error,
    }])
  }, [])

  const clearMarkers = useCallback(() => {
    const ed = editorRef.current
    const monaco = (window as any).monaco
    if (ed && monaco) monaco.editor.setModelMarkers(ed.getModel(), 'sandbox', [])
  }, [])

  const runDart = async (src: string) => {
    writeTerm('-- Dart --')
    try {
      const res = await fetch('https://stable.api.dartpad.dev/api/v3/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: src }),
      })
      if (res.ok) {
        const data = await res.json()
        const issues = data?.issues || []
        if (issues.length) issues.forEach((iss: any) => writeTerm('[' + (iss.kind || 'info') + '] ' + iss.message))
        else writeTerm('Analyze: no issues')
      }
    } catch { writeTerm('(Dart analyze offline)') }
    if (src.includes('print(')) {
      writeTerm('Simulated output:')
      if (src.includes('Hello from Dart')) writeTerm('Hello from Dart!')
      if (src.includes('2 + 2')) writeTerm('2 + 2 = 4')
      if (src.includes('Squares')) writeTerm('Squares: [1, 4, 9, 16, 25]')
      if (src.includes('greet')) writeTerm('Hi, Developer!')
    }
    writeTerm('-- done --')
  }

  const runCode = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setStatus('Running…')
    clearMarkers()
    setLastRunCode(code)
    try {
      if (language === 'html') {
        let html = multiFile ? combineHtmlFiles(htmlFiles) : code
        const inject = "<script>(function(){var o=console.log,e=console.error;console.log=function(){o.apply(console,arguments);parent.postMessage({type:'sb-log',args:Array.from(arguments).map(String)},'*')};console.error=function(){e.apply(console,arguments);parent.postMessage({type:'sb-log',args:Array.from(arguments).map(String)},'*')};})();<\/script>"
        if (html.includes('<head>')) html = html.replace('<head>', '<head>' + inject)
        else html = inject + html
        setPreviewHtml(html)
        setPreviewLang('html')
        setActiveTab('preview')
        writeTerm('HTML → iPhone preview')
        setStatus('Preview ready')
      } else if (language === 'dart') {
        clearPreview(); setActiveTab('terminal'); await runDart(code); setStatus('Done')
      } else if (language === 'python') {
        clearPreview(); setActiveTab('terminal')
        if (!pyodideRef.current) { writeTerm('Python still loading…'); setStatus('Wait for Python'); return }
        writeTerm('-- Python --')
        const py = pyodideRef.current
        const pkgMatch = code.match(/^#\s*packages:\s*(.+)$/m)
        if (pkgMatch && py.loadPackage) {
          const pkgs = pkgMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
          writeTerm('Loading packages: ' + pkgs.join(', '))
          try { await py.loadPackage(pkgs) } catch (err: any) { writeTerm('Package error: ' + (err?.message || err)) }
        }
        py.setStdout({ batched: (t) => writeTerm(t) })
        py.setStderr({ batched: (t) => writeTerm(t) })
        try {
          await py.runPythonAsync(code)
          writeTerm('-- done --'); setStatus('Done')
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          writeTerm(msg); markError(msg); setStatus('Error')
        }
      } else {
        clearPreview(); setActiveTab('terminal')
        writeTerm(language === 'typescript' ? '-- TypeScript --' : '-- JavaScript --')
        const origLog = console.log
        console.log = (...a: unknown[]) => {
          writeTerm(a.map((x) => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '))
          origLog(...a)
        }
        try {
          // eslint-disable-next-line no-new-func
          new Function(code)()
          writeTerm('-- done --'); setStatus('Done')
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          writeTerm(msg); markError(msg); setStatus('Error')
        } finally { console.log = origLog }
      }
    } finally { setIsRunning(false) }
  }, [code, language, isRunning, multiFile, htmlFiles, clearPreview, writeTerm, clearMarkers, markError])

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'sb-log') setConsoleLogs((prev) => [...prev.slice(-50), (e.data.args || []).join(' ')])
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
    setCodeByLang((prev) => ({ ...prev, [lang]: s.code }))
    setLanguage(lang); clearPreview(); setMultiFile(false)
    setStatus('Sample: ' + name); setActiveTab('editor')
  }

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    if (t.files) {
      setHtmlFiles(t.files); setMultiFile(true); setLanguage('html')
      setCodeByLang((prev) => ({ ...prev, html: t.files!.html }))
    } else {
      setLanguage(t.language as Lang)
      setCodeByLang((prev) => ({ ...prev, [t.language]: t.code }))
      setMultiFile(false)
    }
    clearPreview(); setShowTemplates(false); setActiveTab('editor')
    setStatus('Template: ' + t.name)
  }

  const doShare = async () => {
    const url = buildShareUrl({ language, code })
    try { await navigator.clipboard.writeText(url); setStatus('Share link copied') }
    catch { prompt('Copy share link:', url) }
    setShowMenu(false)
  }

  const doExport = () => {
    const json = exportProjectJson({ language, codeByLang, htmlFiles, activeHtmlFile, theme })
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'sandbox-project.json'
    a.click()
    setStatus('Exported'); setShowMenu(false)
  }

  const doImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const data = importProjectJson(await file.text())
      if (!data) { setStatus('Invalid project file'); return }
      setCodeByLang({ ...DEFAULT_CODE, ...data.codeByLang })
      setLanguage(data.language)
      if (data.htmlFiles) setHtmlFiles(data.htmlFiles)
      if (data.theme) setTheme(data.theme)
      clearPreview(); setStatus('Imported project')
    }
    input.click(); setShowMenu(false)
  }

  const editorValue = language === 'html' && multiFile ? htmlFiles[activeHtmlFile] : code
  const onEditorChange = (v: string | undefined) => {
    const val = v || ''
    if (language === 'html' && multiFile) setHtmlFiles((prev) => ({ ...prev, [activeHtmlFile]: val }))
    else setCode(val)
  }
  const frameHtml = previewLang === 'html' && language === 'html' ? previewHtml : ''
  const fontSize = isMobile ? 13 : 14

  if (showIPhone) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-black/95 border-b border-white/10 safe-top">
          <button onClick={() => setShowIPhone(false)} className="h-9 px-4 rounded-full bg-white/15 text-white text-sm font-medium">← Back</button>
          <span className="text-[11px] text-white/55 flex-1 text-center truncate">Passcode 000000</span>
          <button onClick={() => { const el = document.getElementById('iphone-frame') as HTMLIFrameElement | null; if (el) el.src = IPHONE_LIVE + '?t=' + Date.now() }} className="h-9 px-3 rounded-full bg-white/15 text-white text-xs">Reboot</button>
        </div>
        <iframe id="iphone-frame" title="iPhone 17" src={IPHONE_LIVE} className="flex-1 w-full border-0 bg-black" allow="camera; microphone; fullscreen; autoplay" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
      </div>
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#070b14] text-slate-100 safe-top">
      {showMenu && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowMenu(false)}>
          <div className="w-full max-w-md bg-[#0c1220] rounded-t-2xl sm:rounded-2xl p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-slate-500 mb-2">Project</p>
            <button onClick={doShare} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">Share link</button>
            <button onClick={doExport} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">Export JSON</button>
            <button onClick={doImport} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">Import JSON</button>
            <button onClick={() => { setShowTemplates(true); setShowMenu(false) }} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">Templates</button>
            {language === 'dart' && <button onClick={() => { window.open('https://dartpad.dev/', '_blank'); setShowMenu(false) }} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm text-emerald-300">Open DartPad</button>}
            {language === 'html' && <button onClick={() => { setMultiFile((m) => !m); setShowMenu(false) }} className="w-full h-11 rounded-xl bg-slate-800 text-left px-4 text-sm">{multiFile ? 'Single-file HTML' : 'Multi-file HTML/CSS/JS'}</button>}
            <button onClick={() => setShowMenu(false)} className="w-full h-11 rounded-xl bg-slate-700 text-sm mt-2">Close</button>
          </div>
        </div>
      )}
      {showTemplates && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => setShowTemplates(false)}>
          <div className="w-full max-w-lg max-h-[80dvh] overflow-y-auto bg-[#0c1220] rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Templates</h3>
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => loadTemplate(t.id)} className="w-full text-left p-3 rounded-xl bg-slate-800/80 border border-slate-700 mb-2">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-[11px] text-slate-500">{t.description} · {t.language}</div>
              </button>
            ))}
            <button onClick={() => setShowTemplates(false)} className="w-full h-11 mt-2 rounded-xl bg-slate-700 text-sm">Close</button>
          </div>
        </div>
      )}
      {showPasteBox && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-lg bg-[#0c1220] border border-slate-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold mb-2">Paste code</h3>
            <textarea ref={pasteAreaRef} value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="w-full h-40 bg-[#0a0f1a] border border-slate-700 rounded-xl p-3 text-sm font-mono" autoFocus />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowPasteBox(false)} className="flex-1 h-11 rounded-xl bg-slate-800 text-sm">Cancel</button>
              <button onClick={applyPasteBox} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-semibold">Apply</button>
            </div>
          </div>
        </div>
      )}

      <header className="shrink-0 px-3 pt-2 pb-1.5 flex items-center justify-between border-b border-slate-800 bg-[#0c1220]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shrink-0"><span className="text-white font-bold text-sm">CS</span></div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold truncate">Code Sandbox</h1>
            <p className="text-[10px] text-slate-500">{language}{pyodideReady && language === 'python' ? ' · ready' : ''} · auto-save</p>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
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
          <option value="dart">Dart</option>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
        </select>
        <button onClick={() => setShowTemplates(true)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs shrink-0">Templates</button>
      </div>

      {language === 'html' && multiFile && (
        <div className="shrink-0 flex border-b border-slate-800 bg-[#0a101c]">
          {(['html', 'css', 'js'] as const).map((f) => (
            <button key={f} onClick={() => setActiveHtmlFile(f)} className={`flex-1 py-2 text-xs font-medium ${activeHtmlFile === f ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'}`}>{f.toUpperCase()}</button>
          ))}
        </div>
      )}

      <div className="shrink-0 flex border-b border-slate-800 bg-[#0a101c]">
        {(['editor', 'terminal', 'preview'] as const).map((tab) => (
          <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'terminal') setTimeout(() => { try { fitAddonRef.current?.fit() } catch {} }, 50) }} className={`flex-1 py-2.5 text-xs font-medium ${activeTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500'}`}>
            {tab === 'editor' ? 'Code' : tab === 'terminal' ? 'Terminal' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${activeTab === 'editor' ? 'z-10' : 'invisible'}`}>
          <Editor height="100%" language={language === 'html' && multiFile ? (activeHtmlFile === 'js' ? 'javascript' : activeHtmlFile === 'css' ? 'css' : 'html') : monacoLang(language)} theme={theme} value={editorValue} onChange={onEditorChange} onMount={(editor, monaco) => { editorRef.current = editor; (window as any).monaco = monaco }} options={{ fontSize, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on', lineNumbers: 'on', lineNumbersMinChars: 3, folding: false, padding: { top: 8, bottom: 8 } }} />
        </div>
        <div className={`absolute inset-0 flex flex-col bg-[#0a0f1a] ${activeTab === 'terminal' ? 'z-10' : 'invisible'}`}>
          <div className="px-3 py-1.5 text-xs border-b border-slate-800 flex justify-between bg-[#0c1220]">
            <span className="text-slate-300 font-medium">Terminal</span>
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
            <div className="shrink-0 max-h-24 overflow-y-auto bg-black/80 text-[10px] text-emerald-300 p-2 border-t border-slate-800">
              {consoleLogs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-2 py-2 flex items-center gap-1 border-t border-slate-800 bg-[#0c1220] safe-bottom overflow-x-auto">
        <button onClick={clearCode} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300 shrink-0">Erase</button>
        <button onClick={pasteCode} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300 shrink-0">Paste</button>
        <button onClick={clearTerminal} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300 shrink-0">Clear</button>
        <button onClick={copyTerminal} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300 shrink-0">Copy</button>
        <button onClick={() => lastRunCode && runCode()} className="h-10 px-2 rounded-xl bg-slate-800 text-[11px] text-slate-300 shrink-0">Again</button>
        <button onClick={() => setShowIPhone(true)} className="h-10 px-2 rounded-xl bg-slate-700 text-[11px] text-emerald-300 shrink-0">iPhone</button>
        <div className="flex-1 min-w-[40px] text-center"><p className="text-[10px] text-slate-500 truncate">{status}</p></div>
        <button onClick={runCode} disabled={isRunning} className="h-10 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm disabled:opacity-40 shrink-0">{isRunning ? '…' : 'Run'}</button>
      </div>
    </div>
  )
}
