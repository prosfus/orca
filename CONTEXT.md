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
