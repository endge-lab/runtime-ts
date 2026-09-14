import type { RuntimeTsHostOptions } from '@/features/runtime-ts/modules/host/host.types'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { NodeWebSocketStreamTransportFactory } from '@/features/runtime-ts/adapters/node/NodeWebSocketStreamTransportFactory'
import { EndgeRuntimeTs } from '@/features/runtime-ts/kernel/EndgeRuntimeTs'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const bundlePath = args.find(value => !value.startsWith('--'))
  const watch = args.includes('--watch')
  const hostIndex = args.indexOf('--host-module')
  if (!bundlePath) { throw new Error('Usage: pnpm bundle:run -- /absolute/path/bundle.json [--watch] [--host-module /absolute/path/host.mjs]') }

  let host: RuntimeTsHostOptions = { streams: { websocket: new NodeWebSocketStreamTransportFactory() } }
  if (hostIndex >= 0 && args[hostIndex + 1]) {
    const module = await import(pathToFileURL(args[hostIndex + 1]!).href)
    host = { ...host, ...(module.default ?? module.runtimeTsHost ?? {}) }
  }

  try {
    const bytes = new Uint8Array(await readFile(bundlePath))
    const session = await EndgeRuntimeTs.run({ bundle: bytes, host })
    process.stdout.write(`${JSON.stringify({
      programId: session.programId,
      startupCompositionIdentity: session.startupCompositionIdentity,
      inspection: EndgeRuntimeTs.runtime.captureInspection(true),
    }, null, 2)}\n`)

    if (watch) {
      await new Promise<void>((resolve) => {
        process.once('SIGINT', resolve)
        process.once('SIGTERM', resolve)
      })
    }
  }
  finally {
    await EndgeRuntimeTs.reset()
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
