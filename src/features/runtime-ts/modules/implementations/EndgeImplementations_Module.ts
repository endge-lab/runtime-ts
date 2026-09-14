import type { ImplementationInvocation, RuntimeImplementationProvider } from '@/features/runtime-ts/modules/host/host.types'
import { EndgeModule } from '@/features/federation/EndgeModule'

export class EndgeImplementations_Module extends EndgeModule {
  private readonly _providers = new Map<string, RuntimeImplementationProvider>()

  public registerProvider(provider: RuntimeImplementationProvider): () => void {
    const key = String(provider.key ?? '').trim()
    if (!key) {
      throw new Error('[Implementations] Provider key is required')
    }
    if (this._providers.has(key)) {
      throw new Error(`[Implementations] Provider already exists: ${key}`)
    }
    this._providers.set(key, { ...provider, key })
    return () => this._providers.delete(key)
  }

  public hasProvider(key: string): boolean { return this._providers.has(key) }

  public async execute(key: string, invocation: ImplementationInvocation): Promise<unknown> {
    const provider = this._providers.get(key)
    if (!provider || provider.active === false) {
      throw new Error(`[Implementations] Provider is unavailable: ${key}`)
    }
    if (provider.canExecute && !provider.canExecute(invocation)) {
      throw new Error(`[Implementations] Provider cannot execute: ${key}`)
    }
    return await provider.execute(invocation)
  }

  public snapshot(): unknown {
    return [...this._providers.values()].map(provider => ({ key: provider.key, active: provider.active !== false }))
  }

  public override reset(): void { this._providers.clear() }
}
