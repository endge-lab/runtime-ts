import type { RuntimeTsBootContext, RuntimeTsRunOptions } from './types/bootstrap.types'
import type { EndgeBundle } from '@/features/runtime-ts/modules/program/program.types'
import type { RuntimeTsSession } from '@/features/runtime-ts/modules/runtime/runtime.types'
import { EndgeFederation } from '@/features/federation/EndgeFederation'
import { EndgeBundleCodec_Service } from '@/features/runtime-ts/modules/program/EndgeBundleCodec_Service'
import { readEndgeBundle, readExecutionBundle } from '@/features/runtime-ts/modules/program/execution-bundle'
import { ENDGE_RUNTIME_TS_MODULES } from './config/modules.config'

const RuntimeTsFederation = EndgeFederation.define({
  id: 'endge-runtime-ts',
  name: 'EndgeRuntimeTs',
  modules: ENDGE_RUNTIME_TS_MODULES,
})

export class EndgeRuntimeTs extends RuntimeTsFederation {
  private static _session: RuntimeTsSession | null = null
  private static _abortDisposer: (() => void) | null = null

  public static async run(options: RuntimeTsRunOptions): Promise<RuntimeTsSession> {
    if (this._session || this.state !== 'idle') { throw new Error('[RuntimeTs] reset is required before another run') }
    const bundle = await this._readBundle(options.bundle, options.signal)
    const ctx: RuntimeTsBootContext = { bundle, vars: { ...(options.vars ?? {}) }, host: options.host ?? {}, signal: options.signal }
    try {
      await this.boot(ctx)
      this._session = await this.runtime.mountStartup()
      if (options.signal) {
        const onAbort = () => { void this.reset() }
        options.signal.addEventListener('abort', onAbort, { once: true })
        this._abortDisposer = () => options.signal?.removeEventListener('abort', onAbort)
      }
      return this._session
    }
    catch (error) {
      this._abortDisposer?.()
      this._abortDisposer = null
      await super.reset()
      this._session = null
      throw error
    }
  }

  public static exportInspectionBundle(options: { includeData?: boolean } = {}): EndgeBundle {
    const capture = this.inspection.createCapture(options)
    try {
      return { format: 'endge-bundle', version: 1, bundle: this.program.exportBundle(), inspection: capture.recording }
    }
    finally {
      capture.stop()
    }
  }

  public static override async reset(): Promise<void> {
    this._abortDisposer?.()
    this._abortDisposer = null
    await super.reset()
    this._session = null
  }

  private static async _readBundle(input: RuntimeTsRunOptions['bundle'], signal?: AbortSignal) {
    signal?.throwIfAborted()
    if (input instanceof Uint8Array) {
      const container = await new EndgeBundleCodec_Service().decode(input, signal)
      if (!container.bundle) { throw new Error('[RuntimeTs] Execution Bundle is required') }
      return container.bundle
    }
    if ((input as EndgeBundle).format === 'endge-bundle') {
      const container = readEndgeBundle(input)
      if (!container.bundle) { throw new Error('[RuntimeTs] Execution Bundle is required') }
      return container.bundle
    }
    return readExecutionBundle(input)
  }
}
