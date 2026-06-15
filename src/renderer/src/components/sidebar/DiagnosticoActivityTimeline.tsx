import React from 'react'
import { Sparkles } from 'lucide-react'
import type { DiagnosticoEvent } from '../../../../shared/types'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { toolIcon } from './diagnostico-tool-icon'

function ToolRow({ event }: { event: DiagnosticoEvent }): React.JSX.Element {
  const Icon = toolIcon(event.tool ?? '')
  const row = (
    <div className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 leading-snug">
        <span className="text-xs font-medium text-foreground">{event.tool}</span>{' '}
        {event.summary ? (
          <code className="break-all text-[11px] text-muted-foreground">{event.summary}</code>
        ) : null}
      </div>
    </div>
  )
  if (!event.result) {
    return row
  }
  // Decision: show a short result preview on hover (steps + result previews).
  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <div className="cursor-default">{row}</div>
      </HoverCardTrigger>
      <HoverCardContent className="max-w-md">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Resultado
        </p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug scrollbar-sleek">
          {event.result}
        </pre>
      </HoverCardContent>
    </HoverCard>
  )
}

function TextRow({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="flex items-start gap-2 px-2 py-1">
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-500/70" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
        {text}
      </p>
    </div>
  )
}

export function DiagnosticoActivityTimeline({
  events,
  investigating
}: {
  events: DiagnosticoEvent[]
  investigating: boolean
}): React.JSX.Element {
  if (events.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {investigating ? 'Esperando los primeros pasos del agente…' : 'Sin actividad registrada.'}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      {events.map((event, index) => {
        const key = `${event.at}-${index}`
        if (event.kind === 'tool') {
          return <ToolRow key={key} event={event} />
        }
        if (event.kind === 'note') {
          return (
            <p key={key} className="px-2 py-0.5 text-[11px] text-muted-foreground/80">
              <code className="break-all">{event.text}</code>
            </p>
          )
        }
        return <TextRow key={key} text={event.text ?? ''} />
      })}
      {investigating ? (
        <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-500" />
          investigando…
        </div>
      ) : null}
    </div>
  )
}
