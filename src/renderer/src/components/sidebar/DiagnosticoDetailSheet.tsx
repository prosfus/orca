import React, { useEffect, useRef, useState } from 'react'
import { X, ExternalLink, SquarePlus, Copy, Trash2, ChevronRight } from 'lucide-react'
import type { Diagnostico } from '../../../../shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { AgentIcon } from '@/lib/agent-catalog'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { cn } from '@/lib/utils'
import CommentMarkdown from './CommentMarkdown'
import { DiagnosticoActivityTimeline } from './DiagnosticoActivityTimeline'
import { DiagnosticoRunStats } from './DiagnosticoRunStats'
import { DIAGNOSTICO_STATUS_META } from './diagnostico-status-meta'
import { formatRelative } from './diagnostico-format'

function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

export function DiagnosticoDetailSheet({
  diagnostico,
  onOpenChange,
  onCreateWorkspace,
  onCopy,
  onDiscard
}: {
  diagnostico: Diagnostico | null
  onOpenChange: (open: boolean) => void
  onCreateWorkspace: (diagnostico: Diagnostico) => void
  onCopy: (diagnostico: Diagnostico) => void
  onDiscard: (diagnostico: Diagnostico) => void
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement>(null)
  const investigating = diagnostico?.status === 'investigating'
  const eventCount = diagnostico?.events.length ?? 0

  // Tick once a second so the live elapsed time advances while investigating.
  useEffect(() => {
    if (!investigating) {
      return
    }
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [investigating])

  // Follow the live timeline, but only when the user is already near the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !investigating) {
      return
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [eventCount, investigating])

  if (!diagnostico) {
    return <Sheet open={false} onOpenChange={onOpenChange} />
  }

  const status = DIAGNOSTICO_STATUS_META[diagnostico.status]
  const meta = diagnostico.incidencia
  const elapsedMs = (diagnostico.finishedAt ?? now) - diagnostico.createdAt
  const metaChips = [meta.empresaNombre, meta.proyectoNombre, meta.moduloAfectado].filter(Boolean)
  const hasContext = Boolean(diagnostico.prompt || meta.descripcion)

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        // Why: on Windows the OS window controls live in the top-right titlebar
        // strip; inset the content so its header/close don't sit under them.
        className={cn(
          'flex w-full flex-col sm:max-w-[720px]',
          CLIENT_PLATFORM === 'win32' && 'pt-9'
        )}
      >
        <SheetHeader className="relative gap-2 border-b border-border/60">
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="xs"
              className="absolute top-2 right-2 px-1 text-muted-foreground hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </Button>
          </SheetClose>
          <div className="flex items-center gap-2 pr-8">
            <Badge
              variant="outline"
              className={cn('shrink-0 gap-1 px-1.5 py-0 text-[10px]', status.tone)}
            >
              {investigating ? (
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
              ) : null}
              {status.label}
            </Badge>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <AgentIcon agent={diagnostico.agentCli} size={12} />
              {diagnostico.stats?.model ?? diagnostico.agentCli}
            </span>
            <span className="text-[11px] text-muted-foreground">
              · {formatRelative(diagnostico.finishedAt ?? diagnostico.createdAt)}
            </span>
          </div>
          <SheetTitle className="pr-8 text-sm leading-snug">
            <span className="text-muted-foreground">#{diagnostico.incidenciaNumero}</span>{' '}
            {diagnostico.incidenciaAsunto}
          </SheetTitle>
          {metaChips.length > 0 || meta.url ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
              {metaChips.join(' · ')}
              {meta.url ? (
                <Button
                  variant="link"
                  size="xs"
                  className="h-auto gap-1 px-0 text-[11px]"
                  onClick={() => meta.url && void window.api.shell.openUrl(meta.url)}
                >
                  <ExternalLink className="size-3" />
                  Abrir en Trabe
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-sleek p-4"
        >
          <DiagnosticoRunStats diagnostico={diagnostico} elapsedMs={elapsedMs} />

          {hasContext ? (
            <Collapsible className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                Prompt y contexto
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {meta.descripcion ? (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Descripción reportada
                    </p>
                    <p className="whitespace-pre-wrap text-xs text-foreground/90">
                      {meta.descripcion}
                    </p>
                  </div>
                ) : null}
                {diagnostico.prompt ? (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Prompt inicial
                    </p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-2 text-[11px] leading-snug scrollbar-sleek">
                      {diagnostico.prompt}
                    </pre>
                  </div>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          <section className="space-y-1">
            {investigating ? (
              <>
                <SectionLabel>Actividad del agente</SectionLabel>
                <DiagnosticoActivityTimeline events={diagnostico.events} investigating />
              </>
            ) : (
              <Collapsible defaultOpen={!diagnostico.markdown}>
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                  <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                  Actividad del agente ({diagnostico.events.length} pasos)
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1">
                  <DiagnosticoActivityTimeline events={diagnostico.events} investigating={false} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </section>

          {diagnostico.status === 'failed' && diagnostico.error ? (
            <p className="rounded-md border border-rose-500/25 bg-rose-500/5 p-2 text-xs text-rose-600 dark:text-rose-300">
              {diagnostico.error}
            </p>
          ) : null}

          {diagnostico.markdown ? (
            <>
              <Separator />
              <section className="space-y-2">
                <SectionLabel>Informe</SectionLabel>
                <CommentMarkdown content={diagnostico.markdown} variant="document" />
              </section>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border/60 p-3">
          <Button
            size="sm"
            disabled={diagnostico.status !== 'ready'}
            onClick={() => onCreateWorkspace(diagnostico)}
          >
            <SquarePlus className="size-3.5" />
            Crear workspace
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!diagnostico.markdown}
            onClick={() => onCopy(diagnostico)}
          >
            <Copy className="size-3.5" />
            Copiar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => onDiscard(diagnostico)}
          >
            <Trash2 className="size-3.5" />
            Descartar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
