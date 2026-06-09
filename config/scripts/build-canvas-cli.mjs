// Bundles the standalone `orca canvas` CLI into one portable file so it can be installed
// locally and pushed to remote SSH hosts (a single SFTP write, no node_modules required).
// CJS on purpose: the entry uses `require.main === module`, and it is also compiled as
// CommonJS by tsconfig.cli.json — one format keeps both paths consistent.

import { build } from 'esbuild'
import { chmod } from 'node:fs/promises'
import path from 'node:path'

const outfile = path.resolve('out/canvas-cli/orca-canvas.cjs')

// No shebang: the installed wrapper (.sh/.cmd) always invokes this via `node <bundle>`, so the
// bundle is plain CJS with no executable-script preamble to trip over.
await build({
  entryPoints: [path.resolve('src/canvas-cli/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'info'
})

// Best-effort exec bit; ignored on Windows.
await chmod(outfile, 0o755).catch(() => undefined)
process.stdout.write(`built ${outfile}\n`)
