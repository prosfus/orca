# Orca — Context Glossary

Ubiquitous language for Orca. Definitions only — no implementation details, no specs.
For UI/visual rules see `docs/STYLEGUIDE.md`; for architecture see code + inline comments;
for hard, surprising decisions see `docs/adr/`.

## Core terms

### Worktree
A git checkout at a specific path (primary or linked). The unit of isolated work: one
branch, one directory, its own terminals and agents. Identified as `repoId::path`.

### Workspace
Orca's session state layered over a worktree (terminals, editors, tabs, browser).
Roughly 1:1 with a worktree. "Workspace" is the app-level view; "worktree" is the
git-level checkout underneath it.

### Agent
A coding CLI (Claude Code, Codex, Droid, Gemini, …) running inside a terminal (PTY) in a
worktree. Agents read and write the worktree's files directly with their own tools, and
report status back to Orca over HTTP hooks.

### Canvas  *(new — this initiative)*
A **per-workspace** spatial board — one per workspace instance, even when several
workspaces share the same physical directory — stored as an Obsidian-compatible
**JSON Canvas** file inside the worktree's gitignored `.orca/` directory, keyed by the
workspace `instanceId`. Agents and the human create, edit, and view it to plan and
organize that workspace's work. It is spatial and freeform — node positions are real — and
it carries a *plan*: tasks, phases, and dependencies. The semantic meaning (what is a task,
a phase, a dependency, a status) is layered onto JSON Canvas by convention (the "rules"),
not by a separate format. Distinct from **Orchestration** (below).

### Plan
The semantic layer the Canvas carries: the set of Canvas tasks, their phases, and the
dependencies between them, for one workspace. The Canvas is the spatial board; the Plan is
the meaning read off it (the "rules").

### Phase
A named stage of a Plan, drawn as a JSON Canvas group. A task belongs to the phase whose
group encloses it geometrically — JSON Canvas has no parent/child field, so spatial
containment is the only membership signal. Moving a task into or out of a group re-assigns
its phase (as in Obsidian).

### Dependency
A directed "must happen before" relation between two Canvas tasks, drawn as an arrow from
**prerequisite → dependent**. Dependencies live only as edges — never duplicated in a task's
metadata.

### Status
The *stored* lifecycle marker of one Canvas task: `todo`, `in-progress`, `blocked`, or
`done`. `blocked` is a **manual** "needs attention" flag set by an agent or human — it is
**not** the same as not being **Ready** (which is derived from dependencies). Status is the
machine-truth for "where this task stands" and is mirrored to the node's color.

### Ready
A **derived** property (computed from the dependency edges, never stored): a task is ready
when every prerequisite is `done`. Same meaning as the orchestration "ready" state, but
Canvas readiness is *pulled* (an agent picks it) rather than *pushed* by a coordinator.
Independent of **Status** — a `todo` task may not yet be ready.

### Claim
The act of an agent taking ownership of a ready Canvas task — atomically (under an exclusive
lock) setting its owner to itself and status to in-progress, failing if already owned. The
mechanism by which several agents in one workspace avoid working the same task.

### Owner
The agent currently responsible for a Canvas task, set by a **Claim**. Identity is the
agent's pane key (`ORCA_PANE_KEY` = `tabId:leafId`) — which is per-session, so an owner can
go stale if its pane dies. A task can be **released** (owner cleared) or re-claimed
(*stolen*) once its claim is stale, so a dead owner never deadlocks the plan.

### Artifact link
A `file` or `link` JSON Canvas node (a repo file, or an issue/PR/URL) connected by an edge
to a Canvas task — the real thing the task touches. General rule: scalar metadata lives in
the task's front-matter; *relationships* (dependencies, artifacts) live as edges/nodes.

## Boundary with existing terms — do not collide

### Orchestration  *(existing)*
A separate, **global**, CLI-driven engine (`src/main/runtime/orchestration/`) that
dispatches work across agents and worktrees via a coordinator and a single global task DAG
(`orchestration.db`). It has no visual surface. The **Canvas is not** the orchestration
engine: Canvas is per-worktree, file-based, agent-authored, and visual. They may
interoperate later, but they are distinct concepts and must not be conflated.

### Task — disambiguate
- **Canvas task**: a node in a Canvas plan (this initiative).
- **Orchestration task**: a row in the global orchestration DAG with `deps`, `status`, and
  a dispatch lifecycle (existing).
- **Work item**: an *external* tracker issue/PR (GitHub/GitLab/Linear/Jira) (existing).

Always qualify "task" until context makes it unambiguous.

## Incidencia diagnostics  *(new — this initiative)*

A bridge to **Trabe** (the construction ERP, repo folder `LiBuilding`, context `# Trabe`):
when a support **Incidencia** enters Trabe, Orca auto-launches a read-only coding agent that
investigates and writes an explanation. Trabe is a separate context — see its own
`CONTEXT.md`; the canonical glossary entry for **Agente de diagnóstico** lives there.

### Incidencia
A support ticket originating in Trabe (`Incidencia` model). In Orca it is a **work item** of
a new task provider (**Trabe**), surfaced in the *Tasks* view alongside GitHub/GitLab/Linear/
Jira. Both how Orca *detects* new ones and how the agent *investigates* them read Trabe's
database directly (Orca via hard read-only SELECTs; the agent more broadly) — see
ADR-0002 / ADR-0003.

### Agente de diagnóstico (diagnostic agent)
The coding agent Orca auto-launches for a new **Incidencia** to gather information, explain
what is happening, and propose a solution. By design it is **read-only toward Trabe** — it
reads code + the incidencia + related real data and produces only its markdown; it does not
modify the product, push, or write back (the read-only property is *prompt-enforced*, not
credential-enforced — see ADR-0003). It is **ephemeral** (its worktree is harvested for the
markdown, then cleaned). Distinct from a Trabe *agente* (a human support person).
_Avoid_: bare "agent", automation, triage bot.

### Diagnóstico (diagnosis run)
The dedicated, ephemeral run record for one launch of an **Agente de diagnóstico**: its status
(investigating / ready / failed) and its final **markdown**, stored locally in Orca. Not an
`AutomationRun` and not a persistent **Workspace**.

### Incidencias section
A dedicated sidebar section at the bottom of the worktree sidebar listing **Diagnósticos**.
Kept **separate from the Workspaces list** on purpose — diagnostic worktrees are hidden from
Workspaces and shown only here.
