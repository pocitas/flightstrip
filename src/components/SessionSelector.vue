<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSessionStore } from '../stores/sessionStore.ts'
import type { TemplateConfig } from '../types/index.ts'
import type { Bay } from '../types/index.ts'
import { parseTemplate, serializeTemplate, DEFAULT_TEMPLATE } from '../utils/templateParser.ts'
import { listTemplates, saveTemplate, deleteTemplate, type StoredTemplate } from '../utils/storage.ts'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'

const store = useSessionStore()

// ─── New-session dialog ───────────────────────────────────────────────────────

const newDialogVisible = ref(false)
const newSessionName = ref('')
const templateText = ref(serializeTemplate(DEFAULT_TEMPLATE))
const templates = ref<StoredTemplate[]>([])
const selectedTemplateId = ref('')
const templateError = ref('')

function makeDefaultSessionName(now = new Date()): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

function openNewDialog() {
  newSessionName.value = makeDefaultSessionName()
  templates.value = listTemplates()
  if (templates.value.length === 0) {
    templateText.value = serializeTemplate(DEFAULT_TEMPLATE)
    selectedTemplateId.value = ''
  } else {
    selectedTemplateId.value = templates.value[0].id
    templateText.value = templates.value[0].text
  }
  templateError.value = ''
  newDialogVisible.value = true
}

const selectedTemplate = computed(() => templates.value.find((t) => t.id === selectedTemplateId.value) ?? null)

function selectTemplate(templateId: string) {
  const t = templates.value.find((it) => it.id === templateId)
  if (!t) return
  selectedTemplateId.value = templateId
  templateText.value = t.text
  templateError.value = ''
}

function saveSelectedTemplateText() {
  const current = selectedTemplate.value
  if (!current) return

  const now = new Date().toISOString()
  let nextName = current.name

  try {
    const parsed = parseTemplate(templateText.value)
    templateError.value = ''
    if (parsed.name.trim().length > 0) nextName = parsed.name.trim()
  } catch (e) {
    templateError.value = String(e)
  }

  const updated: StoredTemplate = {
    ...current,
    name: nextName,
    text: templateText.value,
    updatedAt: now,
  }
  saveTemplate(updated)

  const idx = templates.value.findIndex((t) => t.id === updated.id)
  if (idx !== -1) templates.value[idx] = updated
}

watch(templateText, () => {
  saveSelectedTemplateText()
})

function createTemplate() {
  const now = new Date()
  const timestamp = now.toISOString()
  const name = `Template ${makeDefaultSessionName(now)}`
  const parsed = parseTemplate(serializeTemplate(DEFAULT_TEMPLATE))
  parsed.name = name

  const created: StoredTemplate = {
    id: crypto.randomUUID(),
    name,
    text: serializeTemplate(parsed),
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  saveTemplate(created)
  templates.value = listTemplates()
  selectTemplate(created.id)
}

function removeTemplate(templateId: string) {
  if (templates.value.length <= 1) {
    alert('At least one template must exist.')
    return
  }
  if (!confirm('Delete this template?')) return

  const idx = templates.value.findIndex((t) => t.id === templateId)
  deleteTemplate(templateId)
  templates.value = listTemplates()

  if (selectedTemplateId.value === templateId) {
    const fallback = templates.value[Math.max(0, idx - 1)] ?? templates.value[0]
    if (fallback) selectTemplate(fallback.id)
  }
}

function exportTemplate() {
  const current = selectedTemplate.value
  if (!current) return
  const safeName = current.name.trim().replace(/\s+/g, '_') || 'template'
  const blob = new Blob([templateText.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}.fst`
  a.click()
  URL.revokeObjectURL(url)
}

function createSession() {
  templateError.value = ''
  let config: TemplateConfig
  try {
    config = parseTemplate(templateText.value)
  } catch (e) {
    templateError.value = String(e)
    return
  }

  if (!config.bays.length) {
    templateError.value = 'Template must define at least one bay.'
    return
  }

  const bays: Bay[] = config.bays.map((b) => ({ ...b, strips: [] }))
  store.createSession(newSessionName.value || 'Unnamed Session', selectedTemplate.value?.name ?? config.name, bays)
  newDialogVisible.value = false
}

// ─── Open existing session ────────────────────────────────────────────────────

function openSession(id: string) {
  store.openSession(id)
}

function deleteSession(id: string) {
  if (confirm('Delete this session? This cannot be undone.')) {
    store.removeSession(id)
  }
}

// ─── Import a session log ─────────────────────────────────────────────────────

function importLog() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.fsl,.txt'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      store.importLog(reader.result as string)
    }
    reader.readAsText(file)
  }
  input.click()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <div class="selector-container">
    <div class="selector-header">
      <h1 class="app-title">
        <span class="pi pi-send" /> FlightStrip
      </h1>
      <p class="app-subtitle">ATC Strip Management</p>
    </div>

    <div class="selector-actions">
      <Button label="New Session" icon="pi pi-plus" @click="openNewDialog" />
      <Button
        label="Import Log (.fsl)"
        icon="pi pi-upload"
        severity="secondary"
        @click="importLog"
      />
    </div>

    <div v-if="store.sessions.length === 0" class="empty-state">
      <span class="pi pi-inbox empty-icon" />
      <p>No sessions yet. Create a new one to get started.</p>
    </div>

    <div v-else class="session-list">
      <div
        v-for="session in store.sessions"
        :key="session.id"
        class="session-card"
        @click="openSession(session.id)"
      >
        <div class="session-info">
          <span class="session-name">{{ session.name }}</span>
          <span class="session-meta">
            Template: {{ session.templateName }} &nbsp;·&nbsp;
            Created: {{ formatDate(session.createdAt) }}
          </span>
          <span class="session-meta">
            Last updated: {{ formatDate(session.updatedAt) }}
          </span>
        </div>
        <div class="session-actions" @click.stop>
          <Button
            icon="pi pi-folder-open"
            text
            title="Open session"
            @click="openSession(session.id)"
          />
          <Button
            icon="pi pi-trash"
            text
            severity="danger"
            title="Delete session"
            @click="deleteSession(session.id)"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- New session dialog -->
  <Dialog
    v-model:visible="newDialogVisible"
    header="New Session"
    :modal="true"
    :style="{ width: '520px' }"
  >
    <div class="new-session-form">
      <label class="form-label">Session name</label>
      <InputText
        v-model="newSessionName"
        class="w-full"
        placeholder="e.g. Morning shift 2024-01-01"
      />

      <label class="form-label">
        Templates
        <span class="template-actions-inline">
          <Button label="New default" size="small" text icon="pi pi-plus" @click="createTemplate" />
          <Button label="Export .fst" size="small" text icon="pi pi-download" @click="exportTemplate" />
        </span>
      </label>

      <div class="template-list">
        <div
          v-for="template in templates"
          :key="template.id"
          class="template-item"
          :class="{ selected: selectedTemplateId === template.id }"
          @click="selectTemplate(template.id)"
        >
          <span class="template-name">{{ template.name }}</span>
          <Button
            icon="pi pi-trash"
            text
            severity="danger"
            title="Delete template"
            @click.stop="removeTemplate(template.id)"
          />
        </div>
      </div>

      <label class="form-label">Template text (auto-saved)</label>
      <Textarea
        v-model="templateText"
        class="w-full template-textarea"
        :rows="12"
        placeholder="Paste template text here…"
      />
      <p v-if="templateError" class="form-error">{{ templateError }}</p>

      <div class="template-hint">
        <strong>Template format (.fst):</strong> Plain text with
        <code>name=…</code> at the top, then one <code>[bay]</code> block per
        bay (<code>id</code>, <code>name</code>, <code>color</code>, <code>textColor</code>,
        <code>collapsed</code>, <code>order</code>).
      </div>
    </div>

    <template #footer>
      <Button label="Create" icon="pi pi-check" @click="createSession" />
    </template>
  </Dialog>
</template>

<style scoped>
.selector-container {
  max-width: 640px;
  margin: 80px auto;
  padding: 0 16px;
}

.selector-header {
  text-align: center;
  margin-bottom: 32px;
}

.app-title {
  font-size: 2.4rem;
  font-weight: 800;
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.app-subtitle {
  color: #757575;
  margin: 0;
}

.selector-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 32px;
}

.empty-state {
  text-align: center;
  color: #9e9e9e;
  padding: 48px 0;
}

.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.session-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  background: #fff;
}

.session-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-color: #90caf9;
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-name {
  font-weight: 700;
  font-size: 16px;
}

.session-meta {
  font-size: 12px;
  color: #9e9e9e;
}

.session-actions {
  display: flex;
  gap: 4px;
}

/* Form */
.new-session-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-label {
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.template-actions-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.template-list {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  max-height: 170px;
  overflow-y: auto;
  background: #fff;
}

.template-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid #eeeeee;
}

.template-item:last-child {
  border-bottom: none;
}

.template-item:hover {
  background: #f5f9ff;
}

.template-item.selected {
  background: #e3f2fd;
}

.template-name {
  font-size: 13px;
  font-weight: 600;
}

.template-textarea {
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.form-error {
  color: #e53935;
  font-size: 13px;
  margin: 0;
}

.template-hint {
  font-size: 12px;
  color: #757575;
  background: #f5f5f5;
  border-radius: 4px;
  padding: 8px 12px;
}

.w-full { width: 100%; }
</style>
