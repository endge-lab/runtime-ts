import type { EndgeImplementations_Module } from '@/features/runtime-ts/modules/implementations/EndgeImplementations_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'

export class EndgeConverters_Module extends EndgeModule {
  private readonly _providers = new Map<string, string>()
  public constructor(private readonly _implementations: EndgeImplementations_Module) { super() }
  public bind(identity: string, providerKey: string): void { this._providers.set(identity, providerKey) }
  public async execute(identity: string, input: unknown): Promise<unknown> {
    const providerKey = this._providers.get(identity)
    return providerKey ? await this._implementations.execute(providerKey, { executable: { type: 'converter', identity }, input }) : input
  }

  public override reset(): void { this._providers.clear() }
}
