import { useState } from 'react'
import type { GlobalSettings, TuiAgent } from '../../../../shared/types'
import { Input } from '../ui/input'
import {
  NumberField,
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSubsectionHeader
} from './SettingsFormControls'

type IncidenciasSettingsSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

// Local-draft text row: commit on blur/Enter so typing a path doesn't flush
// settings to disk on every keystroke.
function PathSettingRow({
  label,
  description,
  value,
  placeholder,
  onCommit
}: {
  label: string
  description: string
  value: string
  placeholder?: string
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    setDraft(value)
  }
  const commit = (): void => {
    if (draft.trim() !== value) {
      onCommit(draft.trim())
    }
  }
  return (
    <SettingsRow
      label={label}
      description={description}
      alignTop
      control={
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit()
            }
          }}
          className="w-72 text-xs"
        />
      }
    />
  )
}

const AGENT_OPTIONS: readonly { value: TuiAgent; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' }
]

/** Settings for the read-only Trabe incidencia diagnostics subsystem. */
export function IncidenciasSettingsSection({
  settings,
  updateSettings
}: IncidenciasSettingsSectionProps): React.JSX.Element {
  const agent: TuiAgent = settings.diagnosticoAgent ?? 'claude'

  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title="Diagnóstico de incidencias (Trabe)"
        description="Orca detecta incidencias nuevas en la BD de Trabe (solo lectura) y lanza un agente de diagnóstico por cada una. Configura el acceso y el comportamiento aquí."
      />
      <PathSettingRow
        label="Ruta del .env de Trabe"
        description="Fichero .env con DATABASE_URL. Se lee en solo lectura para detectar incidencias y se inyecta en el worktree del agente."
        value={settings.trabeEnvFilePath ?? ''}
        placeholder="…/LiBuilding/.env.LiBuilding"
        onCommit={(value) => updateSettings({ trabeEnvFilePath: value || undefined })}
      />
      <PathSettingRow
        label="Ruta del repo de Trabe"
        description="Carpeta del repositorio de Trabe (LiBuilding) desde la que se crean los worktrees efímeros de diagnóstico."
        value={settings.trabeRepoPath ?? ''}
        placeholder="C:/Users/…/LiBuilding"
        onCommit={(value) => updateSettings({ trabeRepoPath: value || undefined })}
      />
      <PathSettingRow
        label="Rama base"
        description="Rama del repo de Trabe sobre la que diagnostica el agente. Vacío = rama por defecto del repo."
        value={settings.trabeBaseBranch ?? ''}
        placeholder="main"
        onCommit={(value) => updateSettings({ trabeBaseBranch: value || undefined })}
      />
      <PathSettingRow
        label="URL base de deep-link"
        description="Base para enlazar a la incidencia en Trabe (se le añade /incidencias/<número>)."
        value={settings.trabeDeepLinkBase ?? ''}
        placeholder="https://trabe.…/app"
        onCommit={(value) => updateSettings({ trabeDeepLinkBase: value || undefined })}
      />
      <SettingsRow
        label="Agente de diagnóstico"
        description="CLI que investiga cada incidencia (el lanzamiento es automático, sin selector al vuelo)."
        control={
          <SettingsSegmentedControl
            value={agent}
            onChange={(value) => updateSettings({ diagnosticoAgent: value })}
            options={AGENT_OPTIONS}
            ariaLabel="Agente de diagnóstico"
          />
        }
      />
      <NumberField
        label="Diagnósticos simultáneos"
        description="Máximo de agentes de diagnóstico en paralelo (cola anti-avalancha)."
        value={settings.diagnosticoConcurrency ?? 2}
        defaultValue={2}
        min={1}
        max={10}
        onChange={(value) => updateSettings({ diagnosticoConcurrency: value })}
      />
      <NumberField
        label="Intervalo de sondeo"
        description="Cada cuánto consulta Orca la BD de Trabe en busca de incidencias nuevas."
        value={settings.diagnosticoPollIntervalMs ?? 30000}
        defaultValue={30000}
        min={5000}
        max={600000}
        step={1000}
        onChange={(value) => updateSettings({ diagnosticoPollIntervalMs: value })}
        suffix="ms"
      />
    </section>
  )
}
