<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useSessionStore } from '../stores/sessionStore.ts'
import FlightStrip from './FlightStrip.vue'
import type { Bay, Strip, StripColor } from '../types/index.ts'

const props = defineProps<{ bay: Bay }>()

const store = useSessionStore()

// VueDraggable needs a writable list; we proxy via computed to keep the store
// as the single source of truth.
const strips = computed({
  get: () => props.bay.strips,
  set: () => {
    // Handled by onUpdate / onAdd
  },
})

// Called when a strip is reordered *within* this bay
function onUpdate(evt: { oldIndex?: number; newIndex?: number }) {
  const { oldIndex, newIndex } = evt
  if (oldIndex === undefined || newIndex === undefined) return
  if (oldIndex === newIndex) return

  const strip = props.bay.strips[oldIndex]
  store.moveStrip(strip.id, props.bay.id, oldIndex, props.bay.id, newIndex)
}

// Called when a strip arrives from *another* bay (drag-between-bays)
function onAdd(evt: { item: HTMLElement; newIndex?: number; from: HTMLElement }) {
  // vue-draggable-plus already moved the DOM item; we need to sync the store.
  // The source bay id is stored in data-bay-id on the source list element.
  const fromBayId = evt.from.dataset['bayId']
  if (!fromBayId || fromBayId === props.bay.id) return

  const stripId = evt.item.dataset['stripId']
  if (!stripId) return

  const toIndex = evt.newIndex ?? props.bay.strips.length

  // Find the strip's current index in the destination bay (already moved by
  // the DOM library) so we pass correct indices.
  const actualToIdx = props.bay.strips.findIndex((s) => s.id === stripId)
  const effectiveToIdx = actualToIdx >= 0 ? actualToIdx : toIndex

  // Find source index in the source bay before the DOM mutation.
  // The DOM library has already moved it; we must look it up in the store.
  const sourceBay = store.activeSession?.bays.find((b) => b.id === fromBayId)
  if (!sourceBay) return
  const fromIndex = sourceBay.strips.findIndex((s) => s.id === stripId)

  store.moveStrip(stripId, fromBayId, fromIndex, props.bay.id, effectiveToIdx)
}

// ─── Add a blank strip to this bay ───────────────────────────────────────────

function addStrip() {
  const strip: Strip = {
    id: crypto.randomUUID(),
    registration: '',
    type: '',
    language: '',
    color: 'white' as StripColor,
    notes: '',
  }
  store.addStrip(props.bay.id, strip)
}
</script>

<template>
  <div class="bay-wrapper">
    <!-- Bay header -->
    <div class="bay-header" :style="{ background: bay.color }">
      <span class="bay-name">{{ bay.name }}</span>
      <span class="bay-count">{{ bay.strips.length }}</span>
    </div>

    <!-- Draggable strip list -->
    <VueDraggable
      v-model="strips"
      :data-bay-id="bay.id"
      group="strips"
      handle=".drag-handle"
      :animation="150"
      class="bay-strips"
      ghost-class="strip-ghost"
      chosen-class="strip-chosen"
      drag-class="strip-dragging"
      @update="onUpdate"
      @add="onAdd"
    >
      <FlightStrip
        v-for="strip in bay.strips"
        :key="strip.id"
        :strip="strip"
        :bay-id="bay.id"
        :data-strip-id="strip.id"
      />
    </VueDraggable>

    <!-- Add strip button -->
    <button class="bay-add-btn" @click="addStrip">
      <span class="pi pi-plus" />
      Add strip
    </button>
  </div>
</template>

<style scoped>
.bay-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 260px;
  max-width: 320px;
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #f5f5f5;
}

.bay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  color: #fff;
}

.bay-name {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.03em;
}

.bay-count {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 12px;
}

.bay-strips {
  flex: 1;
  padding: 8px;
  min-height: 60px;
  overflow-y: auto;
}

/* Drag states */
:deep(.strip-ghost) {
  opacity: 0.4;
  background: #cfe8ff;
}

:deep(.strip-chosen) {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

:deep(.strip-dragging) {
  opacity: 0.8;
}

.bay-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  background: none;
  border: none;
  border-top: 1px dashed #ccc;
  color: #757575;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}

.bay-add-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #333;
}
</style>
