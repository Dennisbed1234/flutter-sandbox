/**
 * Professional interactive terminal for Code Sandbox
 * Shell commands + Python/JS REPL + history + real-time execution
 */
import type { Terminal } from '@xterm/xterm'

export type TermLang = 'python' | 'javascript' | 'typescript' | 'html' | 'dart'

export type ProTermDeps = {
  getCode: () => string
  getLanguage: () => TermLang
  runEditorCode: () => Promise<void>
  pyodide: () => {
    runPythonAsync: (c: string) => Promise<unknown>
    setStdout: (o: { batched: (t: string) => void }) => void
    setStderr: (o: { batched: (t: string) => void }) => void
    loadPackage?: (n: string | string[]) => Promise<void>
  } | null
}

type Mode = 'shell' | 'python' | 'javascript'

const PROMPT_SHELL = '\x1b[32m$\x1b[0m '
const PROMPT_PY = '\x1b[36m>>>\x1b[0m '
const PROMPT_JS = '\x1b[33m>\x1b[0m '

export class ProTerminal {
  private term: Terminal
  private deps: ProTermDeps
  private mode: Mode = 'shell'
  private line = ''
  private history: string[] = []
  private histIdx = -1
  private histDraft = ''
  private busy = false
  private pyBuffer: string[] = []
  private jsContext: Record<string, unknown> = {}
  private disposed = false
  private dataDisp: { dispose: () => void } | null = null

  constructor(term: Terminal, deps: ProTermDeps) {
    this.term = term
    this.deps = deps
  }

  start() {
    this.banner()
    this.dataDisp = this.term.onData((data) => this.onData(data))
    this.prompt()
  }

  dispose() {
    this.disposed = true
    this.dataDisp?.dispose()
  }

  writeln(msg: string) {
    this.term.writeln(msg)
  }

  write(msg: string) {
    this.term.write(msg)
  }

  private banner() {
    const t = this.term
    t.writeln('\x1b[1;36m╔══════════════════════════════════════════╗\x1b[0m')
    t.writeln('\x1b[1;36m║\x1b[0m  \x1b[1mCode Sandbox Terminal\x1b[0m  · professional  \x1b[1;36m║\x1b[0m')
    t.writeln('\x1b[1;36m╚══════════════════════════════════════════╝\x1b[0m')
    t.writeln('')
    t.writeln('  Type \x1b[1mhelp\x1b[0m for commands · \x1b[1mrun\x1b[0m executes editor code')
    t.writeln('  \x1b[1mpython\x1b[0m / \x1b[1mjs\x1b[0m enter interactive REPL')
    t.writeln('')
  }

  private prompt() {
    if (this.disposed) return
    if (this.mode === 'python') this.term.write(PROMPT_PY)
    else if (this.mode === 'javascript') this.term.write(PROMPT_JS)
    else this.term.write(PROMPT_SHELL)
  }

  private onData(data: string) {
    if (this.busy) return
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]
      const code = data.charCodeAt(i)

      if (ch === '\r' || ch === '\n') {
        this.term.writeln('')
        const cmd = this.line
        this.line = ''
        if (cmd.trim()) {
          this.history.push(cmd)
          if (this.history.length > 200) this.history.shift()
        }
        this.histIdx = -1
        this.histDraft = ''
        void this.execute(cmd)
        return
      }

      if (ch === '\x7f' || ch === '\b') {
        if (this.line.length > 0) {
          this.line = this.line.slice(0, -1)
          this.term.write('\b \b')
        }
        continue
      }

      if (code === 3) {
        this.term.writeln('^C')
        this.line = ''
        this.pyBuffer = []
        this.busy = false
        this.prompt()
        continue
      }

      if (code === 12) {
        this.term.clear()
        this.line = ''
        this.prompt()
        continue
      }

      if (ch === '\x1b') {
        const seq = data.slice(i)
        if (seq.startsWith('\x1b[A')) {
          this.historyUp()
          i += 2
          continue
        }
        if (seq.startsWith('\x1b[B')) {
          this.historyDown()
          i += 2
          continue
        }
        if (seq.startsWith('\x1b[C') || seq.startsWith('\x1b[D')) {
          i += 2
          continue
        }
        continue
      }

      if (code >= 32 && code !== 127) {
        this.line += ch
        this.term.write(ch)
      }
    }
  }

  private clearLineVisual() {
    const n = this.line.length
    if (n > 0) this.term.write('\b \b'.repeat(n))
  }

  private historyUp() {
    if (!this.history.length) return
    if (this.histIdx === -1) {
      this.histDraft = this.line
      this.histIdx = this.history.length - 1
    } else if (this.histIdx > 0) {
      this.histIdx--
    }
    this.clearLineVisual()
    this.line = this.history[this.histIdx] || ''
    this.term.write(this.line)
  }

  private historyDown() {
    if (this.histIdx === -1) return
    if (this.histIdx < this.history.length - 1) {
      this.histIdx++
      this.clearLineVisual()
      this.line = this.history[this.histIdx] || ''
      this.term.write(this.line)
    } else {
      this.histIdx = -1
      this.clearLineVisual()
      this.line = this.histDraft
      this.term.write(this.line)
    }
  }

  private async execute(raw: string) {
    const cmd = raw.trim()
    if (!cmd) {
      this.prompt()
      return
    }

    if (this.mode === 'python') {
      await this.execPythonLine(cmd)
      return
    }
    if (this.mode === 'javascript') {
      await this.execJsLine(cmd)
      return
    }

    const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || []
    const tokens = parts.map((s) => s.replace(/^"|"$/g, ''))
    const name = tokens[0] || ''
    const arg = tokens.slice(1).join(' ')

    try {
      this.busy = true
      switch (name) {
        case 'help':
        case '?':
          this.help()
          break
        case 'clear':
        case 'cls':
          this.term.clear()
          break
        case 'history':
          this.history.forEach((h, i) => this.term.writeln('  ' + (i + 1) + '  ' + h))
          break
        case 'echo':
          this.term.writeln(arg)
          break
        case 'date':
        case 'time':
          this.term.writeln(new Date().toString())
          break
        case 'whoami':
          this.term.writeln('sandbox-user')
          break
        case 'pwd':
          this.term.writeln('/sandbox')
          break
        case 'ls':
          this.term.writeln('editor  README  packages')
          break
        case 'cat':
          this.term.writeln(arg === 'README' || !arg
            ? 'Code Sandbox — type help · run · python · js'
            : this.deps.getCode().slice(0, 1500))
          break
        case 'lang':
        case 'language':
          this.term.writeln('language: ' + this.deps.getLanguage())
          break
        case 'run':
        case 'exec':
          this.term.writeln('\x1b[90m→ running editor code…\x1b[0m')
          await this.deps.runEditorCode()
          break
        case 'python':
        case 'py':
        case 'repl':
          this.mode = 'python'
          this.pyBuffer = []
          this.term.writeln('\x1b[36mPython REPL\x1b[0m  (type exit to leave)')
          if (!this.deps.pyodide()) this.term.writeln('\x1b[33mPython loading…\x1b[0m')
          break
        case 'js':
        case 'node':
        case 'javascript':
          this.mode = 'javascript'
          this.jsContext = {}
          this.term.writeln('\x1b[33mJavaScript REPL\x1b[0m  (type exit to leave)')
          break
        case 'exit':
        case 'quit':
          this.term.writeln('(shell)')
          break
        case 'version':
        case 'ver':
          this.term.writeln('Code Sandbox Terminal v3.1')
          break
        default:
          if (name.includes('(') || name.includes('=') || name.startsWith('print') || name.startsWith('console')) {
            await this.quickEval(cmd)
          } else {
            this.term.writeln('\x1b[31mcommand not found:\x1b[0m ' + name + '  (try help)')
          }
      }
    } catch (e: unknown) {
      this.term.writeln('\x1b[31m' + (e instanceof Error ? e.message : String(e)) + '\x1b[0m')
    } finally {
      this.busy = false
      this.prompt()
    }
  }

  private help() {
    ;[
      '',
      '\x1b[1mCommands\x1b[0m',
      '  help          Show help',
      '  run           Run editor code (real-time)',
      '  python / py   Python REPL',
      '  js / node     JavaScript REPL',
      '  clear         Clear screen',
      '  history       Command history',
      '  echo / date   Utilities',
      '  lang          Current language',
      '',
      '\x1b[1mREPL\x1b[0m  exit · Ctrl+C · ↑↓ history',
      '\x1b[1mEditor\x1b[0m  Ctrl/Cmd+Enter to run',
      '',
    ].forEach((l) => this.term.writeln(l))
  }

  private async execPythonLine(cmd: string) {
    if (cmd === 'exit' || cmd === 'quit') {
      this.mode = 'shell'
      this.pyBuffer = []
      this.term.writeln('\x1b[90m(back to shell)\x1b[0m')
      this.prompt()
      return
    }

    const py = this.deps.pyodide()
    if (!py) {
      this.term.writeln('\x1b[33mPython not ready yet\x1b[0m')
      this.prompt()
      return
    }

    this.pyBuffer.push(cmd)
    if (cmd.trimEnd().endsWith(':')) {
      this.term.write('\x1b[36m...\x1b[0m ')
      return
    }
    if (this.pyBuffer.length > 1 && cmd.trim() !== '') {
      this.term.write('\x1b[36m...\x1b[0m ')
      return
    }
    if (this.pyBuffer.length > 1 && cmd.trim() === '') this.pyBuffer.pop()

    const source = this.pyBuffer.join('\n')
    this.pyBuffer = []
    this.busy = true
    try {
      py.setStdout({ batched: (t) => this.term.write(t.endsWith('\n') ? t : t + '\n') })
      py.setStderr({ batched: (t) => this.term.write('\x1b[31m' + t + '\x1b[0m') })
      let toRun = source
      if (!/^\s*(def|class|for|while|if|with|try|import|from|print|#)/.test(source) && !source.includes('\n')) {
        toRun = '_r = (' + source + ')\nif _r is not None: print(repr(_r))'
      }
      await py.runPythonAsync(toRun)
    } catch (e: unknown) {
      this.term.writeln('\x1b[31m' + (e instanceof Error ? e.message : String(e)) + '\x1b[0m')
    } finally {
      this.busy = false
      this.prompt()
    }
  }

  private async execJsLine(cmd: string) {
    if (cmd === 'exit' || cmd === 'quit') {
      this.mode = 'shell'
      this.term.writeln('\x1b[90m(back to shell)\x1b[0m')
      this.prompt()
      return
    }
    this.busy = true
    try {
      const keys = Object.keys(this.jsContext)
      const values = keys.map((k) => this.jsContext[k])
      let result: unknown
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(...keys, '"use strict"; return (async () => (' + cmd + '))()')
        result = await fn(...values)
      } catch {
        // eslint-disable-next-line no-new-func
        const fn2 = new Function(...keys, '"use strict"; return (async () => { ' + cmd + ' })()')
        result = await fn2(...values)
      }
      if (result !== undefined) {
        const out = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
        this.term.writeln('\x1b[90m' + out + '\x1b[0m')
      }
      this.jsContext['_'] = result as unknown
    } catch (e: unknown) {
      this.term.writeln('\x1b[31m' + (e instanceof Error ? e.message : String(e)) + '\x1b[0m')
    } finally {
      this.busy = false
      this.prompt()
    }
  }

  private async quickEval(cmd: string) {
    const lang = this.deps.getLanguage()
    if (lang === 'python') {
      this.mode = 'python'
      await this.execPythonLine(cmd)
      this.mode = 'shell'
      return
    }
    if (lang === 'javascript' || lang === 'typescript') {
      this.mode = 'javascript'
      await this.execJsLine(cmd)
      this.mode = 'shell'
      return
    }
    this.term.writeln('\x1b[31mcommand not found:\x1b[0m ' + cmd.split(' ')[0])
  }
}
