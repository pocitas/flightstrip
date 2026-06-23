/**
 * Template file parser.
 *
 * File format (.fst – FlightStrip Template) is a simple INI-like plain text
 * that is easy to read and write by hand.  Each bay is defined in a [bay]
 * section that ends at the next [bay] or end-of-file.
 *
 * Example:
 *   # FlightStrip Template
 *   name=Default ATZ
 *   version=1
 *
 *   [bay]
 *   id=arrivals
 *   name=Arrivals
 *   color=#4CAF50
 *   order=1
 *
 *   [bay]
 *   id=patterns
 *   name=Patterns
 *   color=#FFC107
 *   order=2
 */

import type { TemplateConfig } from '../types/index.ts'

export const DEFAULT_TEMPLATE: TemplateConfig = {
  name: 'Default ATZ',
  version: '1',
  bays: [
    { id: 'arrivals', name: 'Arrivals', color: '#388E3C', order: 1 },
    { id: 'patterns', name: 'Patterns', color: '#F57F17', order: 2 },
    { id: 'departures', name: 'Departures', color: '#1565C0', order: 3 },
  ],
}

// ─── Parse ────────────────────────────────────────────────────────────────────

export function parseTemplate(text: string): TemplateConfig {
  const config: TemplateConfig = { name: '', version: '1', bays: [] }
  let currentSection: Record<string, string> | null = null
  let inBay = false

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    if (line === '[bay]') {
      if (inBay && currentSection) {
        config.bays.push(parseBaySection(currentSection))
      }
      currentSection = {}
      inBay = true
      continue
    }

    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    const value = line.slice(eqIdx + 1).trim()

    if (inBay && currentSection) {
      currentSection[key] = value
    } else {
      if (key === 'name') config.name = value
      else if (key === 'version') config.version = value
    }
  }

  if (inBay && currentSection) {
    config.bays.push(parseBaySection(currentSection))
  }

  config.bays.sort((a, b) => a.order - b.order)
  return config
}

function parseBaySection(s: Record<string, string>) {
  return {
    id: s['id'] ?? crypto.randomUUID(),
    name: s['name'] ?? 'Bay',
    color: s['color'] ?? '#607D8B',
    order: s['order'] !== undefined ? parseInt(s['order'], 10) : 999,
  }
}

// ─── Serialize ────────────────────────────────────────────────────────────────

export function serializeTemplate(config: TemplateConfig): string {
  const lines: string[] = [
    '# FlightStrip Template',
    `name=${config.name}`,
    `version=${config.version}`,
    '',
  ]

  for (const bay of config.bays) {
    lines.push('[bay]')
    lines.push(`id=${bay.id}`)
    lines.push(`name=${bay.name}`)
    lines.push(`color=${bay.color}`)
    lines.push(`order=${bay.order}`)
    lines.push('')
  }

  return lines.join('\n')
}
