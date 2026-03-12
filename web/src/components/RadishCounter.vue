<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useRadishStore } from '@/stores/radish'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'

const accountStore = useAccountStore()
const radishStore = useRadishStore()
const statusStore = useStatusStore()
const toastStore = useToastStore()

const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { count, target, loading, resetting } = storeToRefs(radishStore)
const { status } = storeToRefs(statusStore)

const progress = computed(() => {
  if (target.value <= 0)
    return 0
  return Math.min(100, Math.round((count.value / target.value) * 100))
})

const remaining = computed(() => Math.max(0, target.value - count.value))

const isComplete = computed(() => count.value >= target.value)

async function handleReset() {
  if (!currentAccountId.value)
    return
  const ok = await radishStore.resetRadishCounter(currentAccountId.value)
  if (ok) {
    toastStore.success('已重置白萝卜计数器，下次种植将从0开始计数')
  }
  else {
    toastStore.error('重置失败')
  }
}

async function loadCounter() {
  if (currentAccountId.value && currentAccount.value?.running && status.value?.connection?.connected) {
    await radishStore.fetchRadishCounter(currentAccountId.value)
  }
}

onMounted(() => {
  loadCounter()
})

watch([currentAccountId, () => status.value?.connection?.connected], () => {
  loadCounter()
})
</script>

<template>
  <div v-if="status?.connection?.connected" class="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="i-carbon-plant text-lg text-orange-500" />
        <h3 class="text-lg font-medium">
          白萝卜种植计数
        </h3>
      </div>
      <button
        class="rounded bg-orange-100 px-3 py-1.5 text-xs text-orange-600 transition disabled:cursor-not-allowed dark:bg-orange-900/30 hover:bg-orange-200 dark:text-orange-300 disabled:opacity-60 dark:hover:bg-orange-900/50"
        :disabled="resetting"
        @click="handleReset"
      >
        {{ resetting ? '重置中...' : '重置计数' }}
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-4">
      <div class="i-svg-spinners-90-ring-with-bg text-xl text-orange-500" />
    </div>

    <div v-else>
      <div class="mb-2 flex items-center justify-between text-sm">
        <span class="text-gray-500 dark:text-gray-400">
          已种植 <span class="font-bold text-orange-600 dark:text-orange-400">{{ count }}</span> / {{ target }} 棵
        </span>
        <span v-if="isComplete" class="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600 dark:bg-green-900/30 dark:text-green-400">
          已完成
        </span>
        <span v-else class="text-gray-400">
          剩余 {{ remaining }} 棵
        </span>
      </div>

      <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div
          class="h-full rounded-full transition-all duration-500"
          :class="isComplete ? 'bg-green-500' : 'bg-orange-500'"
          :style="{ width: `${progress}%` }"
        />
      </div>

      <div v-if="isComplete" class="mt-2 text-xs text-green-600 dark:text-green-400">
        已完成种植 {{ target }} 棵白萝卜的目标
      </div>
      <div v-else class="mt-2 text-xs text-gray-400">
        优先种植白萝卜，直到达到 {{ target }} 棵
      </div>
    </div>
  </div>
</template>
