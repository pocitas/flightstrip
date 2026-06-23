<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSessionStore } from '../stores/sessionStore.ts'
import type { Strip, StripColor } from '../types/index.ts'
import Dialog from 'primevue/dialog'

const props = defineProps<{
  strip: Strip
  bayId: string
  collapsed?: boolean
  showTouchHandle?: boolean
}>()

const store = useSessionStore()
const isRemoving = ref(false)
const isLandingPulseActive = ref(false)
let landingPulseTimeout: number | null = null
let longPressTimer: number | null = null
let longPressStartPoint: { x: number; y: number } | null = null

// ─── Inline editing ───────────────────────────────────────────────────────────

type TextEditableField = 'registration' | 'type' | 'notes'

const editingField = ref<TextEditableField | null>(null)
const editValue = ref('')

function startEdit(field: TextEditableField) {
  editingField.value = field
  editValue.value = props.strip[field]
  nextTick(() => {
    const el = document.getElementById(`edit-${props.strip.id}-${field}`)
    if (el) (el as HTMLElement).focus()
  })
}

function clearLongPressTimer() {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer)
    longPressTimer = null
  }
  longPressStartPoint = null
}

function beginLongPress(action: () => void, event: TouchEvent) {
  if (event.touches.length !== 1) return
  clearLongPressTimer()

  const touch = event.touches[0]
  longPressStartPoint = { x: touch.clientX, y: touch.clientY }
  longPressTimer = window.setTimeout(() => {
    longPressTimer = null
    action()
  }, 550)
}

function moveLongPress(event: TouchEvent) {
  if (longPressTimer === null || !longPressStartPoint) return
  if (event.touches.length !== 1) {
    clearLongPressTimer()
    return
  }

  const touch = event.touches[0]
  const dx = Math.abs(touch.clientX - longPressStartPoint.x)
  const dy = Math.abs(touch.clientY - longPressStartPoint.y)
  if (dx > 10 || dy > 10) clearLongPressTimer()
}

function endLongPress() {
  clearLongPressTimer()
}

function handleMouseEditAction(action: () => void, event: MouseEvent) {
  // Touch mode uses long-press for editing; ignore click events there.
  if (props.showTouchHandle) return
  if (event.button !== 0) return
  action()
}

function normalizeRegistrationInput() {
  editValue.value = editValue.value.toUpperCase()
}

function commitEdit() {
  if (!editingField.value) return
  const field = editingField.value
  const nextValue = field === 'registration' ? editValue.value.toUpperCase() : editValue.value
  store.updateStrip(props.strip.id, props.bayId, field, props.strip[field], nextValue)
  editingField.value = null
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') commitEdit()
  if (e.key === 'Escape') editingField.value = null
}

function toggleLanguage() {
  const current = (props.strip.language || '').trim().toUpperCase()
  const next = current === 'EN' ? 'CZ' : 'EN'
  store.updateStrip(props.strip.id, props.bayId, 'language', props.strip.language, next)
}

function incrementLandingCount() {
  const current = props.strip.landingCount ?? 0
  store.updateStrip(props.strip.id, props.bayId, 'landingCount', current, current + 1)

  isLandingPulseActive.value = true
  if (landingPulseTimeout !== null) window.clearTimeout(landingPulseTimeout)
  landingPulseTimeout = window.setTimeout(() => {
    isLandingPulseActive.value = false
    landingPulseTimeout = null
  }, 250)
}

// ─── Color dialog ─────────────────────────────────────────────────────────────

const colorDialogVisible = ref(false)
const pendingColor = ref<StripColor>(props.strip.color)

const colorOptions = [
  { label: 'Leave ATZ', value: 'blue' as StripColor, bg: '#64b5f6' },
  { label: 'Touch & Go', value: 'yellow' as StripColor, bg: '#ffeb3b' },
  { label: 'Land', value: 'green' as StripColor, bg: '#66bb6a' },
  { label: 'Unknown', value: 'white' as StripColor, bg: '#ffffff' },
]

function openColorDialog() {
  pendingColor.value = props.strip.color
  colorDialogVisible.value = true
}

function chooseColor(color: StripColor) {
  if (color === props.strip.color) {
    colorDialogVisible.value = false
    return
  }
  store.updateStripColor(props.strip.id, props.bayId, props.strip.color, color)
  pendingColor.value = color
  colorDialogVisible.value = false
}

// ─── Computed style ───────────────────────────────────────────────────────────

const colorClass = computed(() => `strip-color-${props.strip.color}`)
const isEnglish = computed(() => (props.strip.language || '').trim().toUpperCase() === 'EN')

// ─── Remove ───────────────────────────────────────────────────────────────────

function removeStrip() {
  if (isRemoving.value) return
  isRemoving.value = true

  // Let the collapse/fade animation play before committing the remove command.
  window.setTimeout(() => {
    store.removeStrip(props.strip.id, props.bayId)
  }, 180)
}

onMounted(() => {
  const shouldAutoEdit = store.claimPendingRegistrationEdit(props.strip.id)
  if (shouldAutoEdit) {
    startEdit('registration')
  }
})

onBeforeUnmount(() => {
  if (landingPulseTimeout !== null) {
    window.clearTimeout(landingPulseTimeout)
    landingPulseTimeout = null
  }
  clearLongPressTimer()
})
</script>

<template>
  <div
    class="flight-strip"
    :class="[colorClass, { 'strip-removing': isRemoving, 'strip-collapsed': !!collapsed }]"
    :data-strip-id="strip.id"
    @contextmenu.prevent
  >
    <!-- Sidebar tools -->
    <div class="strip-sidebar">
      <span
        v-if="showTouchHandle"
        class="touch-drag-handle pi pi-grip-lines"
        title="Drag strip"
        aria-label="Drag strip"
      />

      <button
        class="color-swatch editable"
        :class="`swatch-${strip.color}`"
        title="Click to edit"
        @click.stop="handleMouseEditAction(openColorDialog, $event)"
        @touchstart.stop="beginLongPress(openColorDialog, $event)"
        @touchmove.stop="moveLongPress"
        @touchend.stop="endLongPress"
        @touchcancel.stop="endLongPress"
      />
    </div>

    <!-- Main content -->
    <div class="strip-body">
      <!-- Registration (large, primary) -->
      <div class="strip-field registration">
        <template v-if="editingField === 'registration'">
          <input
            :id="`edit-${strip.id}-registration`"
            v-model="editValue"
            class="strip-input registration-input"
            @input="normalizeRegistrationInput"
            @blur="commitEdit"
            @keydown="onEditKeydown"
          />
        </template>
        <template v-else>
          <span
            class="field-value registration-value editable"
            :class="{ placeholder: !strip.registration, 'registration-english': isEnglish }"
            title="Click to edit"
            @click.stop="handleMouseEditAction(() => startEdit('registration'), $event)"
            @touchstart.stop="beginLongPress(() => startEdit('registration'), $event)"
            @touchmove.stop="moveLongPress"
            @touchend.stop="endLongPress"
            @touchcancel.stop="endLongPress"
          >{{ strip.registration || 'Reg.' }}</span>
        </template>
      </div>

      <!-- Type + Language row -->
      <div class="strip-row">
        <div class="strip-field small">
          <span
            class="field-label editable"
            title="Click to edit"
            @click.stop="handleMouseEditAction(() => startEdit('type'), $event)"
            @touchstart.stop="beginLongPress(() => startEdit('type'), $event)"
            @touchmove.stop="moveLongPress"
            @touchend.stop="endLongPress"
            @touchcancel.stop="endLongPress"
          >Type</span>
          <template v-if="editingField === 'type'">
            <input
              :id="`edit-${strip.id}-type`"
              v-model="editValue"
              class="strip-input small-input"
              @blur="commitEdit"
              @keydown="onEditKeydown"
            />
          </template>
          <template v-else>
            <span
              class="field-value editable"
              :class="{ placeholder: !strip.type }"
              title="Click to edit"
              @click.stop="handleMouseEditAction(() => startEdit('type'), $event)"
              @touchstart.stop="beginLongPress(() => startEdit('type'), $event)"
              @touchmove.stop="moveLongPress"
              @touchend.stop="endLongPress"
              @touchcancel.stop="endLongPress"
            >{{ strip.type || '—' }}</span>
          </template>
        </div>

        <div class="strip-field small">
          <span
            class="field-label editable"
            title="Click to edit"
            @click.stop="handleMouseEditAction(toggleLanguage, $event)"
            @touchstart.stop="beginLongPress(toggleLanguage, $event)"
            @touchmove.stop="moveLongPress"
            @touchend.stop="endLongPress"
            @touchcancel.stop="endLongPress"
          >Lang</span>
          <span
            class="field-value editable"
            title="Click to edit"
            @click.stop="handleMouseEditAction(toggleLanguage, $event)"
            @touchstart.stop="beginLongPress(toggleLanguage, $event)"
            @touchmove.stop="moveLongPress"
            @touchend.stop="endLongPress"
            @touchcancel.stop="endLongPress"
          >{{ (strip.language || 'CZ').toUpperCase() === 'EN' ? 'EN' : 'CZ' }}</span>
        </div>
      </div>

      <!-- Notes -->
      <div class="strip-field">
        <template v-if="editingField === 'notes'">
          <textarea
            :id="`edit-${strip.id}-notes`"
            v-model="editValue"
            class="strip-input notes-input"
            rows="2"
            @blur="commitEdit"
            @keydown.enter.exact.prevent="commitEdit"
            @keydown.escape="editingField = null"
          />
        </template>
        <template v-else>
          <span
            class="field-value notes-value editable"
            :class="{ placeholder: !strip.notes }"
            title="Click to edit"
            @click.stop="handleMouseEditAction(() => startEdit('notes'), $event)"
            @touchstart.stop="beginLongPress(() => startEdit('notes'), $event)"
            @touchmove.stop="moveLongPress"
            @touchend.stop="endLongPress"
            @touchcancel.stop="endLongPress"
          >{{ strip.notes || 'Notes…' }}</span>
        </template>
      </div>

      <div
        class="landing-counter editable"
        :class="{ 'landing-counter-pulse': isLandingPulseActive }"
        title="Click to edit"
        @click.stop="handleMouseEditAction(incrementLandingCount, $event)"
        @touchstart.stop="beginLongPress(incrementLandingCount, $event)"
        @touchmove.stop="moveLongPress"
        @touchend.stop="endLongPress"
        @touchcancel.stop="endLongPress"
      >
        {{ strip.landingCount ?? 0 }}
      </div>
    </div>

    <!-- Remove button -->
    <button
      class="strip-remove pi pi-times"
      title="Remove strip (use Ctrl+Z to undo)"
      @click.stop="removeStrip"
    />
  </div>

  <!-- Colour selection dialog -->
  <Dialog
    v-model:visible="colorDialogVisible"
    header="Strip Color"
    :modal="true"
    :dismissable-mask="true"
    :closable="true"
    class="color-dialog"
  >
    <p class="color-hint">Select a color:</p>
    <div class="color-radio-group" role="radiogroup" aria-label="Strip color selection">
      <label
        v-for="option in colorOptions"
        :key="option.value"
        class="color-radio-option"
        :style="{ backgroundColor: option.bg }"
      >
        <input
          :checked="pendingColor === option.value"
          type="radio"
          name="strip-color"
          class="color-radio"
          @change="chooseColor(option.value)"
        />
        <span class="color-option-label">{{ option.label }}</span>
      </label>
    </div>
  </Dialog>
</template>

<style scoped>
.flight-strip {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  margin-bottom: 6px;
  background: #fff;
  transition: box-shadow 0.15s, opacity 0.18s, max-height 0.18s, margin-bottom 0.18s, transform 0.18s;
  max-height: 260px;
  min-height: 80px;
  overflow: hidden;
}

.flight-strip:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.strip-collapsed {
  min-height: 46px;
}

.strip-removing {
  opacity: 0;
  max-height: 0;
  min-height: 0;
  margin-bottom: 0;
  transform: scaleY(0.92);
  pointer-events: none;
}

/* Strip colour variants */
.strip-color-green { border-left: 6px solid #43a047; background: #f1f8f1; }
.strip-color-blue  { border-left: 6px solid #1e88e5; background: #f0f4ff; }
.strip-color-yellow { border-left: 6px solid #fdd835; background: #fffde7; }
.strip-color-white { border-left: 6px solid #bdbdbd; background: #fff; }

.strip-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  gap: 6px;
}

.strip-collapsed .strip-sidebar {
  display: none;
}

.touch-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.55);
  font-size: 12px;
}

.color-swatch {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.2);
  cursor: pointer;
  padding: 0;
}

.swatch-green  { background: #43a047; }
.swatch-blue   { background: #1e88e5; }
.swatch-yellow { background: #fdd835; }
.swatch-white  { background: #e0e0e0; }

.strip-body {
  flex: 1;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.strip-collapsed .strip-body {
  padding: 6px 8px;
}

.strip-collapsed .strip-row,
.strip-collapsed .notes-value,
.strip-collapsed .landing-counter {
  display: none;
}

.strip-collapsed .registration {
  display: block;
}

.strip-collapsed .registration-value,
.strip-collapsed .registration-input {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.landing-counter {
  margin-top: auto;
  align-self: flex-end;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  color: #444;
  border: 1px solid rgba(0, 0, 0, 0.28);
  border-radius: 4px;
  padding: 1px 6px;
}

.landing-counter-pulse {
  animation: landing-counter-pulse 250ms ease-out;
}

@keyframes landing-counter-pulse {
  0% { background: rgba(255, 179, 0, 0); }
  35% { background: rgba(255, 179, 0, 0.9); }
  100% { background: rgba(255, 179, 0, 0); }
}

.strip-field {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.strip-row {
  display: flex;
  gap: 12px;
}

.strip-field.small {
  flex: 1;
}

.field-label {
  font-size: 10px;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.field-value {
  font-size: 13px;
  cursor: default;
  word-break: break-all;
}

.editable {
  cursor: pointer;
}

.field-value.placeholder {
  color: #bdbdbd;
  font-style: italic;
}

.registration-value {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.registration-english {
  color: #c62828;
}

.notes-value {
  white-space: pre-wrap;
  color: #555;
}

.strip-input {
  font-family: inherit;
  font-size: 13px;
  border: 1px solid #90caf9;
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.registration-input { font-size: 18px; font-weight: 700; }
.small-input { width: 70px; }
.notes-input {
  resize: vertical;
  width: 100%;
}

.strip-remove {
  background: none;
  border: none;
  color: #bdbdbd;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 6px;
  align-self: flex-start;
  transition: color 0.15s;
}

.strip-remove:hover { color: #e53935; }

.color-hint { margin: 0 0 12px; }

.color-radio-group {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.color-radio-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.color-radio {
  margin: 0;
}

.color-option-label {
  font-weight: 600;
}
</style>
