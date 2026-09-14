import type { StreamTransportConnection } from '@/features/runtime-ts/modules/host/host.types'
import type { ProgramArtifact, RuntimeHostSnapshot } from '@/features/runtime-ts/modules/program/program.types'
import type { BundleJsonValue } from '@/features/runtime-ts/shared/json'
import { RuntimeResourceBag } from '@/features/runtime-ts/modules/runtime/resources/RuntimeResourceBag'

export type RuntimeEntityType = 'composition' | 'component-sfc' | 'query' | 'stream' | 'store' | 'filter' | 'page' | 'action' | 'simulation'

export interface ComponentSFCRenderPort {
  readonly id: string
  readonly entityIdentity: string
  readonly readonly?: boolean
  readonly runtimeState: RuntimeStateController
  getIr: () => unknown
  getArtifact: () => ProgramArtifact | null
  getOutput: (name: string) => unknown
  on: (name: string, listener: (payload: unknown) => void) => () => void
  emit: (name: string, payload: unknown) => void
}

export interface RuntimeStateController {
  get: (path?: string) => unknown
  set: (path: string, value: unknown) => void
  snapshot: () => Record<string, unknown>
}

export class RuntimeHost {
  public readonly id: string
  public readonly entityType: RuntimeEntityType
  public readonly entityIdentity: string
  public readonly runtimeType: string
  public readonly title: string
  public readonly parent: RuntimeHost | null
  public readonly basePath: string
  public readonly createdAt = Date.now()
  public updatedAt = this.createdAt
  public status: RuntimeHostSnapshot['status'] = 'created'
  public readonly context: Record<string, any> = {}
  public readonly meta: Record<string, any>
  public readonly ownedResources = new RuntimeResourceBag()
  public readonly channels: Array<Record<string, BundleJsonValue>> = []
  public readonly capabilities: string[]
  public readonly outputs = new Map<string, unknown>()
  public readonly children = new Map<string, RuntimeHost>()
  public connection: StreamTransportConnection | null = null
  public run?: (input?: Record<string, unknown>) => Promise<unknown>
  public set?: (path: string, value: unknown) => void
  public dispatch?: (event: { type: string, payload: unknown }) => boolean
  private readonly _listeners = new Map<string, Set<(payload: unknown) => void>>()

  public constructor(input: {
    id: string
    entityType: RuntimeEntityType
    entityIdentity: string
    parent?: RuntimeHost | null
    title?: string
    basePath?: string
    meta?: Record<string, unknown>
    capabilities?: string[]
  }) {
    this.id = input.id
    this.entityType = input.entityType
    this.entityIdentity = input.entityIdentity
    this.runtimeType = `${input.entityType}-runtime-host`
    this.title = input.title ?? input.entityIdentity
    this.parent = input.parent ?? null
    this.basePath = input.basePath ?? `runtime.${encodeURIComponent(input.id)}`
    this.meta = { ...(input.meta ?? {}) }
    this.capabilities = input.capabilities ?? []
  }

  public setStatus(status: RuntimeHostSnapshot['status']): void {
    const previous = this.status
    this.status = status
    this.updatedAt = Date.now()
    this.emit('status:change', { previous, value: status })
  }

  public setOutput(name: string, value: unknown): void {
    this.outputs.set(name, value)
    this.updatedAt = Date.now()
    this.emit('output:change', { name, value })
  }

  public getOutput(name: string): unknown { return this.outputs.get(name) }
  public getOutputs(): Readonly<Record<string, unknown>> { return Object.fromEntries(this.outputs) }

  public on(name: string, listener: (payload: unknown) => void): () => void {
    const listeners = this._listeners.get(name) ?? new Set()
    listeners.add(listener)
    this._listeners.set(name, listeners)
    return () => listeners.delete(listener)
  }

  public emit(name: string, payload: unknown): void { this._listeners.get(name)?.forEach(listener => listener(payload)) }

  public snapshot(): RuntimeHostSnapshot {
    return {
      id: this.id,
      basePath: this.basePath,
      parentId: this.parent?.id ?? null,
      removedAt: null,
      runtimeType: this.runtimeType,
      capabilities: [...this.capabilities],
      entityType: this.entityType,
      entityIdentity: this.entityIdentity,
      title: this.title,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      resources: this.ownedResources.snapshot().resources,
      channels: [...this.channels],
      meta: JSON.parse(JSON.stringify(this.meta)),
      context: JSON.parse(JSON.stringify(this.context)),
    }
  }
}

export interface RuntimeTsSession {
  readonly programId: string
  readonly startupCompositionIdentity: string
  readonly host: RuntimeHost
  readonly outputs: Readonly<Record<string, unknown>>
  output: <T = unknown>(name: string) => T | undefined
  unmount: () => Promise<void>
}
