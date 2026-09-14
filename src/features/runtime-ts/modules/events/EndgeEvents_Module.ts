import { EndgeModule } from '@/features/federation/EndgeModule'

type Listener = (payload: unknown) => void

export class EndgeEvents_Module extends EndgeModule {
  private readonly _listeners = new Map<string, Set<Listener>>()
  private readonly _any = new Set<(event: { name: string, payload: unknown }) => void>()

  public on(name: string, listener: Listener): () => void {
    const listeners = this._listeners.get(name) ?? new Set()
    listeners.add(listener)
    this._listeners.set(name, listeners)
    return () => listeners.delete(listener)
  }

  public onAny(listener: (event: { name: string, payload: unknown }) => void): () => void {
    this._any.add(listener)
    return () => this._any.delete(listener)
  }

  public emitEvent(name: string, payload: unknown): void {
    this._listeners.get(name)?.forEach(listener => listener(payload))
    this._any.forEach(listener => listener({ name, payload }))
  }

  public override reset(): void {
    this._listeners.clear()
    this._any.clear()
  }
}
