import type { RuntimeTsBootContext } from '@/features/runtime-ts/kernel/types/bootstrap.types'
import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'
import { copyJson } from '@/features/runtime-ts/shared/json'

export class EndgeContext_Module extends EndgeModule<RuntimeTsBootContext> {
  private _state: Record<string, any> = {}
  public constructor(private readonly _program: EndgeProgram_Module) { super() }

  public override load(ctx: RuntimeTsBootContext): void {
    this._state = { ...copyJson(this._program.context ?? {}), vars: { ...ctx.vars } }
  }

  public serialize(): Record<string, any> {
    const { vars: _vars, ...state } = this._state
    return copyJson(state)
  }

  public get dataMode(): 'live' | 'mock' { return this._state.dataMode === 'mock' ? 'mock' : 'live' }
  public get vars(): Readonly<Record<string, unknown>> { return this._state.vars ?? {} }
  public override reset(): void { this._state = {} }
}
