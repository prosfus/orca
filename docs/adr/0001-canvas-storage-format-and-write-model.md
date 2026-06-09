# ADR 0001 — Canvas: storage, file format, and write model

- Status: Accepted (design)
- Date: 2026-06-09
- Scope: the per-workspace "Canvas" feature (see `CONTEXT.md` → Canvas, Plan, Phase,
  Dependency, Status, Ready, Claim, Owner).

## Context

We are adding a per-workspace **Canvas**: an Obsidian-style spatial board that carries a
*plan* (tasks, phases, dependencies, status) which both agents and the human create, edit,
view, and use to organize work. Constraints that shaped the decision:

- **Personal-use, single-user** app (`AGENTS.md`) — pragmatic simplicity is allowed.
- **Multiple workspaces can share one physical directory** (folder-mode + repository-checkout
  workspace mode), so a per-directory filename is not unique per workspace.
- **SSH**: the worktree (and therefore the Canvas file and the agents) can live on a remote
  host while Orca runs locally.
- **Cross-platform** (macOS/Linux/Windows).
- **Agents are heterogeneous CLIs** (claude, codex, droid, gemini, …) in PTYs; not all speak
  MCP, but all can run a command.
- The **agent→Orca hook server is push-only** (`src/main/agent-hooks/server.ts`): agents
  cannot query Orca back.
- A separate **global Orchestration engine** already exists
  (`src/main/runtime/orchestration/`) — the Canvas must not be conflated with it.

## Decision

### D1 — Location: gitignored, per-workspace, keyed by `instanceId`

The Canvas is stored at `.orca/<instanceId>.canvas` inside the worktree, where `instanceId`
is the workspace instance key (`WorktreeMeta.instanceId`). `.orca/` is gitignored.

- Keying by `instanceId` (not by path) keeps it unique even when several workspaces share one
  physical directory.
- `instanceId` is **optional** in the model and is populated lazily with backfill
  (`src/main/persistence.ts` ~2961, ~3939). Therefore Orca **guarantees** the id (backfilling
  if absent) *before* deriving the Canvas path. The derivation reuses the existing
  per-instance identity helpers (`getRuntimeFolderWorkspaceInstanceId` et al.,
  `src/main/runtime/orca-runtime.ts:936`).
- Gitignored means the plan is local session state, never committed — so it **never produces
  git conflicts** on rebase/merge, and is not shared via the repo (acceptable: single-user).

### D2 — Format: JSON Canvas + scalar front-matter; relationships as edges/nodes

The file is a valid Obsidian **JSON Canvas** (`{ nodes, edges }`). The plan is layered on by
convention:

- **Task** = `text` node. Its markdown begins with a delimited `---…---` front-matter block
  holding **scalar** metadata only (`status`, `owner`, `priority`, optional `est`, optional
  `ref`), followed by the title and free body (description, acceptance-criteria checklist,
  notes). The front-matter is owned and written by the write layer (D4), so parsing is
  deterministic, not best-effort prose-scraping.
- **Dependency** = `edge` with an arrowhead, direction **prerequisite → dependent**. Never
  duplicated in front-matter.
- **Phase** = `group` node; membership is **geometric containment** (JSON Canvas has no
  parent/child field). The write layer owns group geometry.
- **Artifact link** = `file`/`link` node connected to a task by an edge.
- **Status → color**: stored as a JSON Canvas **preset** number (`1`–`6`), theme-agnostic and
  valid in Obsidian. Orca's renderer maps presets to the quiet design tokens
  (`docs/STYLEGUIDE.md`); raw color is not independently editable on a task — status owns it.
- **Task id** = the node `id` (stable across title edits), referenced by edges; the CLI mints
  human-readable stable slugs (e.g. `task-login`).

Graceful-degradation target for the front-matter is a **plain text editor**, not Obsidian's
canvas card renderer (which may show `---` as a rule). This is acceptable: Orca is the primary
editor and `.orca/` is hidden from Obsidian anyway.

### D3 — Authoring: a standalone, file-only CLI delivered via the existing installer

Agents (and humans, manually) mutate the Canvas through an `orca canvas …` CLI that operates
**only on the local `.canvas` file** — no network, no Orca connection. This is what makes it
SSH-safe: it runs where the worktree is.

- Delivery **reuses the agent-hooks managed-script installer**
  (`src/main/agent-hooks/installer-utils.ts`, `installer-utils-remote.ts`): scripts are
  installed under `~/.orca/…` locally and pushed to remotes over SFTP with exec mode, with
  `.sh` and `.cmd` variants. The CLI implementation is Node-based (Node-on-host is already an
  assumed capability for the existing remote hooks).
- The agent locates its file via an injected `ORCA_CANVAS_PATH` (and the CLI is reachable via
  injected path / PATH entry). These are injected at PTY spawn alongside the existing
  `ORCA_PANE_KEY/ORCA_TAB_ID/ORCA_WORKTREE_ID` — **every** spawn env site must set them
  (at least `src/main/runtime/orca-runtime.ts:11030` and `:11647`; audit for others).
- Run outside an agent pane (no env), the CLI requires an explicit `--file` (the shared
  directory may hold several `<instanceId>.canvas`).

### D4 — One locked, delta-based write layer shared by CLI and UI

There is a **single** write API; both the CLI and the Orca renderer use it. Every mutation is
a small scoped operation (`addTask`, `set`, `setStatus`, `setPosition`, `link/unlink`,
`addPhase`, `claim`, `release`, `removeTask`). Each op does:

> acquire exclusive lock → read fresh file → apply this delta → atomic write (temp + rename)
> → release lock.

- The Orca `'canvas'` tab (react-flow) is a **projection**, not an owner: it loads from the
  file, re-syncs on file-watch, and on user interaction issues the matching delta op. It never
  serializes its in-memory graph back wholesale. This is what prevents human-drag vs
  agent-write clobbering.
- Atomic temp+rename alone does **not** prevent the claim TOCTOU race; the **exclusive lock**
  does. Cross-platform advisory lock (`O_EXCL`/mkdir lockfile).

### D5 — Layout authority: CLI places only new nodes

The CLI computes coordinates **only when creating a new node** (finds free space near its
prerequisite) and **never moves an existing node**. Human drags are authoritative and
permanent. Any global re-layout ("auto-arrange", dagre) is **manual**, human-triggered only.
Combined with D4 this means the node a human is dragging is never moved underneath them by an
agent.

### D6 — Coordination: pull + atomic claim; readiness derived

- `Ready` is **derived** from edges (all prerequisites `done`), never stored.
- `orca canvas next` returns a Ready, `todo`, unowned task (ordered by priority then creation)
  — advisory; it may hand the same task to two agents.
- `orca canvas claim <task>` is the atomic gate (D4 lock): sets owner = pane key + status
  = in-progress, fails if already owned. Stale claims (dead pane) are recoverable via
  `release` / `claim --steal`; Orca surfaces dead-owner tasks in the UI.
- This is **pull** (agents pick), deliberately distinct from Orchestration's **push**
  (`dispatch`). The Canvas and Orchestration interoperate only later, if ever; v1 has no
  bridge.

### D7 — Lifecycle: lazy, empty

No file exists until the first write (first `add-task`, or the human's "create canvas").
`ORCA_CANVAS_PATH` is always injected (pointing at where it will be). No imposed template.

### D8 — Phasing

1. **Core (no UI):** format + locked delta write layer + CLI + lazy creation. Delivers the
   primary goal (agents follow a plan and self-organize); inspectable as the raw file.
2. **Viewer:** `'canvas'` tab with react-flow, read + status toggle.
3. **Editor:** drag / draw edges / inline edit through the delta layer + manual auto-arrange.

`react-flow`/`@xyflow` is a **new** dependency (not in `package.json` today) — deferring it to
phases 2–3 keeps the core light.

## Consequences

**Positive**

- Per-workspace identity survives shared directories; the plan never causes git conflicts.
- SSH/cross-platform is largely a *reuse* of existing installer + per-instance-id machinery,
  not new infrastructure.
- One write path ⇒ no dual-authority clobber; claim race is genuinely closed by the lock.
- Core value ships before the heavy UI.
- File degrades to human-readable plain text if Orca/CLI disappear.

**Negative / costs**

- A new CLI binary + lock protocol + JSON-Canvas-aware layout to build and keep cross-platform.
- Node-on-host is assumed (already true for remote hooks; documented as a constraint).
- Spatial phase membership means a human can re-phase a task by dragging it across a group
  boundary — intended, but must be taught/telegraphed in the UI.
- Front-matter `---` may render as a rule in Obsidian's canvas cards (Obsidian de-prioritized).

## Alternatives considered

- **Sidecar plan file** (`.plan.json` beside `.canvas`): clean schema but two files to keep in
  sync (race/inconsistency) and duplicates deps/phases. Rejected — single-file with the locked
  write layer is simpler and consistent.
- **Custom JSON fields on nodes** instead of front-matter: typed and queryable, but invisible
  without a custom renderer and stripped by Obsidian on save. Rejected in favor of
  text-editor-readable front-matter.
- **MCP server** for authoring: richer for MCP-native agents but uneven across our agents and
  awkward headless/over-SSH. Rejected for a universal CLI.
- **Active Orca coordinator** that pushes ready tasks to idle panes: duplicates Orchestration's
  push model per-workspace and enlarges surface. Rejected; kept pull.
- **Full react-flow editor first**: heaviest path, and the human would compete with computed
  layout before the core is proven. Rejected via phasing (D8).
- **Committing the Canvas to git**: would share/review the plan, but reintroduces merge
  conflicts and contradicts the per-workspace, single-user, session-state framing. Rejected.

## Open / deferred

- Delivery vehicle detail: Node script via managed-script install is the plan; a packaged
  static binary is a fallback if Node-on-host proves unreliable.
- `est` (estimation) is optional and low-value (LLM estimates are weak); acceptance-criteria
  checklist is the high-value Tier-C field.
- Snapshot-on-delete (app-data, keyed by `instanceId`) is a nice-to-have, **not** v1-critical.
- Friendly owner labels (mapping pane key → "Claude #1") are an Orca-side presentation concern.
