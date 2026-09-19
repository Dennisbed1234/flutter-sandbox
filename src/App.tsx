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

      // Set Monaco markers
      if (editorRef.current) {
        const model = editorRef.current.getModel()
        if (model) {
          const markers = list.map((issue) => ({
            severity:
              issue.kind === 'error'
                ? 8 // MarkerSeverity.Error
                : issue.kind === 'warning'
                ? 4 // Warning
                : 2, // Info
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
    // Create a temporary gist-like share via DartPad's null-safety / embed approach
    // Best reliable way: open official DartPad with the code injected via a data URL approach
    // or simply open dartpad.dev and let user paste (but we can do better).

    // Official recommended: open embed-flutter with a gist, but for arbitrary code we open
    // a new window to dartpad.dev and instruct, or use the new compile path.
    // Practical solution used by many tools: open https://dartpad.dev with query or postMessage.

    const win = window.open('https://dartpad.dev/?null_safety=true', '_blank')
    if (win) {
      // User can paste, but we also offer copy
      navigator.clipboard.writeText(code).then(() => {
        setStatus('Code copied! Paste into the new DartPad tab (Ctrl/Cmd+V) then click Run')
      }).catch(() => {
        setStatus('Opened DartPad – paste your code and Run')
      })
    } else {
      setStatus('Popup blocked – allow popups or copy code manually')
    }
  }, [code])

  // Better Run: use a dedicated preview that embeds DartPad with the current code via a clever trick.
  // Since direct code injection is limited, we provide a full-screen iframe option + copy.
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (analyzeTimeout.current) clearTimeout(analyzeTimeout.current)
    analyzeTimeout.current = setTimeout(() => analyze(code), 800)
    return () => {
      if (analyzeTimeout.current) clearTimeout(analyzeTimeout.current)
    }
  }, [code, analyze])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold text-white text-sm">
            F
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Flutter Sandbox</h1>
            <p className="text-xs text-gray-400">Online Flutter Playground</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
            onChange={(e) => {
              const sample = SAMPLES[e.target.value]
              if (sample) setCode(sample)
            }}
            defaultValue="Counter App"
          >
            {Object.keys(SAMPLES).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
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
            {theme === 'vs-dark' ? '☀️ Light' : '🌙 Dark'}
          </button>

          <button
            onClick={runInDartPad}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium"
          >
            ▶ Run in DartPad
          </button>

          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
          >
            {showPreview ? 'Hide Preview' : 'Live Preview'}
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className={`${showPreview ? 'w-1/2' : 'w-full'} flex flex-col border-r border-gray-800`}>
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="dart"
              theme={theme}
              value={code}
              onChange={(v) => setCode(v || '')}
              onMount={onMount}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
              }}
            />
          </div>

          {/* Status bar */}
          <div className="h-8 px-3 flex items-center justify-between text-xs bg-gray-900 border-t border-gray-800 text-gray-400">
            <span>{isAnalyzing ? 'Analyzing…' : status}</span>
            <span>{issues.length} issue(s)</span>
          </div>
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-1/2 flex flex-col bg-gray-900">
            <div className="px-3 py-2 text-sm border-b border-gray-800 flex justify-between items-center">
              <span>Live Flutter Preview (powered by DartPad)</span>
              <a
                href="https://dartpad.dev"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline text-xs"
              >
                Open full DartPad ↗
              </a>
            </div>
            <iframe
              title="DartPad Flutter"
              src="https://dartpad.dev/embed-flutter.html?theme=dark&run=true&split=60"
              className="flex-1 w-full border-0"
              allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi"
            />
            <div className="p-2 text-xs text-gray-500 border-t border-gray-800">
              Tip: Click <strong>Run in DartPad</strong> to copy your current code, then paste it into the preview or the new tab.
            </div>
          </div>
        )}
      </div>

      {/* Issues panel (bottom) */}
      {issues.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-t border-gray-800 bg-gray-900 text-xs">
          {issues.map((issue, i) => (
            <div
              key={i}
              className={`px-3 py-1 border-b border-gray-800 flex gap-2 ${
                issue.kind === 'error' ? 'text-red-400' : 'text-yellow-400'
              }`}
            >
              <span className="font-mono w-16 shrink-0">
                L{issue.location?.startLine || '?'}
              </span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
