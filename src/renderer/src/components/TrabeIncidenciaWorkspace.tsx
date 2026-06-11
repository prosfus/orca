import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Clipboard, ExternalLink, LoaderCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { VisuallyHidden } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { TrabeIncidencia } from '../../../shared/types'
import { translate } from '@/i18n/i18n'

type TrabeIncidenciaWorkspaceProps = {
  incidencia: TrabeIncidencia | null
  onClose: () => void
}

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function formatRelativeTime(input: string): string {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return 'recently'
  }
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000)
  if (Math.abs(diffMinutes) < 60) {
    return relativeFormatter.format(diffMinutes, 'minute')
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return relativeFormatter.format(diffHours, 'hour')
  }
  return relativeFormatter.format(Math.round(diffHours / 24), 'day')
}

function trabeStateClass(state: string): string {
  if (state === 'abierta') {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200'
  }
  return 'border-border/50 bg-muted/40 text-muted-foreground'
}

async function copyTextToClipboard(text: string, label: string): Promise<void> {
  try {
    await window.api.ui.writeClipboardText(text)
    toast.success(
      translate('auto.components.TrabeIncidenciaWorkspace.copied', '{{value0}} copied', {
        value0: label
      })
    )
  } catch {
    toast.error(
      translate('auto.components.TrabeIncidenciaWorkspace.copyFailed', 'Failed to copy {{value0}}', {
        value0: label.toLowerCase()
      })
    )
  }
}

// Read-only mirror of JiraIssueWorkspace: Trabe incidencias are browse-only,
// so there are no transitions, edits, or comments — just metadata + deep link.
export default function TrabeIncidenciaWorkspace({
  incidencia,
  onClose
}: TrabeIncidenciaWorkspaceProps): React.JSX.Element {
  const fetchTrabeIncidencia = useAppStore((s) => s.fetchTrabeIncidencia)
  const [fullIncidencia, setFullIncidencia] = useState<TrabeIncidencia | null>(null)
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  const displayed = fullIncidencia ?? incidencia

  useEffect(() => {
    if (!incidencia) {
      setFullIncidencia(null)
      setLoading(false)
      return
    }
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setFullIncidencia(incidencia)
    setLoading(true)
    void fetchTrabeIncidencia(incidencia.numero)
      .then((result) => {
        if (requestId === requestIdRef.current && result) {
          setFullIncidencia(result)
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false)
        }
      })
  }, [fetchTrabeIncidencia, incidencia])

  const actionItems = useMemo(() => {
    if (!displayed) {
      return []
    }
    const items = [
      {
        label: translate('auto.components.TrabeIncidenciaWorkspace.copyNumero', 'Copy number'),
        icon: Clipboard,
        action: () => void copyTextToClipboard(String(displayed.numero), 'Number')
      }
    ]
    if (displayed.url) {
      items.unshift(
        {
          label: translate('auto.components.TrabeIncidenciaWorkspace.openInTrabe', 'Open in Trabe'),
          icon: ExternalLink,
          action: () => void window.api.shell.openUrl(displayed.url)
        },
        {
          label: translate('auto.components.TrabeIncidenciaWorkspace.copyUrl', 'Copy URL'),
          icon: Clipboard,
          action: () => void copyTextToClipboard(displayed.url, 'URL')
        }
      )
    }
    return items
  }, [displayed])

  const metadataRows = useMemo(() => {
    if (!displayed) {
      return []
    }
    return [
      {
        label: translate('auto.components.TrabeIncidenciaWorkspace.priority', 'Priority'),
        value: displayed.priority
      },
      {
        label: translate('auto.components.TrabeIncidenciaWorkspace.category', 'Category'),
        value: displayed.category ?? '—'
      },
      {
        label: translate('auto.components.TrabeIncidenciaWorkspace.project', 'Project'),
        value: displayed.proyectoNombre ?? '—'
      },
      {
        label: translate('auto.components.TrabeIncidenciaWorkspace.company', 'Company'),
        value: displayed.empresaNombre ?? '—'
      }
    ]
  }, [displayed])

  return (
    <Sheet open={incidencia !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[min(92vw,640px)] p-0 sm:max-w-[640px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <VisuallyHidden.Root asChild>
          <SheetTitle>
            {displayed?.title ??
              translate('auto.components.TrabeIncidenciaWorkspace.sheetTitle', 'Trabe incidencia')}
          </SheetTitle>
        </VisuallyHidden.Root>
        <VisuallyHidden.Root asChild>
          <SheetDescription>
            {translate(
              'auto.components.TrabeIncidenciaWorkspace.sheetDescription',
              'Read-only preview of the selected Trabe incidencia.'
            )}
          </SheetDescription>
        </VisuallyHidden.Root>

        {displayed ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            <div className="flex-none border-b border-border/50 bg-muted/30 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="font-mono">#{displayed.numero}</span>
                    {displayed.proyectoNombre ? <span>{displayed.proyectoNombre}</span> : null}
                    <span>{formatRelativeTime(displayed.updatedAt)}</span>
                    {loading ? <LoaderCircle className="size-3 animate-spin" /> : null}
                  </div>
                  <h2 className="mt-1 text-[20px] font-semibold leading-tight text-foreground">
                    {displayed.title}
                  </h2>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={onClose}
                      aria-label={translate(
                        'auto.components.TrabeIncidenciaWorkspace.closePreview',
                        'Close Trabe incidencia preview'
                      )}
                    >
                      <X className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {translate('auto.components.TrabeIncidenciaWorkspace.close', 'Close')}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-2.5">
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  trabeStateClass(displayed.state)
                )}
              >
                {displayed.state}
              </span>
              {displayed.labels.map((label) => (
                <span
                  key={label}
                  className="max-w-[160px] truncate rounded-full border border-border/50 bg-muted/35 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_228px]">
              <div className="min-h-0 overflow-y-auto scrollbar-sleek">
                <section className="px-4 py-4">
                  <dl className="grid gap-3">
                    {metadataRows.map((row) => (
                      <div key={row.label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                        <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          {row.label}
                        </dt>
                        <dd className="min-w-0 truncate text-sm text-foreground">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </div>

              <aside className="border-t border-border/50 bg-muted/20 px-3 py-3 xl:border-l xl:border-t-0">
                <div className="grid gap-1">
                  {actionItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <Tooltip key={item.label}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={item.action}
                            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                          >
                            <Icon className="size-3.5 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" sideOffset={6}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </aside>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
