import type { ExecutionBundle, ProgramArtifact, ProgramEntityType } from './program.types'
import type { RuntimeTsBootContext } from '@/features/runtime-ts/kernel/types/bootstrap.types'
import { EndgeModule } from '@/features/federation/EndgeModule'
import { copyJson } from '@/features/runtime-ts/shared/json'
import { readExecutionBundle } from './execution-bundle'

export class EndgeProgram_Module extends EndgeModule<RuntimeTsBootContext> {
  private _programId: string | null = null
  private _compilerVersion = ''
  private _createdAt = ''
  private _artifacts = new Map<string, ProgramArtifact>()
  private _byIdentity = new Map<string, ProgramArtifact>()
  private _catalog: ExecutionBundle['catalog'] = { folders: {}, documents: {} }
  private _context: ExecutionBundle['context'] | null = null
  private _requirements: ExecutionBundle['requirements'] = { artifactTypes: [], componentTags: [] }

  public override load(ctx: RuntimeTsBootContext): void {
    this.install(ctx.bundle)
  }

  public install(input: unknown): void {
    const bundle = readExecutionBundle(input)
    const artifacts = new Map(Object.entries(bundle.artifacts))
    const byIdentity = new Map<string, ProgramArtifact>()
    const add = (artifact: ProgramArtifact) => {
      byIdentity.set(`${artifact.ref.entityType}:${artifact.ref.identity}`, artifact)
      artifact.children?.forEach(add)
    }
    artifacts.forEach(add)
    this._artifacts = artifacts
    this._byIdentity = byIdentity
    this._programId = bundle.programId
    this._compilerVersion = bundle.compilerVersion
    this._createdAt = bundle.createdAt
    this._catalog = bundle.catalog
    this._context = bundle.context
    this._requirements = bundle.requirements
    this.notify()
  }

  public getArtifact<T = Record<string, any>>(entityType: ProgramEntityType | string, idOrIdentity: string | number): ProgramArtifact<T> | null {
    return (this._artifacts.get(`${entityType}:${idOrIdentity}`) ?? this._byIdentity.get(`${entityType}:${idOrIdentity}`) ?? null) as ProgramArtifact<T> | null
  }

  public getArtifacts(): ProgramArtifact[] {
    return [...this._artifacts.values()]
  }

  public exportBundle(): ExecutionBundle {
    if (!this._programId || !this._context) {
      throw new Error('[Program] No installed Bundle')
    }
    return copyJson({
      version: 1,
      programId: this._programId,
      compilerVersion: this._compilerVersion,
      createdAt: this._createdAt,
      context: this._context,
      requirements: this._requirements,
      catalog: this._catalog,
      artifacts: Object.fromEntries(this._artifacts),
    }) as ExecutionBundle
  }

  public get programId(): string | null { return this._programId }
  public get catalog(): Readonly<ExecutionBundle['catalog']> { return this._catalog }
  public get context(): Readonly<ExecutionBundle['context'] | null> { return this._context }
  public get requirements(): Readonly<ExecutionBundle['requirements']> { return this._requirements }

  public override reset(): void {
    this._programId = null
    this._compilerVersion = ''
    this._createdAt = ''
    this._artifacts.clear()
    this._byIdentity.clear()
    this._catalog = { folders: {}, documents: {} }
    this._context = null
    this._requirements = { artifactTypes: [], componentTags: [] }
  }
}
