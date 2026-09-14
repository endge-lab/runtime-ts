import type { EndgeImplementations_Module } from '@/features/runtime-ts/modules/implementations/EndgeImplementations_Module'
import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'
import { evaluateExpression } from '@/features/runtime-ts/shared/expression'

export class EndgeComputations_Module extends EndgeModule {
  public constructor(
    private readonly _program: EndgeProgram_Module,
    private readonly _implementations: EndgeImplementations_Module,
  ) { super() }

  public async run(identity: string, input?: unknown): Promise<unknown> {
    const artifact = this._program.getArtifact<Record<string, any>>('computation', identity)
    if (!artifact) { throw new Error(`[Computations] Computation is missing: ${identity}`) }
    const providerKey = artifact.payload.providerKey
    if (providerKey) {
      return await this._implementations.execute(providerKey, { executable: { type: 'computation', identity, value: artifact.payload }, input })
    }
    const outputs: Record<string, unknown> = {}
    for (const node of artifact.payload.nodes ?? []) {
      outputs[node.name] = evaluateExpression(node.expression, { input, scope: input, outputs })
    }
    return artifact.payload.result ? evaluateExpression(artifact.payload.result, { input, scope: input, outputs }) : outputs
  }
}
