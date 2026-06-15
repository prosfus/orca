import React from 'react'
import { Clock, RefreshCw, Wrench, ArrowUp, ArrowDown, CircleDollarSign } from 'lucide-react'
import type { Diagnostico } from '../../../../shared/types'
import { formatDuration, formatTokens, formatCost } from './diagnostico-format'

function Chip({
  icon: Icon,
  value,
  title
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  title: string
}): React.JSX.Element {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
    >
      <Icon className="size-3" />
      {value}
    </span>
  )
}

// Compact run-stat chips. Duration + tool count are always shown (live while
// investigating); turns/tokens/cost appear once the agent reports them.
export function DiagnosticoRunStats({
  diagnostico,
  elapsedMs
}: {
  diagnostico: Diagnostico
  elapsedMs: number
}): React.JSX.Element {
  const stats = diagnostico.stats
  const durationMs = stats?.durationMs ?? elapsedMs
  const toolCalls = stats?.toolCalls ?? diagnostico.events.filter((e) => e.kind === 'tool').length

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip icon={Clock} value={formatDuration(durationMs)} title="Duración" />
      <Chip icon={Wrench} value={String(toolCalls)} title="Herramientas usadas" />
      {typeof stats?.numTurns === 'number' ? (
        <Chip icon={RefreshCw} value={`${stats.numTurns}`} title="Turnos" />
      ) : null}
      {typeof stats?.inputTokens === 'number' ? (
        <Chip icon={ArrowUp} value={formatTokens(stats.inputTokens)} title="Tokens de entrada" />
      ) : null}
      {typeof stats?.outputTokens === 'number' ? (
        <Chip icon={ArrowDown} value={formatTokens(stats.outputTokens)} title="Tokens de salida" />
      ) : null}
      {typeof stats?.costUsd === 'number' ? (
        <Chip icon={CircleDollarSign} value={formatCost(stats.costUsd)} title="Coste estimado" />
      ) : null}
    </div>
  )
}
