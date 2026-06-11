import type { TrabeConnectionStatus, TrabeIncidencia } from '../../../shared/types'

// Why: unlike Jira there is no remote-runtime RPC path — Trabe's read-only DB
// is resolved from local main-process settings (trabeEnvFilePath), so every
// call goes through the local preload bridge regardless of the active runtime.

export async function trabeStatus(): Promise<TrabeConnectionStatus> {
  return window.api.trabe.status()
}

export async function trabeListIssues(limit?: number): Promise<TrabeIncidencia[]> {
  return window.api.trabe.listIssues(limit !== undefined ? { limit } : undefined)
}

export async function trabeGetIssue(numero: number): Promise<TrabeIncidencia | null> {
  return window.api.trabe.getIssue({ numero })
}
