import type { PhaseName, RaphNode, RaphPhase } from '@endge/raph'
import type { RuntimeHost } from '@/features/runtime-ts/modules/runtime/runtime.types'

export interface RuntimeNodeUpdatePhaseOptions {
  name?: PhaseName
  resolveHost: (runtimeId: string) => RuntimeHost | null
}

/** Renderer-neutral Raph phase that forwards dirty root events to their runtime host. */
export class RuntimeNodeUpdatePhase {
  public static readonly PHASE_NAME = 'runtime-node-update' as PhaseName

  public static make(options: RuntimeNodeUpdatePhaseOptions): RaphPhase {
    return {
      name: options.name ?? RuntimeNodeUpdatePhase.PHASE_NAME,
      routes: ['*'],
      traversal: 'dirty-only',
      nodes: node => isRuntimeRoot(node),
      each: (ctx) => {
        const runtimeId = String(ctx.node.meta?.runtimeId ?? '').trim()
        if (runtimeId) { options.resolveHost(runtimeId)?.emit('raph:update', { node: ctx.node, events: ctx.events ?? [], frame: ctx.frame }) }
      },
    }
  }
}

function isRuntimeRoot(node: RaphNode): boolean {
  return node.meta?.type === 'runtime-node' && node.meta?.kind === 'root'
}
