<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from './stores/sessionStore.ts'
import SessionSelector from './components/SessionSelector.vue'
import StripBay from './components/StripBay.vue'
import Button from 'primevue/button'

const store = useSessionStore()

const session = computed(() => store.activeSession)
const canUndo = computed(() => store.undoStack.length > 0)

// ─── Keyboard shortcut ────────────────────────────────────────────────────────

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    store.undo()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

// ─── Sorted bays ─────────────────────────────────────────────────────────────

const sortedBays = computed(() =>
  session.value ? [...session.value.bays].sort((a, b) => a.order - b.order) : [],
)
</script>

<template>
  <!-- ── Session selector ── -->
  <template v-if="!session">
    <SessionSelector />
  </template>

  <!-- ── Active session view ── -->
  <template v-else>
    <div class="session-layout">
      <!-- Header -->
      <header class="session-header">
        <div class="header-left">
          <Button
            icon="pi pi-arrow-left"
            text
            title="Back to session list"
            @click="store.closeSession()"
          />
          <h1 class="session-title">{{ session.name }}</h1>
          <span class="session-template">{{ session.templateName }}</span>
        </div>
        <div class="header-right">
          <Button
            label="Undo"
            icon="pi pi-undo"
            text
            :disabled="!canUndo"
            title="Undo last action (Ctrl+Z)"
            @click="store.undo()"
          />
          <Button
            label="Export log"
            icon="pi pi-download"
            text
            severity="secondary"
            title="Download session log (.fsl)"
            @click="store.exportLog()"
          />
        </div>
      </header>

      <!-- Bays -->
      <main class="bays-container">
        <StripBay
          v-for="bay in sortedBays"
          :key="bay.id"
          :bay="bay"
        />
      </main>
    </div>
  </template>
</template>

<style>
/* ── Global reset / base ── */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fafafa;
  color: #212121;
  height: 100%;
}

#app {
  height: 100%;
}
</style>

<style scoped>
.session-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.session-template {
  font-size: 12px;
  color: #9e9e9e;
  margin-left: 4px;
}

.bays-container {
  display: flex;
  flex: 1;
  gap: 16px;
  padding: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  align-items: flex-start;
}
</style>
