# Flutter Sandbox

A completely functional online Flutter playground / sandbox.

Edit Flutter/Dart code in the browser, get real-time analysis, format code, and run/preview your Flutter apps instantly using the official DartPad backend services.

## Features

- Monaco Editor (VS Code engine) with Dart syntax highlighting
- Real-time code analysis & error highlighting via DartPad API
- Code formatting
- One-click Run that opens a live Flutter preview powered by DartPad
- Sample Flutter templates (Counter, Material 3, etc.)
- Dark / Light theme
- Fully client-side + public DartPad APIs (no backend required)
- Ready for Vercel deployment

## Live Demo

After deploying to Vercel: `https://flutter-sandbox.vercel.app` (or your custom domain)

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the repository `Dennisbed1234/flutter-sandbox`
3. Framework Preset: **Vite**
4. Click Deploy

No environment variables needed.

## Tech Stack

- Vite + React + TypeScript
- Monaco Editor
- DartPad public APIs (`https://stable.api.dartpad.dev`)
- Tailwind CSS

## How it works

- Analysis & Format: POST to DartPad `/api/v3/analyze` and `/api/v3/format`
- Run: Opens the current code in an embedded or new DartPad Flutter session for full execution + hot reload support

## License

MIT
