export type Lang = 'python' | 'javascript' | 'typescript' | 'html' | 'dart'

export type ProjectState = {
  version: 1
  language: Lang
  codeByLang: Record<Lang, string>
  htmlFiles?: { html: string; css: string; js: string }
  activeHtmlFile?: 'html' | 'css' | 'js'
  theme?: 'vs-dark' | 'light'
  updatedAt: number
}

const KEY = 'code-sandbox-v1'

export function loadProject(): ProjectState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as ProjectState
    if (data?.version !== 1) return null
    return data
  } catch {
    return null
  }
}

export function saveProject(state: Omit<ProjectState, 'version' | 'updatedAt'>) {
  try {
    const payload: ProjectState = {
      ...state,
      version: 1,
      updatedAt: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* quota */
  }
}

export function exportProjectJson(state: Omit<ProjectState, 'version' | 'updatedAt'>) {
  const payload: ProjectState = { ...state, version: 1, updatedAt: Date.now() }
  return JSON.stringify(payload, null, 2)
}

export function importProjectJson(text: string): ProjectState | null {
  try {
    const data = JSON.parse(text) as ProjectState
    if (!data?.codeByLang) return null
    return { ...data, version: 1, updatedAt: Date.now() }
  } catch {
    return null
  }
}

export function encodeShare(state: { language: Lang; code: string }) {
  try {
    const json = JSON.stringify(state)
    return btoa(unescape(encodeURIComponent(json)))
  } catch {
    return ''
  }
}

export function decodeShare(hash: string): { language: Lang; code: string } | null {
  try {
    const raw = hash.replace(/^#share=/, '').replace(/^#/, '')
    if (!raw) return null
    const json = decodeURIComponent(escape(atob(raw)))
    const data = JSON.parse(json)
    if (!data?.code || !data?.language) return null
    return data
  } catch {
    return null
  }
}

export function buildShareUrl(state: { language: Lang; code: string }) {
  const enc = encodeShare(state)
  if (!enc) return window.location.href
  return `${window.location.origin}${window.location.pathname}#share=${enc}`
}
