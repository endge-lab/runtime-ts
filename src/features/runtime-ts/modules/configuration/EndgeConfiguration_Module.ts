import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'

export class EndgeConfiguration_Module extends EndgeModule {
  public constructor(private readonly _program: EndgeProgram_Module) { super() }
  public get current(): Readonly<Record<string, any>> { return this._program.context?.configuration ?? {} }
}
