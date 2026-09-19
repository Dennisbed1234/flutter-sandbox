import { useState, useCallback, useRef, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

const API_BASE = 'https://stable.api.dartpad.dev/api/v3'

const DEFAULT_CODE = `import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Sandbox',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const MyHomePage(title: 'Flutter Sandbox'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  int _counter = 0;

  void _incrementCounter() {
    setState(() {
      _counter++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            const Text(
              'You have pushed the button this many times:',
            ),
            Text(
              '$_counter',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _incrementCounter,
        tooltip: 'Increment',
        child: const Icon(Icons.add),
      ),
    );
  }
}
`

const SAMPLES: Record<string, string> = {
  'Counter App': DEFAULT_CODE,
  'Hello World': `import 'package:flutter/material.dart';

void main() {
  runApp(
    const MaterialApp(
      home: Scaffold(
        body: Center(
          child: Text(
            'Hello, Flutter Sandbox!',
            style: TextStyle(fontSize: 24),
          ),
        ),
      ),
    ),
  );
}
`,
  'Material 3 Buttons': `import 'package:flutter/material.dart';

void main() {
  runApp(const MaterialApp(
    home: Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            FilledButton(onPressed: null, child: Text('Filled')),
            SizedBox(height: 12),
            OutlinedButton(onPressed: null, child: Text('Outlined')),
            SizedBox(height: 12),
            TextButton(onPressed: null, child: Text('Text')),
          ],
        ),
      ),
    ),
  ));
}
`,
}

interface AnalysisIssue {
  kind: string
  message: string
  location?: {
    startLine?: number
    startColumn?: number
    endLine?: number
    endColumn?: number
  }
  sourceName?: string
}

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark')
  const [status, setStatus] = useState('Ready')
  const [issues, setIssues] = useState<AnalysisIssue[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const analyzeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onMount: OnMount = (ed) => {
    editorRef.current = ed
  }

  const analyze = useCallback(async (source: string) => {
    setIsAnalyzing(true)
    setStatus('Analyzing…')
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const data = await res.json()
      const list: AnalysisIssue[] = data.issues || []
      setIssues(list)

      if (editorRef.current) {
        const model = editorRef.current.getModel()
        if (model) {
          const markers = list.map((issue) => ({
            severity:
              issue.kind === 'error'
                ? 8
                : issue.kind === 'warning'
                ? 4
                : 2,
            message: issue.message,
            startLineNumber: issue.location?.startLine || 1,
            startColumn: issue.location?.startColumn || 1,
            endLineNumber: issue.location?.endLine || issue.location?.startLine || 1,
            endColumn: issue.location?.endColumn || 100,
          }))
          // @ts-ignore
          window.monaco?.editor.setModelMarkers(model, 'dartpad', markers)
        }
      }

      const errors = list.filter((i) => i.kind === 'error').length
      const warnings = list.filter((i) => i.kind === 'warning').length
      setStatus(
        errors || warnings
          ? `${errors} error(s), ${warnings} warning(s)`
          : 'No issues'
      )
    } catch (e) {
      setStatus('Analysis failed (network)')
      console.error(e)
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const formatCode = useCallback(async () => {
    setStatus('Formatting…')
    try {
      const res = await fetch(`${API_BASE}/format`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: code }),
      })
      const data = await res.json()
      if (data.source) {
        setCode(data.source)
        setStatus('Formatted')
      } else {
        setStatus('Format failed')
      }
    } catch (e) {
      setStatus('Format error')
    }
  }, [code])

  const runInDartPad = useCallback(() => {
    const win = window.open('https://dartpad.dev/?null_safety=true', '_blank')
    if (win) {
      navigator.clipboard.writeText(code).then(() => {
        setStatus('Code copied! Paste into the new DartPad tab then click Run')
      }).catch(() => {
        setStatus('Opened DartPad – paste your code and Run')
      })
    } else {
      setStatus('Popup blocked – allow popups or copy code manually')
    }
  }, [code])

  useEffect(() => {
    if (analyzeTimeout.current) clearTimeout(analyzeTimeout.current)
    analyzeTimeout.current = setTimeout(() => analyze(code), 800)
    return () => {
      if (analyzeTimeout.current) clearTimeout(analyzeTimeout.current)
    }
  }, [code, analyze])

  // Responsive font size for Monaco
  const getEditorFontSize = () => {
    if (typeof window === 'undefined') return 14
    const w = window.innerWidth
    if (w < 640) return 12      // iPhone
    if (w < 1024) return 13     // iPad
    return 14                   // Laptop+
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-gray-950 text-gray-100 safe-top safe-bottom safe-left safe-right">
      {/* ========== HEADER ========== */}
      <header className="shrink-0 border-b border-gray-800 bg-gray-900">
        {/* Top row: Logo + Title */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold text-white text-xs sm:text-sm shrink-0">
              F
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate">Flutter Sandbox</h1>
              <p className="text-[10px] sm:text-xs text-gray-400 hidden xs:block sm:block">Online Flutter Playground</p>
            </div>
          </div>

          {/* Desktop / iPad controls (hidden on pure mobile) */}
          <div className="hidden md:flex items-center gap-2">
            <select
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm max-w-[140px]"
              onChange={(e) => {
                const sample = SAMPLES[e.target.value]
                if (sample) setCode(sample)
              }}
              defaultValue="Counter App"
            >
              {Object.keys(SAMPLES).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <button
              onClick={formatCode}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm border border-gray-700"
            >
              Format
            </button>

            <button
              onClick={() => setTheme((t) => (t === 'vs-dark' ? 'light' : 'vs-dark'))}
              className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm border border-gray-700"
            >
              {theme === 'vs-dark' ? '☀️' : '🌙'}
            </button>

            <button
              onClick={runInDartPad}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium"
            >
              ▶ Run
            </button>

            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
            >
              {showPreview ? 'Hide' : 'Preview'}
            </button>
          </div>
        </div>

        {/* Mobile controls row (visible only on < md) */}
        <div className="md:hidden flex items-center gap-1.5 px-3 pb-2 overflow-x-auto overflow-touch">
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs shrink-0"
            onChange={(e) => {
              const sample = SAMPLES[e.target.value]
              if (sample) setCode(sample)
            }}
            defaultValue="Counter App"
          >
            {Object.keys(SAMPLES).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <button
            onClick={formatCode}
            className="px-2.5 py-1.5 rounded bg-gray-800 active:bg-gray-700 text-xs border border-gray-700 shrink-0"
          >
            Format
          </button>

          <button
            onClick={() => setTheme((t) => (t === 'vs-dark' ? 'light' : 'vs-dark'))}
            className="px-2.5 py-1.5 rounded bg-gray-800 active:bg-gray-700 text-xs border border-gray-700 shrink-0"
          >
            {theme === 'vs-dark' ? '☀️' : '🌙'}
          </button>

          <button
            onClick={runInDartPad}
            className="px-3 py-1.5 rounded bg-blue-600 active:bg-blue-500 text-xs font-medium shrink-0"
          >
            ▶ Run
          </button>

          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-2.5 py-1.5 rounded bg-emerald-600 active:bg-emerald-500 text-xs font-medium shrink-0"
          >
            {showPreview ? 'Hide' : 'Preview'}
          </button>
        </div>
      </header>

      {/* ========== MAIN CONTENT ========== */}
      {/*
        Mobile / iPad portrait (< lg): stack vertically
        Laptop / iPad landscape (≥ lg): side-by-side when preview is open
      */}
      <div
        className={`flex-1 flex overflow-hidden ${
          showPreview
            ? 'flex-col lg:flex-row'
            : 'flex-col'
        }`}
      >
        {/* Editor panel */}
        <div
          className={`flex flex-col border-gray-800 ${
            showPreview
              ? 'h-1/2 lg:h-full lg:w-1/2 border-b lg:border-b-0 lg:border-r'
              : 'h-full w-full'
          }`}
        >
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              defaultLanguage="dart"
              theme={theme}
              value={code}
              onChange={(v) => setCode(v || '')}
              onMount={onMount}
              options={{
                fontSize: getEditorFontSize(),
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                // Better mobile experience
                lineNumbers: window.innerWidth < 640 ? 'off' : 'on',
                glyphMargin: window.innerWidth >= 640,
                folding: window.innerWidth >= 640,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>

          {/* Status bar */}
          <div className="h-7 sm:h-8 px-2 sm:px-3 flex items-center justify-between text-[10px] sm:text-xs bg-gray-900 border-t border-gray-800 text-gray-400 shrink-0">
            <span className="truncate">{isAnalyzing ? 'Analyzing…' : status}</span>
            <span className="shrink-0 ml-2">{issues.length} issue(s)</span>
          </div>
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div
            className={`flex flex-col bg-gray-900 ${
              showPreview
                ? 'h-1/2 lg:h-full lg:w-1/2'
                : ''
            }`}
          >
            <div className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b border-gray-800 flex justify-between items-center shrink-0">
              <span className="truncate">Live Preview</span>
              <a
                href="https://dartpad.dev"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline text-[10px] sm:text-xs shrink-0 ml-2"
              >
                Full DartPad ↗
              </a>
            </div>
            <iframe
              title="DartPad Flutter"
              src="https://dartpad.dev/embed-flutter.html?theme=dark&run=true&split=60"
              className="flex-1 w-full border-0 min-h-0"
              allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi"
            />
            <div className="p-1.5 sm:p-2 text-[10px] sm:text-xs text-gray-500 border-t border-gray-800 shrink-0">
              Tip: Tap <strong>Run</strong> to copy code, then paste into the preview.
            </div>
          </div>
        )}
      </div>

      {/* ========== ISSUES PANEL ========== */}
      {issues.length > 0 && (
        <div className="max-h-24 sm:max-h-32 overflow-y-auto overflow-touch border-t border-gray-800 bg-gray-900 text-[10px] sm:text-xs shrink-0">
          {issues.map((issue, i) => (
            <div
              key={i}
              className={`px-2 sm:px-3 py-1 border-b border-gray-800 flex gap-2 ${
                issue.kind === 'error' ? 'text-red-400' : 'text-yellow-400'
              }`}
            >
              <span className="font-mono w-12 sm:w-16 shrink-0">
                L{issue.location?.startLine || '?'}
              </span>
              <span className="break-words">{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
