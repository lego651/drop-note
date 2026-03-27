import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { ItemSummary } from '@/lib/items'

export function useRealtimeItems(userId: string) {
  const [newItems, setNewItems] = useState<ItemSummary[]>([])
  const [updatedItems, setUpdatedItems] = useState<ItemSummary[]>([])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`items:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => setNewItems((prev) => [payload.new as ItemSummary, ...prev])
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'items',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => setUpdatedItems((prev) => {
          const updated = payload.new as ItemSummary
          const idx = prev.findIndex((i) => i.id === updated.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          return [...prev, updated]
        })
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return { newItems, updatedItems }
}
