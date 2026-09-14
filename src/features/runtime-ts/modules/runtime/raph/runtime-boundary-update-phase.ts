import type { DepGraph, PhaseEvent, PhaseExecutorContext, PhaseName, RaphNode, RaphPhase } from '@endge/raph'
import type { RuntimeHost } from '@/features/runtime-ts/modules/runtime/runtime.types'

export interface RuntimeBoundaryUpdatePhaseOptions {
  name?: PhaseName
  getGraph: () => DepGraph<RaphNode>
  resolveHost: (runtimeId: string) => RuntimeHost | null
}

export interface RuntimeBoundaryAggregatedUpdate {
  node: RaphNode
  events: PhaseEvent[]
  dirtyNodes: RaphNode[]
}

/** Агрегирует dirty runtime-ноды к верхней root/boundary до вызова host. */
export class RuntimeBoundaryUpdatePhase {
  public static readonly PHASE_NAME = 'runtime-boundary-update' as PhaseName

  public static make(options: RuntimeBoundaryUpdatePhaseOptions): RaphPhase {
    return {
      name: options.name ?? RuntimeBoundaryUpdatePhase.PHASE_NAME,
      routes: ['*'],
      traversal: 'dirty-only',
      nodes: node => node.meta?.type === 'runtime-node',
      all: (contexts) => {
        for (const update of aggregateRuntimeBoundaryUpdates(options.getGraph(), contexts)) {
          const runtimeId = String(update.node.meta?.runtimeId ?? '').trim()
          if (runtimeId) { options.resolveHost(runtimeId)?.emit('raph:update:boundaries', update) }
        }
      },
    }
  }
}

export function aggregateRuntimeBoundaryUpdates(graph: DepGraph<RaphNode>, contexts: PhaseExecutorContext[]): RuntimeBoundaryAggregatedUpdate[] {
  const updates = new Map<string, RuntimeBoundaryAggregatedUpdate>()
  for (const context of contexts) {
    if (context.node.meta?.type !== 'runtime-node') { continue }
    const boundary = findBoundary(context.node, graph)
    if (!boundary) { continue }
    const current = updates.get(boundary.id) ?? { node: boundary, events: [], dirtyNodes: [] }
    current.events.push(...(context.events ?? []))
    if (!current.dirtyNodes.some(node => node.id === context.node.id)) { current.dirtyNodes.push(context.node) }
    updates.set(boundary.id, current)
  }
  return [...updates.values()].filter(candidate => ![...updates.values()].some(other => other !== candidate && isAncestor(other.node, candidate.node, graph)))
}

function findBoundary(node: RaphNode, graph: DepGraph<RaphNode>): RaphNode | null {
  if (['root', 'boundary'].includes(String(node.meta?.kind))) { return node }
  const seen = new Set([node.id])
  const queue = [node]
  while (queue.length) {
    const current = queue.shift()!
    for (const parent of graph.parentsOf(current)) {
      if (seen.has(parent.id)) { continue }
      if (['root', 'boundary'].includes(String(parent.meta?.kind))) { return parent }
      seen.add(parent.id)
      queue.push(parent)
    }
  }
  return null
}

function isAncestor(ancestor: RaphNode, node: RaphNode, graph: DepGraph<RaphNode>): boolean {
  if (ancestor.id === node.id) { return true }
  const seen = new Set([node.id])
  const queue = [node]
  while (queue.length) {
    const current = queue.shift()!
    for (const parent of graph.parentsOf(current)) {
      if (parent.id === ancestor.id) { return true }
      if (!seen.has(parent.id)) { seen.add(parent.id); queue.push(parent) }
    }
  }
  return false
}
