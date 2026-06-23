/**
 * Command log serialization / deserialization.
 *
 * File format (.fsl – FlightStrip Log) is JSON Lines:
 * one JSON-encoded Command object per line, appended in chronological order.
 *
 * The log serves two purposes:
 *   1. Session restore – replay every command in order to rebuild state.
 *   2. Undo history   – the last undoable command in the in-memory undo stack
 *      results in its inverse being appended and applied.
 *
 * Future API note: this same log format is used when commands arrive from a
 * remote Centrifugo room so remote and local commands are fully interoperable.
 */

import type { Command } from '../types/index.ts'

// ─── Serialization ────────────────────────────────────────────────────────────

export function serializeLog(commands: Command[]): string {
  return commands.map((c) => JSON.stringify(c)).join('\n')
}

export function deserializeLog(text: string): Command[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Command)
}

export function appendToLog(existing: string, command: Command): string {
  const line = JSON.stringify(command)
  return existing ? existing + '\n' + line : line
}

// ─── Inverse commands (for undo) ──────────────────────────────────────────────

import type {
  StripAddCommand,
  StripRemoveCommand,
  StripMoveCommand,
  StripUpdateCommand,
} from '../types/index.ts'

function now(): string {
  return new Date().toISOString()
}

export function invertCommand(cmd: Command): Command | null {
  switch (cmd.cmd) {
    case 'STRIP_ADD':
      return {
        t: now(),
        cmd: 'STRIP_REMOVE',
        p: {
          stripId: cmd.p.strip.id,
          bayId: cmd.p.bayId,
          index: cmd.p.index ?? 0,
          strip: cmd.p.strip,
        },
      } satisfies StripRemoveCommand

    case 'STRIP_REMOVE':
      return {
        t: now(),
        cmd: 'STRIP_ADD',
        p: {
          bayId: cmd.p.bayId,
          strip: cmd.p.strip,
          index: cmd.p.index,
        },
      } satisfies StripAddCommand

    case 'STRIP_MOVE':
      return {
        t: now(),
        cmd: 'STRIP_MOVE',
        p: {
          stripId: cmd.p.stripId,
          fromBayId: cmd.p.toBayId,
          fromIndex: cmd.p.toIndex,
          toBayId: cmd.p.fromBayId,
          toIndex: cmd.p.fromIndex,
        },
      } satisfies StripMoveCommand

    case 'STRIP_UPDATE':
      return {
        t: now(),
        cmd: 'STRIP_UPDATE',
        p: {
          stripId: cmd.p.stripId,
          bayId: cmd.p.bayId,
          field: cmd.p.field,
          oldValue: cmd.p.newValue,
          newValue: cmd.p.oldValue,
        },
      } satisfies StripUpdateCommand

    case 'SESSION_START':
      // SESSION_START is not undoable
      return null
  }
}

// ─── Download helper ──────────────────────────────────────────────────────────

export function downloadLog(filename: string, log: string): void {
  const blob = new Blob([log], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
