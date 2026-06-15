import React, { useEffect, useState } from 'react'
import { Stethoscope, FileText, MoreHorizontal, SquarePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Diagnostico } from '../../../../shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { DiagnosticoDetailSheet } from './DiagnosticoDetailSheet'
import { DIAGNOSTICO_STATUS_META } from './diagnostico-status-meta'
import { formatRelative } from './diagnostico-format'

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

// Seed text for a promoted workspace: incidencia header + the gathered diagnosis
// as reference, plus the implement instruction.
function buildWorkspaceSeed(diagnostico: Diagnostico): string {
  return [
    `Incidencia #${diagnostico.incidenciaNumero} — ${diagnostico.incidenciaAsunto}`,
    '',
    'Diagnóstico recopilado (solo referencia):',
    '',
    diagnostico.markdown.trim() || '(sin informe)',
    '',
    'Implementa la solución propuesta en el diagnóstico.'
  ].join('\n')
}

function IncidenciaRow({
  diagnostico,
  onView,
  onCreateWorkspace,
  onDiscard
}: {
  diagnostico: Diagnostico
  onView: (diagnostico: Diagnostico) => void
  onCreateWorkspace: (diagnostico: Diagnostico) => void
  onDiscard: (diagnostico: Diagnostico) => void
}): React.JSX.Element {
  const status = DIAGNOSTICO_STATUS_META[diagnostico.status]
  const investigating = diagnostico.status === 'investigating'
  // Open the panel while investigating (live progress streams in) or once there's
  // a report/output to read.
  const canOpen = investigating || diagnostico.markdown.length > 0 || diagnostico.events.length > 0
  const handleRowClick = (): void => {
    if (canOpen) {
      onView(diagnostico)
    }
  }
  return (
    <div className="group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-worktree-sidebar-accent">
      <button
        type="button"
        disabled={!canOpen}
        onClick={handleRowClick}
        className="min-w-0 flex-1 text-left enabled:hover:underline disabled:cursor-default"
      >
        <div className="truncate text-xs text-foreground">
          <span className="text-muted-foreground">#{diagnostico.incidenciaNumero}</span>{' '}
          {diagnostico.incidenciaAsunto}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {formatRelative(diagnostico.finishedAt ?? diagnostico.createdAt)}
        </div>
      </button>
      <Badge variant="outline" className={cn('shrink-0 px-1.5 py-0 text-[10px]', status.tone)}>
        {status.label}
      </Badge>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 px-1 text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="Acciones de la incidencia"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem disabled={!canOpen} onSelect={() => onView(diagnostico)}>
            <FileText className="size-3.5" />
            {investigating ? 'Ver progreso' : 'Ver informe'}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={diagnostico.status !== 'ready'}
            onSelect={() => onCreateWorkspace(diagnostico)}
          >
            <SquarePlus className="size-3.5" />
            Crear workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDiscard(diagnostico)}
          >
            <Trash2 className="size-3.5" />
            Descartar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function IncidenciasSection(): React.JSX.Element | null {
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([])
  const [openDiagnostico, setOpenDiagnostico] = useState<Diagnostico | null>(null)
  const repos = useAppStore((s) => s.repos)
  const trabeEnvFilePath = useAppStore((s) => s.settings?.trabeEnvFilePath)
  const trabeRepoPath = useAppStore((s) => s.settings?.trabeRepoPath)
  const trabeBaseBranch = useAppStore((s) => s.settings?.trabeBaseBranch)
  const trabeDeepLinkBase = useAppStore((s) => s.settings?.trabeDeepLinkBase)
  const openModal = useAppStore((s) => s.openModal)

  useEffect(() => {
    let cancelled = false
    const reload = (): void => {
      void window.api.diagnosticos.list().then((items) => {
        if (cancelled) {
          return
        }
        setDiagnosticos(items)
        // Keep an open panel live as the agent streams events / finishes.
        setOpenDiagnostico((current) =>
          current ? (items.find((entry) => entry.id === current.id) ?? null) : current
        )
        // Self-heal: any worktree backing a diagnostic must read as origin
        // 'incidencia' so it stays out of the Workspaces list.
        useAppStore.setState((s) => {
          let changed = false
          const next = { ...s.worktreeLineageById }
          for (const entry of items) {
            const lineage = entry.worktreeId ? next[entry.worktreeId] : undefined
            if (lineage && lineage.origin !== 'incidencia') {
              next[entry.worktreeId as string] = { ...lineage, origin: 'incidencia' }
              changed = true
            }
          }
          return changed ? { worktreeLineageById: next } : {}
        })
      })
    }
    reload()
    const unsubscribe = window.api.diagnosticos.onChanged(reload)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const discard = (diagnostico: Diagnostico): void => {
    // Stop the agent if it's still running; its worktree is removed when the run
    // settles, so best-effort remove here too in case it outlives the record.
    if (diagnostico.status === 'investigating') {
      void window.api.diagnosticos.cancel(diagnostico.id)
    }
    if (diagnostico.worktreeId) {
      void useAppStore.getState().removeWorktree(diagnostico.worktreeId, true)
    }
    void window.api.diagnosticos.delete(diagnostico.id)
    setOpenDiagnostico((current) => (current?.id === diagnostico.id ? null : current))
  }

  const clearCompleted = (): void => {
    for (const entry of diagnosticos) {
      if (entry.status !== 'investigating') {
        if (entry.worktreeId) {
          void useAppStore.getState().removeWorktree(entry.worktreeId, true)
        }
        void window.api.diagnosticos.delete(entry.id)
      }
    }
  }

  const copyReport = (diagnostico: Diagnostico): void => {
    void navigator.clipboard.writeText(diagnostico.markdown)
    toast.success('Informe copiado al portapapeles')
  }

  const diagnoseLatest = (): void => {
    void window.api.diagnosticos.triggerLatest().then((res) => {
      if (res.ok) {
        toast.success('Diagnóstico lanzado para la última incidencia abierta.')
      } else {
        toast.error(res.error ?? 'No se pudo lanzar el diagnóstico.')
      }
    })
  }

  // Promote a diagnostic to a real workspace: open the New Workspace composer
  // prefilled with the Trabe repo + base branch, seeding the agent with the
  // incidencia + diagnosis via linkedContext (treated as reference data).
  const createWorkspace = (diagnostico: Diagnostico): void => {
    const target = trabeRepoPath ? normalizeRepoPath(trabeRepoPath) : null
    const repo = target ? repos.find((entry) => normalizeRepoPath(entry.path) === target) : null
    if (!repo) {
      toast.error('No se encontró el repo de Trabe registrado en Orca.')
      return
    }
    const url = trabeDeepLinkBase
      ? `${trabeDeepLinkBase.replace(/\/$/, '')}/incidencias/${diagnostico.incidenciaNumero}`
      : ''
    openModal('new-workspace-composer', {
      initialRepoId: repo.id,
      prefilledName: `inc-${diagnostico.incidenciaNumero}-fix`,
      ...(trabeBaseBranch ? { initialBaseBranch: trabeBaseBranch } : {}),
      telemetrySource: 'sidebar',
      linkedWorkItem: {
        type: 'issue',
        number: diagnostico.incidenciaNumero,
        title: diagnostico.incidenciaAsunto,
        url,
        linkedContext: {
          provider: 'trabe',
          version: 1,
          renderedText: buildWorkspaceSeed(diagnostico)
        }
      }
    })
  }

  // Show the section (header + actions) whenever Trabe is configured, so the
  // manual "Diagnosticar" trigger stays reachable even before any diagnostic.
  if (diagnosticos.length === 0 && !trabeEnvFilePath) {
    return null
  }

  const hasCompleted = diagnosticos.some((entry) => entry.status !== 'investigating')

  return (
    // Why: shrink-0 keeps the section from being squeezed by a long worktree
    // list in the overflow-hidden sidebar column (same fix as the setup card).
    <div className="shrink-0 px-3 pb-2">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div className="flex size-4 shrink-0 items-center justify-center text-foreground">
          <Stethoscope className="size-3" />
        </div>
        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-none">
          Incidencias
        </div>
        <span className="text-[11px] text-muted-foreground">{diagnosticos.length}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0 px-1 text-muted-foreground"
              aria-label="Acciones de incidencias"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={diagnoseLatest}>
              <Stethoscope className="size-3.5" />
              Diagnosticar última incidencia
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!hasCompleted} onSelect={clearCompleted}>
              <Trash2 className="size-3.5" />
              Limpiar terminadas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-sleek">
        {diagnosticos.map((diagnostico) => (
          <IncidenciaRow
            key={diagnostico.id}
            diagnostico={diagnostico}
            onView={setOpenDiagnostico}
            onCreateWorkspace={createWorkspace}
            onDiscard={discard}
          />
        ))}
      </div>

      <DiagnosticoDetailSheet
        diagnostico={openDiagnostico}
        onOpenChange={(open) => {
          if (!open) {
            setOpenDiagnostico(null)
          }
        }}
        onCreateWorkspace={createWorkspace}
        onCopy={copyReport}
        onDiscard={discard}
      />
    </div>
  )
}

export default React.memo(IncidenciasSection)
