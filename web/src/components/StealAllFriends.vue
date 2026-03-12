<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useFriendStore } from '@/stores/friend'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import api from '@/api'

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const accountStore = useAccountStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const toastStore = useToastStore()

const { currentAccountId } = storeToRefs(accountStore)
const { friends, loading } = storeToRefs(friendStore)
const { status } = storeToRefs(statusStore)

const stealing = ref(false)
const showResults = ref(false)
const results = ref<Array<{ gid: string, name: string, count: number, success: boolean, error?: string }>>([])

// 可偷取的好友列表（有成熟作物可偷）
const stealableFriends = computed(() => {
  return friends.value.filter((friend: any) => {
    const plant = friend.plant || {}
    return plant.stealNum && plant.stealNum > 0
  }).map((friend: any) => ({
    gid: friend.gid,
    name: friend.name || `GID:${friend.gid}`,
    stealNum: friend.plant?.stealNum || 0,
  }))
})

const totalStealable = computed(() => {
  return stealableFriends.value.reduce((sum: number, f: any) => sum + f.stealNum, 0)
})

async function stealAll() {
  if (!currentAccountId.value || stealing.value)
    return

  if (stealableFriends.value.length === 0) {
    toastStore.warning('没有可偷取的好友')
    return
  }

  stealing.value = true
  showResults.value = false
  results.value = []

  const successList: Array<{ gid: string, name: string, count: number, success: boolean, error?: string }> = []

  for (const friend of stealableFriends.value) {
    try {
      const res = await api.post(`/api/friend/${friend.gid}/op`, { opType: 'steal' }, {
        headers: { 'x-account-id': currentAccountId.value },
      })

      if (res.data?.ok) {
        const stealCount = res.data.data?.stealCount || friend.stealNum
        successList.push({
          gid: String(friend.gid),
          name: friend.name,
          count: stealCount,
          success: true,
        })
      }
      else {
        successList.push({
          gid: String(friend.gid),
          name: friend.name,
          count: 0,
          success: false,
          error: res.data?.error || '未知错误',
        })
      }
    }
    catch (e: any) {
      successList.push({
        gid: String(friend.gid),
        name: friend.name,
        count: 0,
        success: false,
        error: e?.response?.data?.error || e?.message || '请求失败',
      })
    }

    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  results.value = successList
  showResults.value = true
  stealing.value = false

  const successCount = successList.filter(r => r.success).length
  const totalCount = successList.reduce((sum, r) => sum + r.count, 0)
  toastStore.success(`偷取完成: ${successCount}/${successList.length} 位好友, 共获得 ${totalCount} 个作物`)

  // 刷新好友列表
  if (currentAccountId.value) {
    await friendStore.fetchFriends(currentAccountId.value)
    emit('refresh')
  }
}

function closeResults() {
  showResults.value = false
}
</script>

<template>
  <div v-if="status?.connection?.connected && friends.length > 0" class="mb-4 rounded-lg bg-white p-4 shadow dark:bg-gray-800">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="i-carbon-run text-lg text-orange-500" />
        <h3 class="text-lg font-medium">
          一键偷取
        </h3>
        <span v-if="stealableFriends.length > 0" class="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
          {{ stealableFriends.length }} 位好友可偷
        </span>
      </div>
      <button
        class="rounded bg-orange-500 px-4 py-2 text-sm text-white transition disabled:cursor-not-allowed hover:bg-orange-600 disabled:opacity-60"
        :disabled="stealing || loading || stealableFriends.length === 0"
        @click="stealAll"
      >
        {{ stealing ? '偷取中...' : '一键偷取所有好友' }}
      </button>
    </div>

    <div v-if="stealableFriends.length > 0 && !showResults" class="mt-3 text-sm text-gray-500 dark:text-gray-400">
      可偷取 {{ stealableFriends.length }} 位好友，预计获得 {{ totalStealable }} 个作物
    </div>

    <!-- 结果弹窗 -->
    <div
      v-if="showResults"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="closeResults"
    >
      <div class="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
            偷取结果
          </h3>
          <button
            class="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700"
            @click="closeResults"
          >
            <div class="i-carbon-close text-xl" />
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="result in results"
            :key="result.gid"
            class="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40"
          >
            <div class="flex items-center gap-2">
              <div
                class="h-8 w-8 flex items-center justify-center rounded-full"
                :class="result.success ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'"
              >
                <div v-if="result.success" class="i-carbon-checkmark" />
                <div v-else class="i-carbon-close" />
              </div>
              <div>
                <div class="font-medium text-gray-800 dark:text-gray-200">
                  {{ result.name }}
                </div>
                <div v-if="!result.success" class="text-xs text-red-500">
                  {{ result.error }}
                </div>
              </div>
            </div>
            <div v-if="result.success" class="text-sm font-bold text-green-600 dark:text-green-400">
              +{{ result.count }}
            </div>
          </div>
        </div>

        <div class="mt-4 border-t border-gray-100 pt-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          共偷取 {{ results.filter(r => r.success).length }} 位好友，获得 {{ results.reduce((sum, r) => sum + r.count, 0) }} 个作物
        </div>
      </div>
    </div>
  </div>
</template>