<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useSessionStore } from '../stores/sessionStore.ts'
import FlightStrip from './FlightStrip.vue'
import type { Bay, Strip, StripColor } from '../types/index.ts'

const props = defineProps<{ bay: Bay }>()

const store = useSessionStore()

const draggableKey = computed(() => `${props.bay.id}:${props.bay.strips.map((s) => s.id).join(',')}`)
const isTouchDevice = ref(false)
let touchMediaQuery: MediaQueryList | null = null

// VueDraggable needs a writable list; we proxy via computed to keep the store
// as the single source of truth.
const strips = computed({
  get: () => props.bay.strips,
  set: () => {
    // Handled by onUpdate / onAdd
  },
})

// Called when a strip is reordered *within* this bay
function onUpdate(evt: { oldIndex?: number; newIndex?: number; item: HTMLElement }) {
  const { oldIndex, newIndex } = evt
  if (oldIndex === undefined || newIndex === undefined) return
  if (oldIndex === newIndex) return

  const stripId = evt.item.dataset['stripId']
  if (!stripId) return

  store.moveStrip(stripId, props.bay.id, oldIndex, props.bay.id, newIndex)
}

// Called when a strip arrives from *another* bay (drag-between-bays)
function onAdd(evt: { item: HTMLElement; newIndex?: number; oldIndex?: number; from: HTMLElement }) {
  // vue-draggable-plus already moved the DOM item; we need to sync the store.
  // The source bay id is stored in data-bay-id on the source list element.
  const fromBayId = evt.from.dataset['bayId']
  if (!fromBayId || fromBayId === props.bay.id) return

  const stripId = evt.item.dataset['stripId']
  if (!stripId) return

  const toIndex = evt.newIndex ?? props.bay.strips.length
  const sourceBay = store.activeSession?.bays.find((b) => b.id === fromBayId)
  const fallbackFromIndex = sourceBay?.strips.findIndex((s) => s.id === stripId) ?? -1
  const fromIndex = evt.oldIndex ?? fallbackFromIndex
  if (fromIndex < 0) return

  store.moveStrip(stripId, fromBayId, fromIndex, props.bay.id, toIndex)
}

// ─── Add a blank strip to this bay ───────────────────────────────────────────

function addStrip() {
  const strip: Strip = {
    id: crypto.randomUUID(),
    registration: '',
    type: '',
    language: 'CZ',
    landingCount: 0,
    color: 'white' as StripColor,
    notes: '',
  }
  store.addStrip(props.bay.id, strip, 0)
}

function toggleCollapsed() {
  store.setBayCollapsed(props.bay.id, !props.bay.collapsed)
}

function updateTouchDeviceState() {
  isTouchDevice.value = touchMediaQuery?.matches ?? false
}

const dragHandle = computed(() => (isTouchDevice.value ? '.touch-drag-handle' : undefined))

onMounted(() => {
  touchMediaQuery = window.matchMedia('(hover: none), (pointer: coarse)')
  updateTouchDeviceState()
  touchMediaQuery.addEventListener('change', updateTouchDeviceState)
})

onBeforeUnmount(() => {
  touchMediaQuery?.removeEventListener('change', updateTouchDeviceState)
  touchMediaQuery = null
})
</script>

<template>
  <div class="bay-wrapper" :class="{ 'bay-collapsed': bay.collapsed }">
    <!-- Draggable strip list -->
    <VueDraggable
      :key="draggableKey"
      v-model="strips"
      :data-bay-id="bay.id"
      group="strips"
      :touch-start-threshold="4"
      :handle="dragHandle"
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
        :collapsed="bay.collapsed"
        :show-touch-handle="isTouchDevice"
      />
    </VueDraggable>

    <!-- Add strip button -->
    <button class="bay-add-btn" @click="addStrip">
      <span class="pi pi-plus" />
      Add strip
    </button>

    <!-- Bay header -->
    <div class="bay-header" :style="{ background: bay.color, color: bay.textColor }">
      <span class="bay-name">{{ bay.name }}</span>
      <div class="bay-header-right">
        <span class="bay-count">{{ bay.strips.length }}</span>
        <button
          class="collapse-btn"
          :title="bay.collapsed ? 'Expand bay' : 'Collapse bay'"
          @click="toggleCollapsed"
        >
          <span :class="['pi', bay.collapsed ? 'pi-angle-double-right' : 'pi-angle-double-left']" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bay-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 260px;
  min-height: 0;
  max-width: 320px;
  width: 300px;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #f5f5f5;
  transition: width 0.15s ease;
}

.bay-wrapper.bay-collapsed {
  width: 104px;
  min-width: 104px;
  max-width: 104px;
}

.bay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  color: #fff;
}

.bay-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
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

.collapse-btn {
  border: none;
  background: rgba(255, 255, 255, 0.28);
  color: inherit;
  border-radius: 4px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.42);
}

.bay-strips {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 8px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}

/* Keep strips visually anchored to bay bottom without shrinking them. */
.bay-strips::before {
  content: '';
  margin-top: auto;
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

.bay-collapsed :deep(.strip-ghost) {
  min-height: 46px;
  max-height: 46px;
  height: 46px;
  overflow: hidden;
}

.bay-collapsed :deep(.strip-dragging) {
  min-height: 46px;
  max-height: 46px;
  height: 46px;
  overflow: hidden;
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
