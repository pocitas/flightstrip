/**
 * localStorage-backed persistence helpers.
 *
 * Sessions and their command logs are stored as JSON in localStorage so the
 * app works without a backend.  The exported API mirrors what a server-backed
 * implementation would look like, making a later migration straightforward.
 */

import type { SessionMeta, Command } from '../types/index.ts'
import { serializeLog, deserializeLog } from './commandLog.ts'
import { serializeTemplate, DEFAULT_TEMPLATE } from './templateParser.ts'

const SESSIONS_KEY = 'fs:sessions'
const LOG_PREFIX = 'fs:log:'
const TEMPLATES_KEY = 'fs:templates'

export interface StoredTemplate {
  id: string
  name: string
  text: string
  createdAt: string
  updatedAt: string
}

// ─── Session metadata ─────────────────────────────────────────────────────────

export function listSessions(): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') as SessionMeta[]
  } catch {
    return []
  }
}

export function saveSessionMeta(meta: SessionMeta): void {
  const sessions = listSessions()
  const idx = sessions.findIndex((s) => s.id === meta.id)
  if (idx >= 0) sessions[idx] = meta
  else sessions.push(meta)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

export function deleteSessionMeta(id: string): void {
  const sessions = listSessions().filter((s) => s.id !== id)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  localStorage.removeItem(LOG_PREFIX + id)
}

// ─── Command log ──────────────────────────────────────────────────────────────

export function loadLog(sessionId: string): Command[] {
  const raw = localStorage.getItem(LOG_PREFIX + sessionId) ?? ''
  if (!raw) return []
  try {
    return deserializeLog(raw)
  } catch {
    return []
  }
}

export function saveLog(sessionId: string, commands: Command[]): void {
  localStorage.setItem(LOG_PREFIX + sessionId, serializeLog(commands))
}

export function appendCommand(sessionId: string, command: Command): void {
  const current = localStorage.getItem(LOG_PREFIX + sessionId) ?? ''
  const line = JSON.stringify(command)
  const next = current ? current + '\n' + line : line
  localStorage.setItem(LOG_PREFIX + sessionId, next)
}

export function getRawLog(sessionId: string): string {
  return localStorage.getItem(LOG_PREFIX + sessionId) ?? ''
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function listTemplates(): StoredTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]') as StoredTemplate[]
    if (parsed.length > 0) return parsed
  } catch {
    // fallback to seeding below
  }

  const now = new Date().toISOString()
  const seeded: StoredTemplate[] = [
    {
      id: crypto.randomUUID(),
      name: DEFAULT_TEMPLATE.name,
      text: serializeTemplate(DEFAULT_TEMPLATE),
      createdAt: now,
      updatedAt: now,
    },
  ]
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(seeded))
  return seeded
}

export function saveTemplate(template: StoredTemplate): void {
  const templates = listTemplates()
  const idx = templates.findIndex((t) => t.id === template.id)
  if (idx >= 0) templates[idx] = template
  else templates.push(template)
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

export function deleteTemplate(templateId: string): void {
  const templates = listTemplates().filter((t) => t.id !== templateId)
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}
