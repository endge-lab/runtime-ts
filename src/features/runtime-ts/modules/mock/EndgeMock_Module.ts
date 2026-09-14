import { EndgeModule } from '@/features/federation/EndgeModule'

export class EndgeMock_Module extends EndgeModule {
  private readonly _values = new Map<string, unknown>()
  public provide(identity: string, value: unknown): void { this._values.set(identity, value) }
  public get(identity: string): unknown { return this._values.get(identity) }
  public override reset(): void { this._values.clear() }
}
