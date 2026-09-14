import type { OperationHistory } from './operation-history'
import type { RuntimeHost } from '@/features/runtime-ts/modules/runtime/runtime.types'

/** Headless owner operation histories; keyboard/UI binding belongs to a renderer adapter. */
export class EndgeOperations_Module {
  private readonly _histories = new Map<string, { ownerRuntimeId: string, history: OperationHistory }>()
  private _latestScopeId: string | null = null

  public register(scopeId: string, ownerRuntimeId: string, history: OperationHistory): () => void {
    if (this._histories.has(scopeId)) { throw new Error(`Runtime scope "${scopeId}" already owns operationHistory.`) }
    this._histories.set(scopeId, { ownerRuntimeId, history })
    this._latestScopeId = scopeId
    return () => {
      if (this._histories.get(scopeId)?.history === history) { this._histories.delete(scopeId) }
      if (this._latestScopeId === scopeId) { this._latestScopeId = [...this._histories.keys()].at(-1) ?? null }
    }
  }

  public resolveForHost(host: RuntimeHost | null | undefined): OperationHistory | null {
    let current = host ?? null
    while (current) {
      const result = [...this._histories.values()].reverse().find(item => item.ownerRuntimeId === current?.id)?.history
      if (result?.active) { return result }
      current = current.parent
    }
    return null
  }

  public getActiveHistory(): OperationHistory | null {
    const latest = this._latestScopeId ? this._histories.get(this._latestScopeId)?.history : null
    return latest?.active ? latest : [...this._histories.values()].reverse().find(item => item.history.active)?.history ?? null
  }

  public undo(): Promise<unknown> { return this.getActiveHistory()?.undo() ?? Promise.resolve(undefined) }
  public redo(): Promise<unknown> { return this.getActiveHistory()?.redo() ?? Promise.resolve(undefined) }
  public canUndo(): boolean { return this.getActiveHistory()?.canUndo() ?? false }
  public canRedo(): boolean { return this.getActiveHistory()?.canRedo() ?? false }
  public reset(): void { this._histories.clear(); this._latestScopeId = null }

  public snapshot(): unknown {
    return {
      activeScopeId: this._latestScopeId,
      histories: [...this._histories.entries()].map(([scopeId, item]) => ({ scopeId, ownerRuntimeId: item.ownerRuntimeId, active: item.history.active, ...item.history.snapshot() })),
    }
  }
}
