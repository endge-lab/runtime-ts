import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'

export class EndgeWorkspace_Module extends EndgeModule {
  public constructor(private readonly _program: EndgeProgram_Module) { super() }
  public get current() {
    const workspace = this._program.catalog.workspace
    if (!workspace) {
      throw new Error('[RuntimeTs] Bundle has no Workspace descriptor')
    }
    return workspace
  }

  public get startupCompositionIdentity(): string | null { return this.current.startupCompositionIdentity }
}
