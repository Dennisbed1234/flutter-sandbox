/**
 * Professional interactive terminal for Code Sandbox
 * - Shell + Python / JavaScript REPLs with real-time execution
 * - Command history (↑↓), Ctrl+C / Ctrl+L, Tab autocomplete
 * - Virtual filesystem, micropip install, timing, multi-line Python
 * - Persistent JS context, rich help, package listing
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
  onStatus?: (s: string) => void
}

type Mode = 'shell' | 'python' | 'javascript'

const PROMPT_SHELL = '\x1b[32m$\x1b[0m '
const PROMPT_PY = '\x1b[36m>>>\x1b[0m '
const PROMPT_PY_CONT = '\x1b[36m...\x1b[0m '
const PROMPT_JS = '\x1b[33m>\x1b[0m '

const SHELL_CMDS = [
  'help', 'clear', 'cls', 'history', 'echo', 'date', 'time', 'whoami', 'pwd',
  'ls', 'cat', 'lang', 'run', 'exec', 'python', 'py', 'js', 'node', 'javascript',
  'exit', 'quit', 'version', 'ver', 'reset', 'env', 'packages', 'pip', 'install',
  'cd', 'mkdir', 'touch', 'rm', 'which', 'uname', 'uptime', 'id',
]

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
  private jsContext: Record<string, unknown> = { console }
  private disposed = false
  private dataDisp: { dispose: () => void } | null = null
  private vfs: Record<string, string> = {
    'README': 'Code Sandbox Terminal v4 — type help · run · python · js · pip install',
    'editor': '',
  }
  private cwd = '/sandbox'
  private startTime = Date.now()

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
    t.writeln('\x1b[1;36m╔════════════════════════════════════════════════╗\x1b[0m')
    t.writeln('\x1b[1;36m║\x1b[0m  \x1b[1mCode Sandbox Terminal\x1b[0m  · pro v4 · real-time  \x1b[1;36m║\x1b[0m')
    t.writeln('\x1b[1;36m╚════════════════════════════════════════════════╝\x1b[0m')
    t.writeln('')
    t.writeln('  \x1b[1mhelp\x1b[0m  commands   \x1b[1mrun\x1b[0m  editor   \x1b[1mpython\x1b[0m / \x1b[1mjs\x1b[0m  REPL')
    t.writeln('  \x1b[1mpip install <pkg>\x1b[0m   \x1b[1m↑↓\x1b[0m history   \x1b[1mTab\x1b[0m complete')
    t.writeln('')
  }

  private prompt() {
    if (this.disposed) return
    if (this.mode === 'python') {
      this.term.write(this.pyBuffer.length ? PROMPT_PY_CONT : PROMPT_PY)
    } else if (this.mode === 'javascript') {
      this.term.write(PROMPT_JS)
    } else {
      this.term.write(PROMPT_SHELL)
    }
  }

  private onData(data: string) {
    if (this.busy) return
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]
      const code = data.charCodeAt(i)

      // Enter
      if (ch === '\r' || ch === '\n') {
        this.term.writeln('')
        const cmd = this.line
        this.line = ''
        if (cmd.trim()) {
          this.history.push(cmd)
          if (this.history.length > 300) this.history.shift()
        }
        this.histIdx = -1
        this.histDraft = ''
        void this.execute(cmd)
        return
      }

      // Backspace
      if (ch === '\x7f' || ch === '\b') {
        if (this.line.length > 0) {
          this.line = this.line.slice(0, -1)
          this.term.write('\b \b')
        }
        continue
      }

      // Ctrl+C
      if (code === 3) {
        this.term.writeln('^C')
        this.line = ''
        this.pyBuffer = []
        this.busy = false
        this.prompt()
        continue
      }

      // Ctrl+L / Ctrl+U clear line
      if (code === 12) {
        this.term.clear()
        this.line = ''
        this.prompt()
        continue
      }
      if (code === 21) {
        this.clearLineVisual()
        this.line = ''
        continue
      }

      // Tab autocomplete
      if (ch === '\t') {
        this.autocomplete()
        continue
      }

      // Escape sequences (arrows)
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

      // Printable
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

  private autocomplete() {
    if (this.mode !== 'shell') return
    const parts = this.line.trimStart().split(/\s+/)
    const last = parts[parts.length - 1] || ''
    if (!last) return
    const matches = SHELL_CMDS.filter((c) => c.startsWith(last))
    if (matches.length === 1) {
      const rest = matches[0].slice(last.length)
      this.line += rest + ' '
      this.term.write(rest + ' ')
    } else if (matches.length > 1) {
      this.term.writeln('')
      this.term.writeln(matches.join('  '))
      this.prompt()
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

    // Shell mode
    const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || []
    const tokens = parts.map((s) => s.replace(/^"|"$/g, ''))
    const name = tokens[0] || ''
    const args = tokens.slice(1)
    const arg = args.join(' ')

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
          this.history.forEach((h, i) => this.term.writeln(`  ${String(i + 1).padStart(3)}  ${h}`))
          break
        case 'echo':
          this.term.writeln(arg)
          break
        case 'date':
          this.term.writeln(new Date().toString())
          break
        case 'time':
          if (arg) {
            const t0 = performance.now()
            await this.execute(arg)
            const ms = (performance.now() - t0).toFixed(1)
            this.term.writeln(`\x1b[90m⏱ ${ms} ms\x1b[0m`)
            return // execute already prompted
          }
          this.term.writeln(new Date().toLocaleTimeString())
          break
        case 'whoami':
        case 'id':
          this.term.writeln('sandbox-user uid=1000')
          break
        case 'pwd':
          this.term.writeln(this.cwd)
          break
        case 'cd':
          if (!arg || arg === '~' || arg === '/') this.cwd = '/sandbox'
          else this.cwd = arg.startsWith('/') ? arg : this.cwd + '/' + arg
          break
        case 'ls':
          this.term.writeln(Object.keys(this.vfs).concat(['editor', 'packages']).join('  '))
          break
        case 'cat': {
          const key = arg || 'README'
          if (key === 'editor') this.term.writeln(this.deps.getCode().slice(0, 2000) || '(empty)')
          else if (this.vfs[key] !== undefined) this.term.writeln(this.vfs[key])
          else this.term.writeln(`\x1b[31mcat: ${key}: No such file\x1b[0m`)
          break
        }
        case 'touch':
        case 'mkdir':
          if (arg) this.vfs[arg] = this.vfs[arg] ?? ''
          break
        case 'rm':
          if (arg && arg in this.vfs) delete this.vfs[arg]
          break
        case 'lang':
        case 'language':
          this.term.writeln('language: ' + this.deps.getLanguage())
          break
        case 'run':
        case 'exec':
          this.term.writeln('\x1b[90m→ running editor code…\x1b[0m')
          this.deps.onStatus?.('Running…')
          await this.deps.runEditorCode()
          this.deps.onStatus?.('Done')
          break
        case 'python':
        case 'py':
        case 'repl':
          this.mode = 'python'
          this.pyBuffer = []
          this.term.writeln('\x1b[36mPython REPL\x1b[0m  (exit · Ctrl+C · multi-line with :)')
          if (!this.deps.pyodide()) this.term.writeln('\x1b[33mPython still loading…\x1b[0m')
          break
        case 'js':
        case 'node':
        case 'javascript':
          this.mode = 'javascript'
          this.term.writeln('\x1b[33mJavaScript REPL\x1b[0m  (exit · _ holds last result)')
          break
        case 'exit':
        case 'quit':
          this.term.writeln('(shell)')
          break
        case 'version':
        case 'ver':
          this.term.writeln('Code Sandbox Terminal v4.0 · real-time')
          break
        case 'reset':
          this.jsContext = { console }
          this.pyBuffer = []
          this.term.writeln('\x1b[90mcontext reset\x1b[0m')
          break
        case 'env':
          this.term.writeln('LANG=en_US.UTF-8')
          this.term.writeln('SHELL=/bin/sandbox')
          this.term.writeln('USER=sandbox-user')
          this.term.writeln('PWD=' + this.cwd)
          break
        case 'uname':
          this.term.writeln('SandboxOS 4.0 x86_64 browser')
          break
        case 'uptime':
          this.term.writeln(`up ${Math.floor((Date.now() - this.startTime) / 1000)}s`)
          break
        case 'which':
          this.term.writeln(SHELL_CMDS.includes(arg) ? `/usr/bin/${arg}` : `${arg} not found`)
          break
        case 'packages':
          this.term.writeln('Built-in: python (pyodide) · micropip · numpy · matplotlib (load via pip)')
          break
        case 'pip':
        case 'install': {
          const pkg = name === 'install' ? arg : args[0] === 'install' ? args.slice(1).join(' ') : arg
          if (!pkg) {
            this.term.writeln('usage: pip install <package>[,package…]')
            break
          }
          await this.pipInstall(pkg)
          break
        }
        default:
          // Try as expression if looks like code
          if (
            name.includes('(') ||
            name.includes('=') ||
            name.startsWith('print') ||
            name.startsWith('console') ||
            name.startsWith('import') ||
            /^\d/.test(name)
          ) {
            await this.quickEval(cmd)
          } else {
            this.term.writeln(`\x1b[31mcommand not found:\x1b[0m ${name}  (try help)`)
          }
      }
    } catch (e: unknown) {
      this.term.writeln('\x1b[31m' + (e instanceof Error ? e.message : String(e)) + '\x1b[0m')
    } finally {
      this.busy = false
      this.prompt()
    }
  }

  private async pipInstall(pkgList: string) {
    const py = this.deps.pyodide()
    if (!py) {
      this.term.writeln('\x1b[33mPython not ready yet\x1b[0m')
      return
    }
    const pkgs = pkgList.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    this.term.writeln(`\x1b[90minstalling ${pkgs.join(', ')}…\x1b[0m`)
    try {
      await py.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(pkgs)})
print("ok: " + ", ".join(${JSON.stringify(pkgs)}))
`)
    } catch (e: unknown) {
      // fallback loadPackage for pure pyodide packages
      if (py.loadPackage) {
        try {
          await py.loadPackage(pkgs)
          this.term.writeln('\x1b[32mok (loadPackage)\x1b[0m')
          return
        } catch {}
      }
      this.term.writeln('\x1b[31m' + (e instanceof Error ? e.message : String(e)) + '\x1b[0m')
    }
  }

  private help() {
    ;[
      '',
      '\x1b[1;36mCommands\x1b[0m',
      '  help, ?           Show this help',
      '  run, exec         Run current editor code (real-time)',
      '  python, py        Enter Python REPL',
      '  js, node          Enter JavaScript REPL',
      '  pip install pkg   Install Python package (micropip)',
      '  clear, cls        Clear screen',
      '  history           Show command history',
      '  time <cmd>        Time a command',
      '  reset             Reset REPL context',
      '  ls, cat, pwd, cd  Virtual filesystem',
      '  lang, env, uname  Info',
      '',
      '\x1b[1;36mREPL\x1b[0m',
      '  exit / quit       Leave REPL → shell',
      '  Ctrl+C            Interrupt / cancel line',
      '  Ctrl+L            Clear screen',
      '  ↑ ↓               History',
      '  Tab               Autocomplete (shell)',
      '',
      '\x1b[1;36mTips\x1b[0m',
      '  Multi-line Python: end line with : then indent',
      '  Editor: Ctrl/Cmd+Enter to Run',
      '  _ in JS holds last result',
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
      this.term.writeln('\x1b[33mPython not ready yet — wait a moment\x1b[0m')
      this.prompt()
      return
    }

    // Multi-line buffer
    this.pyBuffer.push(cmd)
    const endsWithColon = cmd.trimEnd().endsWith(':')
    const isIndented = cmd.startsWith(' ') || cmd.startsWith('\t')
    const empty = cmd.trim() === ''

    if (endsWithColon || (this.pyBuffer.length > 1 && isIndented && !empty)) {
      // continue collecting
      this.prompt()
      return
    }
    if (this.pyBuffer.length > 1 && empty) {
      // blank line ends block
      this.pyBuffer.pop()
    }

    const source = this.pyBuffer.join('\n')
    this.pyBuffer = []
    if (!source.trim()) {
      this.prompt()
      return
    }

    this.busy = true
    try {
      py.setStdout({
        batched: (t) => this.term.write(t.endsWith('\n') ? t : t + '\n'),
      })
      py.setStderr({
        batched: (t) => this.term.write('\x1b[31m' + t + '\x1b[0m'),
      })

      // Auto-print expression results
      let toRun = source
      const isStmt =
        /^\s*(def|class|for|while|if|with|try|import|from|print|assert|raise|return|pass|break|continue|#|@)/.test(
          source
        ) || source.includes('\n')
      if (!isStmt) {
        toRun = `_r = (${source})\nif _r is not None:\n    print(repr(_r))`
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
      // Override console for this eval
      const logs: string[] = []
      const fakeConsole = {
        log: (...a: unknown[]) => {
          const s = a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')
          logs.push(s)
          this.term.writeln(s)
        },
        error: (...a: unknown[]) => {
          const s = a.map(String).join(' ')
          this.term.writeln('\x1b[31m' + s + '\x1b[0m')
        },
        warn: (...a: unknown[]) => {
          this.term.writeln('\x1b[33m' + a.map(String).join(' ') + '\x1b[0m')
        },
      }
      this.jsContext.console = fakeConsole

      const keys = Object.keys(this.jsContext)
      const values = keys.map((k) => this.jsContext[k])
      let result: unknown
      try {
        // expression
        // eslint-disable-next-line no-new-func
        const fn = new Function(...keys, `"use strict"; return (async () => (${cmd}))()`)
        result = await fn(...values)
      } catch {
        // statement
        // eslint-disable-next-line no-new-func
        const fn2 = new Function(...keys, `"use strict"; return (async () => { ${cmd} })()`)
        result = await fn2(...values)
      }
      if (result !== undefined && logs.length === 0) {
        const out =
          typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
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
    this.term.writeln(`\x1b[31mcommand not found:\x1b[0m ${cmd.split(' ')[0]}`)
  }
}
