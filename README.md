# Code Sandbox

A real online code sandbox with **terminal**, **editor**, and **preview** — inspired by GitHub Codespaces, but running fully in the browser and deployable on Vercel.

## Features

- **Monaco Editor** (same engine as VS Code) with syntax highlighting
- **Real terminal** powered by xterm.js
- **Python** execution via Pyodide (WebAssembly) – runs entirely in the browser
- **JavaScript / TypeScript** execution
- **HTML** live preview
- Multiple sample projects
- Dark / Light theme
- Fully responsive (iPhone, iPad, laptop)
- Keyboard shortcut: `Ctrl+Enter` / `Cmd+Enter` to Run
- No backend required – works on Vercel static hosting

## Supported Languages

| Language     | How it runs                          |
|--------------|--------------------------------------|
| Python       | Pyodide (in-browser Python)          |
| JavaScript   | Native browser `eval` / Function     |
| TypeScript   | Treated as JS for quick demos        |
| HTML         | Live iframe preview                  |

> Note: This is a **browser-based sandbox**. It cannot install system packages, run Docker, or give a full Linux shell like real GitHub Codespaces. For true containerized environments you would need a backend (e.g. Gitpod, Codespaces, or a self-hosted code-server).

## Live Demo

After deploying to Vercel you get a URL like:
`https://flutter-sandbox.vercel.app` (or your custom domain)

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the repository `Dennisbed1234/flutter-sandbox`
3. Framework Preset: **Vite**
4. Click **Deploy**

No environment variables needed.

## Tech Stack

- Vite + React + TypeScript
- Monaco Editor
- xterm.js (terminal)
- Pyodide (Python in WebAssembly)
- Tailwind CSS

## License

MIT
