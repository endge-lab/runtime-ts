import type { RuntimeOwnedResource } from '@/features/runtime-ts/modules/runtime/resources/runtime-resource.types'

export interface OperationHistoryEntry {
  id: string
  input: unknown
  runOutput: unknown
  undo: () => Promise<unknown>
  redo: () => Promise<unknown>
  undoOutput?: unknown
}

export interface OperationHistoryOptions {
  id: string
  limit?: number
  onChange?: () => void
}

/** Сериализованный cursor undo/redo, перенесённый из Core без UI shortcuts. */
export class OperationHistory implements RuntimeOwnedResource {
  public readonly kind = 'operation-history'
  public readonly id: string
  private _entries: OperationHistoryEntry[] = []
  private _cursor = 0
  private _paused = false
  private _disposed = false
  private _queue: Promise<unknown> = Promise.resolve()
  private _pending = 0
  private _limit: number

  public constructor(private readonly _options: OperationHistoryOptions) {
    this.id = _options.id
    this._limit = normalizeLimit(_options.limit)
  }

  public get active(): boolean { return !this._paused && !this._disposed }
  public canUndo(): boolean { return this.active && this._cursor > 0 }
  public canRedo(): boolean { return this.active && this._cursor < this._entries.length }

  public commit(entry: OperationHistoryEntry): Promise<void> {
    if (!this._pending) { this._commit(entry); return Promise.resolve() }
    return this._enqueue(async () => this._commit(entry))
  }

  public execute<T>(operation: () => Promise<{ result: T, entry: OperationHistoryEntry }>): Promise<T> {
    return this._enqueue(async () => {
      if (this._disposed) { throw new Error('[OperationHistory] History is disposed.') }
      const { result, entry } = await operation()
      this._commit(entry)
      return result
    })
  }

  public undo(): Promise<unknown> {
    return this._enqueue(async () => {
      if (!this.canUndo()) { return undefined }
      const entry = this._entries[this._cursor - 1]!
      const result = await entry.undo()
      if (!this._disposed) { entry.undoOutput = result; this._cursor -= 1; this._options.onChange?.() }
      return result
    })
  }

  public redo(): Promise<unknown> {
    return this._enqueue(async () => {
      if (!this.canRedo()) { return undefined }
      const entry = this._entries[this._cursor]!
      const result = await entry.redo()
      if (!this._disposed) { this._cursor += 1; this._options.onChange?.() }
      return result
    })
  }

  public pause(): void { this._paused = true }
  public resume(): void { if (!this._disposed) { this._paused = false } }
  public dispose(): void { this._disposed = true; this._entries = []; this._cursor = 0; this._options.onChange?.() }
  public snapshot(): { limit: number, cursor: number, size: number, paused: boolean } { return { limit: this._limit, cursor: this._cursor, size: this._entries.length, paused: this._paused } }

  private _commit(entry: OperationHistoryEntry): void {
    if (!this.active) { return }
    if (this._cursor < this._entries.length) { this._entries.splice(this._cursor) }
    this._entries.push(entry)
    this._cursor = this._entries.length
    const overflow = Math.max(0, this._entries.length - this._limit)
    if (overflow) { this._entries.splice(0, overflow); this._cursor = Math.max(0, this._cursor - overflow) }
    this._options.onChange?.()
  }

  private _enqueue<T>(task: () => Promise<T>): Promise<T> {
    this._pending += 1
    const result = this._queue.then(task, task).finally(() => { this._pending -= 1 })
    this._queue = result.then(() => undefined, () => undefined)
    return result
  }
}

function normalizeLimit(value: number | undefined): number {
  const number = Number(value ?? 20)
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 20
}
