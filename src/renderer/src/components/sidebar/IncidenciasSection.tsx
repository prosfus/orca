import React, { useEffect, useState } from 'react'
import { Stethoscope, FileText, SquareTerminal } from 'lucide-react'
import type { Diagnostico } from '../../../../shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import CommentMarkdown from './CommentMarkdown'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { cn } from '@/lib/utils'

// Why: mirrors the WorktreeCardMetadataStatusBadges tone recipe so diagnostic
// states read with the same visual language as the rest of the sidebar.
const STATUS_META: Record<Diagnostico['status'], { label: string; tone: string }> = {
  investigating: {
    label: 'Investigating',
    tone: 'border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-300'
  },
  ready: {
    label: 'Ready',
    tone: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300'
  },
  failed: {
    label: 'Failed',
    tone: 'border-rose-500/25 bg-rose-500/5 text-rose-600 dark:text-rose-300'
  }
}

function IncidenciaRow({
  diagnostico,
  onVerInforme,
  onOpenConsole
}: {
  diagnostico: Diagnostico
  onVerInforme: (diagnostico: Diagnostico) => void
  onOpenConsole: (worktreeId: string) => void
}): React.JSX.Element {
  const status = STATUS_META[diagnostico.status]
  // While investigating the worktree is live, so the row opens the agent's
  // console; once it finishes the worktree is gone and only the report remains.
  const liveWorktreeId = diagnostico.status === 'investigating' ? diagnostico.worktreeId : null
  const canVerInforme = diagnostico.markdown.length > 0
  const handleRowClick = (): void => {
    if (liveWorktreeId) {
      onOpenConsole(liveWorktreeId)
    } else if (canVerInforme) {
      onVerInforme(diagnostico)
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-worktree-sidebar-accent">
      <button
        type="button"
        disabled={!liveWorktreeId && !canVerInforme}
        onClick={handleRowClick}
        className="min-w-0 flex-1 truncate text-left text-xs text-foreground enabled:hover:underline disabled:cursor-default"
      >
        <span className="text-muted-foreground">#{diagnostico.incidenciaNumero}</span>{' '}
        {diagnostico.incidenciaAsunto}
      </button>
      <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', status.tone)}>
        {status.label}
      </Badge>
      {liveWorktreeId ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => onOpenConsole(liveWorktreeId)}
        >
          <SquareTerminal className="size-3" />
          Ver agente
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          disabled={!canVerInforme}
          onClick={() => onVerInforme(diagnostico)}
        >
          <FileText className="size-3" />
          Ver informe
        </Button>
      )}
    </div>
  )
}

function IncidenciasSection(): React.JSX.Element | null {
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([])
  const [openDiagnostico, setOpenDiagnostico] = useState<Diagnostico | null>(null)

  useEffect(() => {
    let cancelled = false
    const reload = (): void => {
      void window.api.diagnosticos.list().then((items) => {
        if (!cancelled) {
          setDiagnosticos(items)
        }
      })
    }
    reload()
    const unsubscribe = window.api.diagnosticos.onChanged(reload)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (diagnosticos.length === 0) {
    return null
  }

  return (
    // Why: shrink-0 keeps the section from being squeezed by a long worktree
    // list in the overflow-hidden sidebar column (same fix as the setup card).
    <div className="shrink-0 px-3 pb-2">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div className="flex size-4 shrink-0 items-center justify-center text-foreground">
          <Stethoscope className="size-3" />
        </div>
        <div className="min-w-0 truncate text-[13px] font-semibold leading-none">Incidencias</div>
        <span className="text-[11px] text-muted-foreground">{diagnosticos.length}</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {diagnosticos.map((diagnostico) => (
          <IncidenciaRow
            key={diagnostico.id}
            diagnostico={diagnostico}
            onVerInforme={setOpenDiagnostico}
            onOpenConsole={activateWorktreeFromSidebar}
          />
        ))}
      </div>

      <Sheet
        open={openDiagnostico !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenDiagnostico(null)
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-[640px]">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle className="pr-8">
              #{openDiagnostico?.incidenciaNumero} {openDiagnostico?.incidenciaAsunto}
            </SheetTitle>
            <SheetDescription>Informe de diagnóstico</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
            {openDiagnostico ? (
              <CommentMarkdown content={openDiagnostico.markdown} variant="document" />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default React.memo(IncidenciasSection)
