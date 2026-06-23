// ─── Strip colour meanings ────────────────────────────────────────────────────
// green  → aircraft intends to land
// blue   → aircraft departs out of ATZ
// yellow → aircraft stays to practice traffic patterns
// white  → default / no specific intention
export type StripColor = 'green' | 'blue' | 'yellow' | 'white'

// ─── Flight strip data ────────────────────────────────────────────────────────
export interface Strip {
  id: string
  registration: string
  type: string        // aircraft type, e.g. "C172"
  language: string    // language of communication, e.g. "EN"
  landingCount: number
  color: StripColor
  notes: string
}

// ─── Strip bay (a named slot that holds strips) ───────────────────────────────
export interface Bay {
  id: string
  name: string
  color: string       // header background colour (hex)
  textColor: string   // header text colour (hex)
  collapsed: boolean
  order: number
  strips: Strip[]
}

// ─── Parsed template configuration ───────────────────────────────────────────
export interface TemplateConfig {
  name: string
  version: string
  bays: Array<{
    id: string
    name: string
    color: string
    textColor: string
    collapsed: boolean
    order: number
  }>
}

// ─── Session metadata ─────────────────────────────────────────────────────────
export interface SessionMeta {
  id: string
  name: string
  templateName: string
  createdAt: string   // ISO-8601
  updatedAt: string   // ISO-8601
}

// ─── Full session (meta + runtime bay/strip state) ───────────────────────────
export interface Session extends SessionMeta {
  bays: Bay[]
}

// ─── Command types ────────────────────────────────────────────────────────────
// Each command is one entry in the session log file (JSON Lines format).
// The log file serves both as the undo history and as the restore payload.
//
// Future API note: commands can arrive from the local UI *or* from a remote
// Centrifugo room.  The command engine is the single source of truth; callers
// should issue commands rather than mutate state directly.

export type CommandType =
  | 'SESSION_START'
  | 'STRIP_ADD'
  | 'STRIP_REMOVE'
  | 'STRIP_MOVE'
  | 'STRIP_UPDATE'
  | 'BAY_SET_COLLAPSED'

export type CommandSource = 'user' | 'undo' | 'redo' | 'remote' | 'system'

export interface BaseCommand {
  t: string           // ISO-8601 timestamp
  cmd: CommandType
  src?: CommandSource // provenance for history/replay diagnostics
}

export interface SessionStartCommand extends BaseCommand {
  cmd: 'SESSION_START'
  p: {
    sessionId: string
    name: string
    templateName: string
    bays: Array<{ id: string; name: string; color: string; textColor?: string; collapsed?: boolean; order: number }>
  }
}

export interface BaySetCollapsedCommand extends BaseCommand {
  cmd: 'BAY_SET_COLLAPSED'
  p: {
    bayId: string
    oldCollapsed: boolean
    newCollapsed: boolean
  }
}

export interface StripAddCommand extends BaseCommand {
  cmd: 'STRIP_ADD'
  p: {
    bayId: string
    strip: Strip
    index?: number    // position within the bay; appended if omitted
  }
}

export interface StripRemoveCommand extends BaseCommand {
  cmd: 'STRIP_REMOVE'
  p: {
    stripId: string
    bayId: string
    index: number     // stored so UNDO can re-insert at the correct position
    strip: Strip      // full strip snapshot for undo
  }
}

export interface StripMoveCommand extends BaseCommand {
  cmd: 'STRIP_MOVE'
  p: {
    stripId: string
    fromBayId: string
    fromIndex: number
    toBayId: string
    toIndex: number
  }
}

export interface StripUpdateCommand extends BaseCommand {
  cmd: 'STRIP_UPDATE'
  p: {
    stripId: string
    bayId: string
    field: keyof Omit<Strip, 'id'>
    oldValue: Strip[keyof Omit<Strip, 'id'>]
    newValue: Strip[keyof Omit<Strip, 'id'>]
  }
}

export type Command =
  | SessionStartCommand
  | StripAddCommand
  | StripRemoveCommand
  | StripMoveCommand
  | StripUpdateCommand
  | BaySetCollapsedCommand
