<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/sessionStore.ts'
import type { TemplateConfig } from '../types/index.ts'
import type { Bay } from '../types/index.ts'
import { parseTemplate, serializeTemplate, DEFAULT_TEMPLATE } from '../utils/templateParser.ts'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'

const store = useSessionStore()

// ─── New-session dialog ───────────────────────────────────────────────────────

const newDialogVisible = ref(false)
const newSessionName = ref('')
const templateText = ref(serializeTemplate(DEFAULT_TEMPLATE))
const templateError = ref('')

function openNewDialog() {
  newSessionName.value = 'Session ' + new Date().toLocaleDateString()
  templateText.value = serializeTemplate(DEFAULT_TEMPLATE)
  templateError.value = ''
  newDialogVisible.value = true
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
  store.createSession(newSessionName.value || 'Unnamed Session', config.name, bays)
  newDialogVisible.value = false
}

// ─── Load from file ───────────────────────────────────────────────────────────

function loadTemplateFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.fst,.txt'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      templateText.value = reader.result as string
    }
    reader.readAsText(file)
  }
  input.click()
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
        Template
        <button class="load-file-btn" @click="loadTemplateFile">
          <span class="pi pi-folder-open" /> Load .fst file
        </button>
      </label>
      <Textarea
        v-model="templateText"
        class="w-full template-textarea"
        :rows="12"
        placeholder="Paste or load a template (.fst) file…"
      />
      <p v-if="templateError" class="form-error">{{ templateError }}</p>

      <div class="template-hint">
        <strong>Template format (.fst):</strong> Plain text with
        <code>name=…</code> at the top, then one <code>[bay]</code> block per
        bay (<code>id</code>, <code>name</code>, <code>color</code>,
        <code>order</code>).
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

.load-file-btn {
  background: none;
  border: 1px solid #90caf9;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
  color: #1e88e5;
}

.load-file-btn:hover { background: #e3f2fd; }

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
