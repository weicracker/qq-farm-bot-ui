import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useRadishStore = defineStore('radish', () => {
  const count = ref(0)
  const target = ref(500)
  const loading = ref(false)
  const resetting = ref(false)

  async function fetchRadishCounter(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const res = await api.get('/api/radish-counter', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data?.ok) {
        count.value = res.data.data?.count || 0
        target.value = res.data.data?.target || 500
      }
    }
    catch (e) {
      console.error('获取白萝卜计数失败', e)
    }
    finally {
      loading.value = false
    }
  }

  async function resetRadishCounter(accountId: string) {
    if (!accountId)
      return false
    resetting.value = true
    try {
      const res = await api.post('/api/radish-counter/reset', {}, {
        headers: { 'x-account-id': accountId },
      })
      if (res.data?.ok) {
        count.value = res.data.data?.count || 0
        target.value = res.data.data?.target || 500
        return true
      }
      return false
    }
    catch (e) {
      console.error('重置白萝卜计数失败', e)
      return false
    }
    finally {
      resetting.value = false
    }
  }

  return {
    count,
    target,
    loading,
    resetting,
    fetchRadishCounter,
    resetRadishCounter,
  }
})
