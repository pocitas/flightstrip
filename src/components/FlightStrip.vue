<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useSessionStore } from '../stores/sessionStore.ts'
import type { Strip, StripColor } from '../types/index.ts'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import Button from 'primevue/button'

const props = defineProps<{
  strip: Strip
  bayId: string
}>()

const store = useSessionStore()

// ─── Inline editing ───────────────────────────────────────────────────────────

const editingField = ref<keyof Omit<Strip, 'id' | 'color'> | null>(null)
const editValue = ref('')

function startEdit(field: keyof Omit<Strip, 'id' | 'color'>) {
  editingField.value = field
  editValue.value = props.strip[field]
  nextTick(() => {
    const el = document.getElementById(`edit-${props.strip.id}-${field}`)
    if (el) (el as HTMLElement).focus()
  })
}

function commitEdit() {
  if (!editingField.value) return
  const field = editingField.value
  store.updateStrip(props.strip.id, props.bayId, field, props.strip[field], editValue.value)
  editingField.value = null
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') commitEdit()
  if (e.key === 'Escape') editingField.value = null
}

// ─── Color dialog ─────────────────────────────────────────────────────────────

const colorDialogVisible = ref(false)
const pendingColor = ref<StripColor>(props.strip.color)

const colorOptions = [
  { label: 'To land (green)', value: 'green' as StripColor },
  { label: 'Practice patterns (yellow)', value: 'yellow' as StripColor },
  { label: 'Depart ATZ (blue)', value: 'blue' as StripColor },
  { label: 'Default (white)', value: 'white' as StripColor },
]

function openColorDialog() {
  pendingColor.value = props.strip.color
  colorDialogVisible.value = true
}

function applyColor() {
  store.updateStripColor(props.strip.id, props.bayId, props.strip.color, pendingColor.value)
  colorDialogVisible.value = false
}

// ─── Computed style ───────────────────────────────────────────────────────────

const colorClass = computed(() => `strip-color-${props.strip.color}`)

// ─── Remove ───────────────────────────────────────────────────────────────────

function removeStrip() {
  store.removeStrip(props.strip.id, props.bayId)
}
</script>

<template>
  <div class="flight-strip" :class="colorClass" :data-strip-id="strip.id">
    <!-- Drag handle + colour indicator -->
    <div class="strip-sidebar">
      <span class="drag-handle pi pi-bars" title="Drag to move" />
      <button
        class="color-swatch"
        :class="`swatch-${strip.color}`"
        title="Double-click to change colour"
        @dblclick.stop="openColorDialog"
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
            @blur="commitEdit"
            @keydown="onEditKeydown"
          />
        </template>
        <template v-else>
          <span
            class="field-value registration-value"
            :class="{ placeholder: !strip.registration }"
            @dblclick.stop="startEdit('registration')"
          >{{ strip.registration || 'Reg.' }}</span>
        </template>
      </div>

      <!-- Type + Language row -->
      <div class="strip-row">
        <div class="strip-field small">
          <span class="field-label">Type</span>
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
              class="field-value"
              :class="{ placeholder: !strip.type }"
              @dblclick.stop="startEdit('type')"
            >{{ strip.type || '—' }}</span>
          </template>
        </div>

        <div class="strip-field small">
          <span class="field-label">Lang</span>
          <template v-if="editingField === 'language'">
            <input
              :id="`edit-${strip.id}-language`"
              v-model="editValue"
              class="strip-input small-input"
              maxlength="4"
              @blur="commitEdit"
              @keydown="onEditKeydown"
            />
          </template>
          <template v-else>
            <span
              class="field-value"
              :class="{ placeholder: !strip.language }"
              @dblclick.stop="startEdit('language')"
            >{{ strip.language || '—' }}</span>
          </template>
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
            class="field-value notes-value"
            :class="{ placeholder: !strip.notes }"
            @dblclick.stop="startEdit('notes')"
          >{{ strip.notes || 'Notes…' }}</span>
        </template>
      </div>
    </div>

    <!-- Remove button -->
    <button class="strip-remove pi pi-times" title="Remove strip (use Ctrl+Z to undo)" @click.stop="removeStrip" />
  </div>

  <!-- Colour selection dialog -->
  <Dialog
    v-model:visible="colorDialogVisible"
    header="Strip Colour"
    :modal="true"
    :closable="true"
    class="color-dialog"
  >
    <p class="color-hint">Select the aircraft's intention:</p>
    <Select
      v-model="pendingColor"
      :options="colorOptions"
      option-label="label"
      option-value="value"
      class="color-select"
    />
    <template #footer>
      <Button label="Apply" icon="pi pi-check" @click="applyColor" />
    </template>
  </Dialog>
</template>

<style scoped>
.flight-strip {
  display: flex;
  align-items: stretch;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  margin-bottom: 6px;
  background: #fff;
  transition: box-shadow 0.15s;
  min-height: 80px;
}

.flight-strip:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
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
  justify-content: space-between;
  padding: 6px 4px;
  gap: 6px;
}

.drag-handle {
  cursor: grab;
  color: #9e9e9e;
  font-size: 14px;
}

.drag-handle:active { cursor: grabbing; }

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

.field-value.placeholder {
  color: #bdbdbd;
  font-style: italic;
}

.registration-value {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.05em;
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
.color-select { width: 100%; }
</style>
