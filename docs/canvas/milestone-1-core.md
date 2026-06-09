# Canvas — Milestone 1 (Core, no UI) — Implementation Plan

> "Milestone 1" = the implementation phase called **Fase 1 / Hito 1** in conversation.
> The word *phase* is reserved for the Canvas domain concept (a group). This doc says
> **milestone** for delivery stages to avoid the clash.

Design decisions this plan implements: see [`docs/adr/0001-canvas-storage-format-and-write-model.md`](../adr/0001-canvas-storage-format-and-write-model.md)
and the glossary in [`CONTEXT.md`](../../CONTEXT.md) (Canvas, Plan, Phase, Dependency, Status,
Ready, Claim, Owner, Artifact link).

## 1. Goal & scope

**Goal:** agents (and the human, via CLI) can create, follow, and self-organize around a
per-workspace plan stored as a JSON Canvas file — with **no Orca UI yet**. This milestone alone
delivers the core intent ("agents follow a task plan and organize themselves").

**In scope**
- The file format (JSON Canvas + scalar front-matter) and a shared library to read/write it.
- One locked, delta-based write layer (the single write path for everything later).
- The `orca canvas` CLI (standalone, file-only, SSH/cross-platform), delivered via the
  existing managed-script installer.
- `ORCA_CANVAS_PATH` + `ORCA_CANVAS_BIN` env injection and an `instanceId` guarantee.
- Lazy creation (first write makes the file).
- Pull coordination: readiness derivation + atomic `claim`/`release`.

**Out of scope (Milestone 2/3)**
- The `'canvas'` tab, react-flow, any rendering, drag/inline editing, auto-arrange.
- Snapshot-on-delete, friendly owner labels, orchestration bridge.

**Exit criterion:** two agents in the same workspace can, concurrently and without stepping on
each other, list ready tasks, claim them, create tasks/dependencies/phases, and mark progress —
verifiable from the raw `.canvas` file and `orca canvas show`. A second concurrent `claim` of the
same task fails atomically.

## 2. Architecture at a glance

```
agent PTY (local or remote host)
  └─ orca canvas <cmd>            # standalone Node bundle, file-only, no network
       └─ src/shared/canvas/*     # parse · layout · lock · delta write   (electron-free)
            └─ .orca/<instanceId>.canvas   (lives on the SAME host's local disk)

Orca main (local)
  └─ injects ORCA_CANVAS_PATH + ORCA_CANVAS_BIN at PTY spawn
  └─ installs the CLI bundle+wrapper (local fs / remote SFTP) via the managed-script installer
```

**Key invariant (keeps locking simple):** every writer of a given canvas file is *co-located*
with the file on the same host's local disk. On a remote worktree, the writers are the
remote-side `orca canvas` processes; Orca never writes a remote canvas file across the wire.
So a same-host atomic lock is sufficient — no distributed locking.

## 3. Data model & file format

The file is a valid Obsidian **JSON Canvas**: `{ "nodes": [...], "edges": [...] }`.

### 3.1 Task = `text` node
The node `text` is markdown that begins with a YAML front-matter block (scalars only), then the
title and free body:

```
---
status: in-progress        # todo | in-progress | blocked | done   (required)
owner: "tabA1b2:leafC3d4"  # ORCA_PANE_KEY of the claimer; absent if unclaimed
claimedAt: 2026-06-09T10:00:00Z   # set on claim; for stale detection
priority: high             # low | normal | high   (optional, default normal)
est: 2h                    # optional, free string (low value — see ADR)
ref: "#482"                # optional scalar: a primary tracker ref
---
# Implementar login
Validar credenciales contra la API.

- [ ] valida credenciales
- [ ] maneja error 401
```

- **Scalars only** in front-matter. Relationships are never here (deps = edges; artifacts = nodes).
- The write layer **owns** the front-matter block; the body below it is free text the CLI sets
  but does not re-template.
- Node `id` = the Canvas task id: a slug minted from the title at creation
  (`implementar-login`), de-duplicated with a numeric suffix, **frozen** across title edits.
  Edges reference these ids.

### 3.2 Dependency = `edge`
`{ id, fromNode: <prerequisite id>, toNode: <dependent id>, toEnd: "arrow" }`.
Direction is **prerequisite → dependent**. Dependencies exist only as edges.

### 3.3 Phase = `group` node
A `group` node with a `label`. Membership is **geometric**: a task is in the phase whose group
rectangle encloses its node (JSON Canvas has no parent field). The write layer owns group
geometry (creating/growing the rect; see §6).

### 3.4 Artifact link = `file` / `link` node
Optional `file` (repo-relative path) or `link` (URL/issue/PR) node connected to a task by an
edge. Not required in Milestone 1's CLI surface beyond `link`/`unlink` to arbitrary nodes; the
visual affordance lands in Milestone 2.

### 3.5 Status → color (preset, theme-agnostic)
Stored as a JSON Canvas color **preset** so the file stays theme-agnostic; Orca later maps
presets to quiet tokens.

| status | preset | meaning |
|---|---|---|
| `todo` | *(none)* | not started |
| `in-progress` | `3` (yellow) | being worked |
| `blocked` | `1` (red) | manual "needs attention" |
| `done` | `4` (green) | complete |

Color is derived from status; it is never an independent source of truth.

### 3.6 Readiness (derived, never stored)
`ready(T)` ⇔ for every edge with `toNode == T`, the `fromNode` task has `status == done`.
Independent of status: a `todo` task may be not-ready.

## 4. Shared library — `src/shared/canvas/`

Electron-free, Node-built-ins + `yaml`/`zod` only (so the CLI bundles cleanly and main can reuse
it). Focused modules (no `utils`/`helpers` names; keep each within the line cap):

| Module | Responsibility |
|---|---|
| `json-canvas-types.ts` | JSON Canvas `Node`/`Edge`/`Canvas` types + the color-preset enum. |
| `canvas-task.ts` | Front-matter ⇄ task model: parse/serialize the `---…---` block (`yaml`), `zod`-validate the scalar schema, split/join the markdown body. |
| `canvas-document.ts` | Load → parse JSON → typed model; serialize back. Pure, no I/O. |
| `canvas-file-lock.ts` | Cross-process advisory lock via atomic `mkdir`/`open('wx')`; stale-break by age + dead-pid; always releases. |
| `canvas-store.ts` | **The single write API** (§5). Each op: lock → read fresh → apply delta → atomic temp+rename → unlock. Reuses the `crash-report-store.ts:163` temp+rename idiom. |
| `canvas-layout.ts` | New-node placement (free-space scan near the prerequisite) and group geometry (create/grow phase rects). Never moves existing nodes. |
| `canvas-coordination.ts` | Readiness derivation; `next` selection (ready + todo + unowned, ordered priority→file order); claim/release/steal rules + stale-claim policy. |
| `canvas-path.ts` | `deriveCanvasPath(worktreePath, instanceId)` and the status↔preset map. |

## 5. The write layer (`canvas-store.ts`)

One API, used by the CLI now and by the Orca UI in later milestones. Every mutation is a small
delta; **no caller ever rewrites the whole file from in-memory state.**

Operations: `createTask`, `setTaskFields` (status/priority/est/ref/title/body), `removeTask`,
`linkDependency`/`unlinkDependency`, `createPhase`, `claimTask`, `releaseTask`.

Protocol per op:
1. Acquire the exclusive lock for this file (`canvas-file-lock.ts`); block/retry with backoff;
   break the lock if stale.
2. Read + parse the current file fresh (create empty `{nodes:[],edges:[]}` if absent — lazy creation).
3. Apply the delta to the model (validate with `zod`).
4. Serialize and **atomic-write** (temp in same dir → `fs.rename`).
5. Release the lock.

`claim` is the only op whose *correctness* depends on the lock (read-modify-write of `owner`);
atomic rename alone cannot prevent a double-claim.

## 6. Layout (`canvas-layout.ts`)

- **New task, no deps:** place at the canvas origin region, first free slot.
- **New task with deps:** place to the right of its latest prerequisite; scan for a
  non-overlapping rectangle (fixed default node size).
- **Phase membership on create:** if `--phase P` is given, place the node inside `P`'s group
  rect, growing the rect if needed; create the group if `P` doesn't exist.
- **Never** reposition an existing node (human drags are authoritative — enforced from day one
  even though dragging arrives in Milestone 3).

## 7. The CLI — `src/canvas-cli/`

`src/canvas-cli/index.ts`: `#!/usr/bin/env node`, `main()` exported, run-as-main guard. Arg
parsing reuses the in-house pattern from `src/cli/args.ts:21` (no new dep).

**File resolution:** read `ORCA_CANVAS_PATH` from env; if absent (manual run), require `--file`.
The shared directory may hold several `<instanceId>.canvas`, so there is no auto-pick.

**Identity:** `owner` comes from `ORCA_PANE_KEY`; an optional `ORCA_AGENT_LABEL` may be recorded
for display.

**Commands** (each prints human text by default, machine JSON with `--json` for agents):

| Command | Behavior |
|---|---|
| `add-task "<title>" [--phase P] [--after <id>…] [--priority …] [--ref …] [--est …] [--desc …]` | Creates a task (lazy-creates the file), links `--after` prerequisites, places it (§6). Prints the new id. |
| `set <id> [--title …] [--desc …] [--priority …] [--ref …] [--est …]` | Edits scalar fields / title / body. |
| `set-status <id> <todo\|in-progress\|blocked\|done>` | Sets status (+ mirrors color). |
| `link <prereqId> <dependentId>` / `unlink …` | Adds/removes a dependency edge. |
| `add-phase "<label>"` | Creates an empty phase group. |
| `next [--mine] [--phase P]` | Prints the next ready + todo + unowned task (priority→file order). Advisory — may return the same task to two callers. |
| `claim <id>` | Atomically sets owner=pane + status=in-progress; **fails if already owned** (unless stale). |
| `release <id>` / `claim <id> --steal` | Clears / forcibly takes a (stale) claim. |
| `remove-task <id>` | Removes the task and its edges; refuses if it has dependents unless `--force`. |
| `show <id>` / `list [--ready] [--mine] [--phase P]` | Reads the plan. |

Exit codes: `0` success; non-zero on validation error / claim conflict / missing file, so agents
can branch on failure.

## 8. Coordination semantics

- `next` is a pure read (ready + todo + unowned), ordered by priority then file order.
- `claim` is the atomic gate (§5 lock). Owner = `ORCA_PANE_KEY`; `claimedAt` = now.
- **Stale claims:** since the file-only CLI can't check pane liveness, staleness is time-based
  + explicit. `claim` on an *owned* task fails unless the existing claim is older than the stale
  window (default 30 min) or `--steal` is passed; `release` always clears. (Liveness-based
  release by Orca lands in Milestone 3.)
- This is **pull**, deliberately distinct from orchestration's **push** (`dispatch`). No bridge.

## 9. Wiring into Orca main

### 9.1 `instanceId` guarantee + path
- `canvas-path.ts: deriveCanvasPath(worktreePath, instanceId)` →
  `path.join(worktreePath, '.orca', `${instanceId}.canvas`)`.
- At the two runtime spawn sites, `worktree: ResolvedWorktree` already guarantees `instanceId`
  (via `computeResolvedWorktrees` → `setWorktreeMeta` backfill, `persistence.ts:2961`).
- At the IPC site, only `worktreeId` is present → resolve `instanceId` through the store and
  backfill if missing, so the path always resolves.

### 9.2 Env injection (3 sites — not centralized)
Add `ORCA_CANVAS_PATH` (+ `ORCA_CANVAS_BIN`, the wrapper path) alongside the existing
`ORCA_PANE_KEY/ORCA_TAB_ID/ORCA_WORKTREE_ID`:
- `src/main/runtime/orca-runtime.ts:11030-11035`
- `src/main/runtime/orca-runtime.ts:11647-11651`
- `src/main/ipc/pty.ts:2067-2085` (and the `buildSpawnEnv` path at `pty.ts:1005`)

`.orca/` is already auto-gitignored by Orca's worktree setup; the CLI also `mkdir`s `.orca/` on
first write defensively.

## 10. Delivery (build + install)

### 10.1 Build a single-file bundle
- `src/canvas-cli/index.ts` imports only `src/shared/canvas/*` (electron-free).
- Add `build:canvas-cli` (`config/scripts/build-canvas-cli.mjs`) using **esbuild**
  (`platform:node, format:esm, bundle:true`) → `out/canvas-cli/orca-canvas.mjs`, a single
  portable file (includes `yaml`/`zod`). Wire it into the main build. *(Fallback if bundling
  deps is undesirable: drop `yaml`/`zod` and parse with built-ins.)*

### 10.2 Install via the existing managed-script machinery
- New `src/main/canvas/managed-canvas-cli-installer.ts` registered in
  `MANAGED_AGENT_HOOK_INSTALLERS` (`managed-agent-hook-controls.ts:21`), with `install()` and
  `installRemote()`:
  - Write the bundle + a thin wrapper to `~/.orca/canvas/` via `writeManagedScript`
    (`installer-utils.ts:164`) locally and `writeManagedScriptRemote` (`installer-utils-remote.ts:93`)
    over SFTP.
  - Wrapper: `.sh` runs `node "$BUNDLE" "$@"` (locally may use `ELECTRON_RUN_AS_NODE=1 "$ELECTRON"`
    when no system node); `.cmd` for Windows. `ORCA_CANVAS_BIN` points agents at the wrapper.
- Triggered by the existing call sites: local at `index.ts:1203`, remote at
  `ssh-relay-session.ts:575`.

### 10.3 Host runtime assumption
The CLI needs **Node on the host where the worktree lives** (already true for the existing
Node-based agents/relay). Documented as a Milestone-1 constraint; a packaged static binary is the
deferred fallback (ADR open item).

## 11. Cross-platform & SSH

- All paths via `path.join`; never assume `/` or `\`.
- Lock + atomic write use only `fs.mkdir`/`open('wx')` + `fs.rename` (atomic same-dir on all OSes).
- `.sh` + `.cmd` wrappers; remote is POSIX (matches the existing remote-hook assumption).
- Co-location invariant (§2) means no networked-FS locking is needed.

## 12. Testing

- **Unit (shared):** front-matter parse/serialize round-trip; JSON Canvas (de)serialize;
  readiness derivation; layout placement & group growth; status↔preset map.
- **Concurrency:** two processes `claim` the same task → exactly one wins; the lock serializes
  interleaved writes with no lost update.
- **CLI:** each command's success + failure exit codes; `--json` output shape; `--file` vs
  `ORCA_CANVAS_PATH` resolution; lazy creation.
- **Wiring:** `deriveCanvasPath` for git worktrees and folder workspaces (shared directory,
  distinct `instanceId`); env present at all 3 spawn sites.
- **Cross-platform:** run the lock/atomic-write + path tests on win + posix in CI.

## 13. Build order

1. `src/shared/canvas/`: types → `canvas-task` → `canvas-document` (+ unit tests).
2. `canvas-file-lock` + `canvas-store` (delta ops + atomic write + lock) (+ concurrency tests).
3. `canvas-layout` + `canvas-coordination` (+ tests).
4. `src/canvas-cli/` command surface (+ CLI tests). Usable end-to-end against a `--file` here.
5. `canvas-path` + env injection at the 3 sites + `instanceId` guarantee.
6. `build:canvas-cli` bundle + `managed-canvas-cli-installer` (local + remote) + registration.
7. End-to-end: spawn two agents in one workspace, exercise concurrent claim/plan, verify the
   raw file and exit criterion.

## 14. Risks & open questions

- **Node-on-remote** (§10.3) — assumed; static-binary fallback deferred.
- **esbuild bundling** of `yaml`/`zod` — low risk (pure JS); built-ins fallback noted.
- **Front-matter in Obsidian** renders `---` as a rule — accepted (Orca is primary; `.orca`
  hidden). Degradation target is a plain text editor.
- **Stale-claim window** default (30 min) — tune with real use; `release`/`--steal` cover edge
  cases until Milestone 3's liveness-based release.

## Implementation status

**Done and verified** (31 unit tests, typecheck node+cli clean, oxlint clean, bundle smoke-run):

- Engine — `src/shared/canvas/` (types, status↔preset, task front-matter, document/graph,
  layout, coordination, lock, store, mutations, id, path, barrel).
- CLI — `src/canvas-cli/` (all commands, `--json`, `--file`/`ORCA_CANVAS_PATH`, owner from
  `ORCA_PANE_KEY`). Bundled to one file via `config/scripts/build-canvas-cli.mjs`
  (`pnpm build:canvas-cli` → `out/canvas-cli/orca-canvas.cjs`), wired into `build:desktop`/`build:release`.
- `ORCA_CANVAS_PATH` injected at all three PTY spawn sites (`orca-runtime.ts` ×2, `pty.ts`)
  via `src/main/canvas/canvas-pane-env.ts`; instanceId guaranteed at the runtime sites,
  recovered from the store at the IPC site.
- Local installer module — `src/main/canvas/canvas-cli-installer.ts` + `canvas-cli-wrapper.ts`
  (writes a `~/.orca/canvas` launcher that execs `node <bundle>`, reusing `writeManagedScript`).

**Final wiring** (done — typecheck/lint clean. The remote + packaged-app paths can't be exercised
on a headless dev box, so they are implemented against the existing proven patterns but are not
runtime-verified here):

1. ✅ `installCanvasCliLocal()` runs at app start (`index.ts`, best-effort, independent of the
   agent-status-hooks toggle). `ORCA_CANVAS_BIN` (the local launcher) is injected for **local**
   panes at all three spawn sites; remote panes get `ORCA_CANVAS_PATH` only.
2. ✅ `out/canvas-cli/**` is `asarUnpack`ed in `config/electron-builder.config.cjs`.
3. ✅ Remote delivery: `installRemoteCanvasCli()` (`ssh-relay-session.ts`) pushes the bundle + a
   POSIX wrapper into the remote `binDir` (already on the agent PATH), run via the relay's
   `nodePath` — so remote agents call `orca-canvas`. Mirrors `installRemoteOrcaCliShim`.

To exercise locally: run `pnpm build:canvas-cli` once (so the bundle exists), restart Orca, then
inside an agent pane `"$ORCA_CANVAS_BIN" add-task "..."` (or run the bundle directly).
