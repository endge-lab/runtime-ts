import type { EndgeHost_Module } from '@/features/runtime-ts/modules/host/EndgeHost_Module'
import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'
import { readPath } from '@/features/runtime-ts/shared/json'

export class EndgeVocabs_Module extends EndgeModule {
  private readonly _cache = new Map<string, unknown>()
  public constructor(private readonly _program: EndgeProgram_Module, private readonly _host: EndgeHost_Module) { super() }

  public async acquire(identity: string): Promise<unknown> {
    if (this._cache.has(identity)) { return this._cache.get(identity) }
    const artifact = this._program.getArtifact<Record<string, any>>('vocab', identity)
    if (!artifact) { throw new Error(`[Vocabs] Vocab is missing: ${identity}`) }
    let value: unknown = artifact.payload.mock?.data ?? []
    if (artifact.payload.provider) {
      const response = await this._host.http.request({
        url: String(artifact.payload.provider.endpoint ?? artifact.payload.provider.url ?? ''),
        method: String(artifact.payload.provider.method ?? 'GET'),
      })
      value = readPath(response.data, artifact.payload.provider.path)
    }
    this._cache.set(identity, value)
    return value
  }

  public override reset(): void { this._cache.clear() }
}
