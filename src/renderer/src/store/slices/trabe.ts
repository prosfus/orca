import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { TrabeConnectionStatus, TrabeIncidencia } from '../../../../shared/types'
import type { CacheEntry } from './github'
import { trabeGetIssue, trabeListIssues, trabeStatus } from '@/runtime/runtime-trabe-client'

const CACHE_TTL = 60_000

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL
}

const inflightIncidenciaRequests = new Map<string, Promise<TrabeIncidencia | null>>()
const inflightListRequests = new Map<string, Promise<TrabeIncidencia[]>>()

// Read-only mirror of the Jira slice: connection status plus list/get caches.
// No mutations — Trabe incidencias are browse-only (docs/incidencia-diagnostics.md).
export type TrabeSlice = {
  trabeStatus: TrabeConnectionStatus
  trabeStatusChecked: boolean
  trabeIncidenciaCache: Record<string, CacheEntry<TrabeIncidencia | null>>
  trabeListCache: Record<string, CacheEntry<TrabeIncidencia[]>>

  checkTrabeConnection: () => Promise<void>
  listTrabeIncidencias: (limit?: number) => Promise<TrabeIncidencia[]>
  fetchTrabeIncidencia: (numero: number) => Promise<TrabeIncidencia | null>
}

export const createTrabeSlice: StateCreator<AppState, [], [], TrabeSlice> = (set, get) => ({
  trabeStatus: { connected: false },
  trabeStatusChecked: false,
  trabeIncidenciaCache: {},
  trabeListCache: {},

  checkTrabeConnection: async () => {
    try {
      const status = await trabeStatus()
      const prev = get().trabeStatus
      if (prev.connected !== status.connected || prev.error !== status.error) {
        set({ trabeStatus: status, trabeStatusChecked: true })
      } else if (!get().trabeStatusChecked) {
        set({ trabeStatusChecked: true })
      }
    } catch {
      if (get().trabeStatus.connected) {
        set({ trabeStatus: { connected: false }, trabeStatusChecked: true })
      } else if (!get().trabeStatusChecked) {
        set({ trabeStatusChecked: true })
      }
    }
  },

  listTrabeIncidencias: async (limit = 100) => {
    const cacheKey = `list::${limit}`
    const cached = get().trabeListCache[cacheKey]
    if (isFresh(cached)) {
      return cached.data ?? []
    }
    const inflight = inflightListRequests.get(cacheKey)
    if (inflight) {
      return inflight
    }
    const promise = trabeListIssues(limit)
      .then((incidencias) => {
        set((s) => ({
          trabeListCache: {
            ...s.trabeListCache,
            [cacheKey]: { data: incidencias, fetchedAt: Date.now() }
          }
        }))
        return incidencias
      })
      .finally(() => {
        inflightListRequests.delete(cacheKey)
      })
    inflightListRequests.set(cacheKey, promise)
    return promise
  },

  fetchTrabeIncidencia: async (numero) => {
    const cacheKey = String(numero)
    const cached = get().trabeIncidenciaCache[cacheKey]
    if (isFresh(cached)) {
      return cached.data
    }
    const inflight = inflightIncidenciaRequests.get(cacheKey)
    if (inflight) {
      return inflight
    }
    const promise = trabeGetIssue(numero)
      .then((incidencia) => {
        set((s) => ({
          trabeIncidenciaCache: {
            ...s.trabeIncidenciaCache,
            [cacheKey]: { data: incidencia, fetchedAt: Date.now() }
          }
        }))
        return incidencia
      })
      .catch((error) => {
        console.warn('[trabe] fetchTrabeIncidencia failed:', error)
        return null
      })
      .finally(() => {
        inflightIncidenciaRequests.delete(cacheKey)
      })
    inflightIncidenciaRequests.set(cacheKey, promise)
    return promise
  }
})
