import type { EndgeImplementations_Module } from '@/features/runtime-ts/modules/implementations/EndgeImplementations_Module'
import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'

export class EndgeActions_Module extends EndgeModule {
  public constructor(
    private readonly _program: EndgeProgram_Module,
    private readonly _implementations: EndgeImplementations_Module,
  ) { super() }

  public async execute(identity: string, input?: unknown, context?: Record<string, unknown>): Promise<unknown> {
    const artifact = this._program.getArtifact('action', identity)
    const requirement = this._program.requirements.hostActions?.find(item => item.identity === identity)
    const payload = artifact?.payload as Record<string, any> | undefined
    const providerKey = requirement?.providerKey ?? payload?.defaultImplementation?.providerKey ?? payload?.providerKey
    if (!providerKey) {
      if (!artifact) { throw new Error(`[Actions] Action is missing: ${identity}`) }
      return input
    }
    return await this._implementations.execute(providerKey, {
      executable: { type: 'action', identity, value: payload },
      input,
      context,
    })
  }
}
