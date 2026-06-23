/**
 * Session store – the heart of the application.
 *
 * All state mutations happen through *commands*.  A command is:
 *   1. Applied to the in-memory state immediately.
 *   2. Appended to the persistent command log (localStorage).
 *   3. Pushed onto the undo stack.
 *
 * To undo: pop the last command, compute its inverse via `invertCommand`, and
 * dispatch the inverse as a regular command (which is also logged and undoable).
 *
 * Session restore: load the stored log and replay every command in order.
 *
 * Future API note: the `dispatch` method is intentionally decoupled from the
 * UI so it can be called by a Centrifugo message handler with zero changes.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Session, Bay, Strip, Command, StripColor, CommandSource } from '../types/index.ts'
import { invertCommand } from '../utils/commandLog.ts'
import {
  listSessions,
  saveSessionMeta,
  deleteSessionMeta,
  loadLog,
  saveLog,
  appendCommand,
  getRawLog,
} from '../utils/storage.ts'
import { downloadLog } from '../utils/commandLog.ts'

export const useSessionStore = defineStore('session', () => {
  // ── Reactive state ────────────────────────────────────────────────────────
  const sessions = ref(listSessions())
  const activeSession = ref<Session | null>(null)
  const undoStack = ref<Command[]>([])
  const redoStack = ref<Command[]>([])
  const pendingRegistrationEditStripId = ref<string | null>(null)

  // ── Helpers ───────────────────────────────────────────────────────────────

  function findBay(bays: Bay[], bayId: string): Bay {
    const bay = bays.find((b) => b.id === bayId)
    if (!bay) throw new Error(`Bay not found: ${bayId}`)
    return bay
  }

  function findStrip(bay: Bay, stripId: string): { strip: Strip; index: number } {
    const index = bay.strips.findIndex((s) => s.id === stripId)
    if (index === -1) throw new Error(`Strip not found: ${stripId}`)
    return { strip: bay.strips[index], index }
  }

  // ── Command applicator ────────────────────────────────────────────────────
  // Applies a command to the given bay array (mutates in place).

  function applyToState(bays: Bay[], cmd: Command): void {
    switch (cmd.cmd) {
      case 'SESSION_START':
        // Already handled during openSession; nothing more to do here.
        break

      case 'STRIP_ADD': {
        const bay = findBay(bays, cmd.p.bayId)
        const idx = cmd.p.index !== undefined ? cmd.p.index : bay.strips.length
        bay.strips.splice(idx, 0, { ...cmd.p.strip })
        break
      }

      case 'STRIP_REMOVE': {
        const bay = findBay(bays, cmd.p.bayId)
        const { index } = findStrip(bay, cmd.p.stripId)
        bay.strips.splice(index, 1)
        break
      }

      case 'STRIP_MOVE': {
        const fromBay = findBay(bays, cmd.p.fromBayId)
        const toBay = findBay(bays, cmd.p.toBayId)

        const { index: fromIdx } = findStrip(fromBay, cmd.p.stripId)
        if (fromIdx !== cmd.p.fromIndex) {
          throw new Error(
            `Non-deterministic STRIP_MOVE source index for strip ${cmd.p.stripId}: expected ${cmd.p.fromIndex}, actual ${fromIdx}`,
          )
        }

        if (fromBay.id !== toBay.id && toBay.strips.some((s) => s.id === cmd.p.stripId)) {
          throw new Error(`Non-deterministic STRIP_MOVE target already contains strip: ${cmd.p.stripId}`)
        }

        const [strip] = fromBay.strips.splice(fromIdx, 1)

        // When moving within the same bay the toIndex may have shifted
        const toIdx = Math.min(cmd.p.toIndex, toBay.strips.length)
        toBay.strips.splice(toIdx, 0, strip)
        break
      }

      case 'STRIP_UPDATE': {
        // Find the strip across all bays (it may have moved since the command
        // was recorded, so we search rather than rely on stored bayId).
        let found = false
        for (const bay of bays) {
          const idx = bay.strips.findIndex((s) => s.id === cmd.p.stripId)
          if (idx !== -1) {
            ;(bay.strips[idx] as unknown as Record<string, unknown>)[cmd.p.field] = cmd.p.newValue
            found = true
            break
          }
        }
        if (!found) throw new Error(`Strip not found for update: ${cmd.p.stripId}`)
        break
      }

      case 'BAY_SET_COLLAPSED': {
        const bay = findBay(bays, cmd.p.bayId)
        bay.collapsed = cmd.p.newCollapsed
        break
      }
    }
  }

  // ── Public: dispatch a command ────────────────────────────────────────────
  // This is the single entry point for all state changes – from the local UI
  // and in the future from the Centrifugo remote control API.

  type DispatchOptions = {
    trackUndo?: boolean
    clearRedo?: boolean
    source?: CommandSource
  }

  function dispatch(cmd: Command, options: DispatchOptions = {}): void {
    if (!activeSession.value) return

    const trackUndo = options.trackUndo ?? cmd.cmd !== 'SESSION_START'
    const clearRedo = options.clearRedo ?? trackUndo
    const source = options.source ?? 'user'

    const effectiveCmd: Command = {
      ...cmd,
      src: cmd.src ?? source,
    }

    applyToState(activeSession.value.bays, effectiveCmd)

    if (trackUndo && effectiveCmd.cmd !== 'SESSION_START') {
      undoStack.value.push(effectiveCmd)
      if (clearRedo) redoStack.value = []
    }

    appendCommand(activeSession.value.id, effectiveCmd)

    // Keep session metadata (updatedAt) current
    const meta = sessions.value.find((s) => s.id === activeSession.value!.id)
    if (meta) {
      meta.updatedAt = effectiveCmd.t
      saveSessionMeta(meta)
    }
  }

  // ── Public: undo ──────────────────────────────────────────────────────────

  function undo(): void {
    const last = undoStack.value.pop()
    if (!last) return
    const inverse = invertCommand(last)
    if (!inverse) return

    dispatch(
      {
        ...inverse,
        src: 'undo',
      },
      {
        trackUndo: false,
        clearRedo: false,
        source: 'undo',
      },
    )

    redoStack.value.push(last)
  }

  function redo(): void {
    const next = redoStack.value.pop()
    if (!next) return

    dispatch(
      {
        ...next,
        t: new Date().toISOString(),
        src: 'redo',
      },
      {
        trackUndo: true,
        clearRedo: false,
        source: 'redo',
      },
    )
  }

  // ── Public: session management ────────────────────────────────────────────

  function createSession(name: string, templateName: string, bays: Bay[]): void {
    const id = crypto.randomUUID()
    const timestamp = new Date().toISOString()

    const meta = {
      id,
      name,
      templateName,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const session: Session = { ...meta, bays }

    saveSessionMeta(meta)
    sessions.value = listSessions()

    activeSession.value = session
    undoStack.value = []
    redoStack.value = []

    // Log SESSION_START so the log is self-contained and can be restored
    const startCmd: Command = {
      t: timestamp,
      cmd: 'SESSION_START',
      src: 'system',
      p: {
        sessionId: id,
        name,
        templateName,
        bays: bays.map(({ id: bid, name: bn, color: bc, textColor: btc, collapsed: bcollapsed, order: bo }) => ({
          id: bid,
          name: bn,
          color: bc,
          textColor: btc,
          collapsed: bcollapsed,
          order: bo,
        })),
      },
    }
    appendCommand(id, startCmd)
  }

  function openSession(sessionId: string): void {
    const meta = sessions.value.find((s) => s.id === sessionId)
    if (!meta) throw new Error(`Session not found: ${sessionId}`)

    const commands = loadLog(sessionId)

    // Find SESSION_START to rebuild the bay skeleton
    const startCmd = commands.find((c) => c.cmd === 'SESSION_START')
    if (!startCmd || startCmd.cmd !== 'SESSION_START') {
      throw new Error('Log is missing SESSION_START')
    }

    const bays: Bay[] = startCmd.p.bays.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color,
      textColor: b.textColor ?? '#ffffff',
      collapsed: b.collapsed ?? false,
      order: b.order,
      strips: [],
    }))

    // Replay all commands in order to rebuild state
    const undoable: Command[] = []
    const redoable: Command[] = []
    for (const cmd of commands) {
      applyToState(bays, cmd)
      if (cmd.cmd === 'SESSION_START') continue

      const src = cmd.src ?? 'user'

      if (src === 'undo') {
        const moved = undoable.pop()
        if (moved) {
          redoable.push(moved)
        } else {
          const original = invertCommand(cmd)
          if (original && original.cmd !== 'SESSION_START') {
            redoable.push(original)
          }
        }
        continue
      }

      if (src === 'redo') {
        if (redoable.length > 0) redoable.pop()
        undoable.push(cmd)
        continue
      }

      if (src === 'system') continue

      undoable.push(cmd)
      redoable.length = 0
    }

    activeSession.value = { ...meta, bays }
    undoStack.value = undoable
    redoStack.value = redoable
  }

  function closeSession(): void {
    activeSession.value = null
    undoStack.value = []
    redoStack.value = []
  }

  function removeSession(sessionId: string): void {
    deleteSessionMeta(sessionId)
    sessions.value = listSessions()
    if (activeSession.value?.id === sessionId) {
      activeSession.value = null
      undoStack.value = []
      redoStack.value = []
    }
  }

  function exportLog(): void {
    if (!activeSession.value) return
    const raw = getRawLog(activeSession.value.id)
    const filename = `${activeSession.value.name.replace(/\s+/g, '_')}.txt`
    downloadLog(filename, raw)
  }

  function importLog(text: string): void {
    if (!activeSession.value) return
    // Replace the current log with the imported one and re-open the session
    saveLog(activeSession.value.id, [])
    localStorage.setItem(`fs:log:${activeSession.value.id}`, text)
    openSession(activeSession.value.id)
  }

  // ── Convenience dispatch wrappers (typed sugar) ───────────────────────────

  function addStrip(bayId: string, strip: Strip, index?: number): void {
    dispatch({
      t: new Date().toISOString(),
      cmd: 'STRIP_ADD',
      p: { bayId, strip, index },
    })
    pendingRegistrationEditStripId.value = strip.id
  }

  function claimPendingRegistrationEdit(stripId: string): boolean {
    if (pendingRegistrationEditStripId.value !== stripId) return false
    pendingRegistrationEditStripId.value = null
    return true
  }

  function removeStrip(stripId: string, bayId: string): void {
    if (!activeSession.value) return
    const bay = findBay(activeSession.value.bays, bayId)
    const { index } = findStrip(bay, stripId)
    dispatch({
      t: new Date().toISOString(),
      cmd: 'STRIP_REMOVE',
      p: { stripId, bayId, index, strip: { ...bay.strips[index] } },
    })
  }

  function moveStrip(
    stripId: string,
    fromBayId: string,
    fromIndex: number,
    toBayId: string,
    toIndex: number,
  ): void {
    dispatch({
      t: new Date().toISOString(),
      cmd: 'STRIP_MOVE',
      p: { stripId, fromBayId, fromIndex, toBayId, toIndex },
    })
  }

  function updateStrip(
    stripId: string,
    bayId: string,
    field: keyof Omit<Strip, 'id'>,
    oldValue: Strip[keyof Omit<Strip, 'id'>],
    newValue: Strip[keyof Omit<Strip, 'id'>],
  ): void {
    if (oldValue === newValue) return
    dispatch({
      t: new Date().toISOString(),
      cmd: 'STRIP_UPDATE',
      p: { stripId, bayId, field, oldValue, newValue },
    })
  }

  function updateStripColor(stripId: string, bayId: string, oldColor: StripColor, newColor: StripColor): void {
    updateStrip(stripId, bayId, 'color', oldColor, newColor)
  }

  function setBayCollapsed(bayId: string, newCollapsed: boolean): void {
    if (!activeSession.value) return
    const bay = findBay(activeSession.value.bays, bayId)
    if (bay.collapsed === newCollapsed) return

    dispatch({
      t: new Date().toISOString(),
      cmd: 'BAY_SET_COLLAPSED',
      p: { bayId, oldCollapsed: bay.collapsed, newCollapsed },
    })
  }

  return {
    sessions,
    activeSession,
    undoStack,
    redoStack,
    pendingRegistrationEditStripId,
    dispatch,
    undo,
    redo,
    createSession,
    openSession,
    closeSession,
    removeSession,
    exportLog,
    importLog,
    addStrip,
    claimPendingRegistrationEdit,
    removeStrip,
    moveStrip,
    updateStrip,
    updateStripColor,
    setBayCollapsed,
  }
})
