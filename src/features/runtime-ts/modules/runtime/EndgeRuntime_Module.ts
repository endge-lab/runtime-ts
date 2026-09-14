import type { RaphApp } from '@endge/raph'
import type { ComponentSFCRenderPort, RuntimeEntityType, RuntimeStateController, RuntimeTsSession } from './runtime.types'
import type { RuntimeTsBootContext } from '@/features/runtime-ts/kernel/types/bootstrap.types'
import type { EndgeActions_Module } from '@/features/runtime-ts/modules/actions/EndgeActions_Module'
import type { EndgeComputations_Module } from '@/features/runtime-ts/modules/computations/EndgeComputations_Module'
import type { EndgeContext_Module } from '@/features/runtime-ts/modules/context/EndgeContext_Module'
import type { EndgeConverters_Module } from '@/features/runtime-ts/modules/converters/EndgeConverters_Module'
import type { EndgeEvents_Module } from '@/features/runtime-ts/modules/events/EndgeEvents_Module'
import type { EndgeHost_Module } from '@/features/runtime-ts/modules/host/EndgeHost_Module'
import type { StreamTransportMessage } from '@/features/runtime-ts/modules/host/host.types'
import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import type { ProgramArtifact, RuntimeHostSnapshot, RuntimeInspectionSnapshot } from '@/features/runtime-ts/modules/program/program.types'
import type { EndgeVocabs_Module } from '@/features/runtime-ts/modules/vocabs/EndgeVocabs_Module'
import type { EndgeWorkspace_Module } from '@/features/runtime-ts/modules/workspace/EndgeWorkspace_Module'
import { RaphApp as RaphApplication } from '@endge/raph'
import { EndgeModule } from '@/features/federation/EndgeModule'
import { evaluateExpression } from '@/features/runtime-ts/shared/expression'
import { copyJson, readPath, writePath } from '@/features/runtime-ts/shared/json'
import { RuntimeHost } from './runtime.types'

export class EndgeRuntime_Module extends EndgeModule<RuntimeTsBootContext> {
  private _app: RaphApp | null = null
  private _abortController: AbortController | null = null
  private _externalAbortDisposer: (() => void) | null = null
  private readonly _hosts = new Map<string, RuntimeHost>()
  private readonly _deleted: RuntimeHostSnapshot[] = []
  private readonly _scopeSnapshots: Array<Record<string, any>> = []
  private readonly _disposers: Array<() => void> = []
  private _generation = 0
  private _runtimeSequence = 0

  public constructor(
    private readonly _program: EndgeProgram_Module,
    private readonly _context: EndgeContext_Module,
    private readonly _workspace: EndgeWorkspace_Module,
    private readonly _host: EndgeHost_Module,
    private readonly _actions: EndgeActions_Module,
    private readonly _computations: EndgeComputations_Module,
    private readonly _converters: EndgeConverters_Module,
    private readonly _vocabs: EndgeVocabs_Module,
    private readonly _events: EndgeEvents_Module,
  ) { super() }

  public override start(ctx: RuntimeTsBootContext): void {
    ctx.signal?.throwIfAborted()
    this._abortController = new AbortController()
    if (ctx.signal) {
      const onAbort = () => this._abortController?.abort(ctx.signal?.reason)
      ctx.signal.addEventListener('abort', onAbort, { once: true })
      this._externalAbortDisposer = () => ctx.signal?.removeEventListener('abort', onAbort)
    }
    this._generation += 1
    this._app = new RaphApplication({ id: `endge-runtime-ts:${this._generation}` })
    this._app.init()
    this._scopeSnapshots.push({
      id: 'runtime-scope:app',
      path: 'runtime',
      parentScopeId: null,
      ownerRuntimeId: null,
      generation: this._generation,
      state: 'active',
      memberRuntimeIds: [],
      childScopeIds: [],
      resources: {},
    })
  }

  public async mountStartup(): Promise<RuntimeTsSession> {
    const identity = this._workspace.startupCompositionIdentity
    if (!identity) { throw new Error('[RuntimeTs] Current Workspace has no startup Composition') }
    if (!this._program.getArtifact('composition', identity)) { throw new Error(`[RuntimeTs] Startup Composition is missing: ${identity}`) }
    const host = await this.mountComposition(identity)
    const session: RuntimeTsSession = {
      programId: this._program.programId!,
      startupCompositionIdentity: identity,
      host,
      outputs: host.getOutputs(),
      output: name => host.getOutput(name) as any,
      unmount: async () => { await this.destroyRuntimeTree(host.id) },
    }
    return session
  }

  public async mountComposition(identity: string, parent: RuntimeHost | null = null, name = identity, props: Record<string, unknown> = {}): Promise<RuntimeHost> {
    const artifact = this._requireArtifact('composition', identity)
    const host = this._createHost('composition', identity, parent, name, ['children', 'outputs'])
    host.setStatus('mounted')
    const payload = artifact.payload as Record<string, any>
    host.context.mountedChildren = 0
    host.context.lastHookAt = null
    host.meta.props = copyJson(props)
    this._createCompositionScopes(host, payload)
    const dataHosts = new Map<string, RuntimeHost>()
    for (const descriptor of payload.data ?? []) {
      if (descriptor.kind === 'store') {
        const store = await this._mountStore(descriptor.identity, host, descriptor.path ?? descriptor.name)
        dataHosts.set(descriptor.name, store)
      }
      else if (descriptor.kind === 'vocab') {
        const value = await this._vocabs.acquire(descriptor.identity)
        this.app.set(`${host.basePath}.data.${descriptor.path ?? descriptor.name}`, copyJson(value))
      }
    }
    const descriptors = new Map<string, Record<string, any>>((payload.runtimes ?? []).map((item: any) => [item.path ?? item.name, item]))
    for (const descriptor of payload.runtimes ?? []) {
      if (descriptor.effectiveActivation?.mode !== 'startup') { continue }
      const childProps = Object.fromEntries(Object.entries(descriptor.props ?? {}).map(([key, binding]) => [key, this._resolveBinding(binding, host, props, dataHosts)]))
      const child = await this._mountDescriptor(descriptor, host, childProps, dataHosts)
      host.children.set(descriptor.path ?? descriptor.name, child)
      this._scopeFor(host, descriptor.scopePath)?.memberRuntimeIds.push(child.id)
    }
    host.context.mountedChildren = host.children.size
    this._wireCompositionGraph(host, payload, props, dataHosts, descriptors)
    for (const mount of payload.graph?.mounts ?? []) {
      await host.children.get(mount.targetRuntime)?.run?.()
    }
    for (const hook of payload.hooks ?? []) {
      if (hook.kind === 'mount') { await host.children.get(hook.target)?.run?.() }
    }
    for (const output of payload.outputs ?? []) {
      if (output.kind === 'runtime') {
        host.setOutput(output.key, host.children.get(output.runtime)?.getOutput(output.output ?? 'result'))
      }
      else if (output.kind === 'scope') {
        host.setOutput(output.key, this.app.get(`${host.basePath}.data.${output.scope}`))
      }
    }
    host.setStatus('active')
    this._events.emitEvent('runtime:composition-mounted', { id: host.id, identity })
    return host
  }

  public async mountSimulation(identity: string): Promise<RuntimeHost> {
    const artifact = this._requireArtifact('simulation', identity)
    const target = (artifact.payload as Record<string, any>).target
    if (target?.entityType !== 'composition') { throw new Error(`[Simulation] Unsupported target: ${String(target?.entityType)}`) }
    const host = this._createHost('simulation', identity, null, identity, ['children'])
    host.setStatus('mounted')
    const composition = await this.mountComposition(target.identity, host, 'target')
    host.children.set('target', composition)
    host.setStatus('active')
    return host
  }

  public getHost(id: string): RuntimeHost | null { return this._hosts.get(id) ?? null }
  public getHosts(): RuntimeHost[] { return [...this._hosts.values()] }
  public get app(): RaphApp {
    if (!this._app) { throw new Error('[RuntimeTs] Runtime is not started') }
    return this._app
  }

  public captureInspection(includeData = false): RuntimeInspectionSnapshot {
    const hosts = this.getHosts().map(host => host.snapshot())
    const byStatus: Record<string, number> = {}
    hosts.forEach((host) => { byStatus[host.status] = (byStatus[host.status] ?? 0) + 1 })
    const snapshot: RuntimeInspectionSnapshot = {
      version: 1,
      runtime: {
        generatedAt: Date.now(),
        generation: this._generation,
        total: hosts.length,
        hosts,
        deletedTotal: this._deleted.length,
        deletedHosts: copyJson(this._deleted),
        byStatus,
        scopes: copyJson(this._scopeSnapshots),
      },
    }
    if (includeData) {
      snapshot.data = copyJson(this.app.data) as any
      snapshot.render = this._captureRender() as any
      snapshot.dataGeneratedAt = Date.now()
    }
    return snapshot
  }

  public async destroyRuntimeTree(id: string): Promise<void> {
    const host = this._hosts.get(id)
    if (!host) { return }
    for (const child of [...host.children.values()].reverse()) { await this.destroyRuntimeTree(child.id) }
    await host.connection?.close()
    host.setStatus('destroyed')
    const snapshot = host.snapshot()
    snapshot.removedAt = Date.now()
    this._deleted.push(snapshot)
    this._hosts.delete(id)
  }

  public override async reset(): Promise<void> {
    this._externalAbortDisposer?.()
    this._externalAbortDisposer = null
    this._abortController?.abort(new DOMException('Runtime reset', 'AbortError'))
    this._abortController = null
    this._disposers.splice(0).reverse().forEach(dispose => dispose())
    for (const host of [...this._hosts.values()].filter(item => !item.parent).reverse()) { await this.destroyRuntimeTree(host.id) }
    this._hosts.clear()
    this._deleted.splice(0)
    this._scopeSnapshots.splice(0)
    this._runtimeSequence = 0
    this._app?.reset()
    this._app = null
  }

  private _createHost(entityType: RuntimeEntityType, identity: string, parent: RuntimeHost | null, name: string, capabilities: string[] = []): RuntimeHost {
    const id = `${parent?.id ?? 'app'}:${name}:${++this._runtimeSequence}`
    const host = new RuntimeHost({ id, entityType, entityIdentity: identity, parent, title: name, basePath: `${parent?.basePath ?? 'runtime'}.${encodeURIComponent(name)}`, capabilities })
    this._hosts.set(id, host)
    this._scopeSnapshots[0]?.memberRuntimeIds.push(id)
    return host
  }

  private async _mountDescriptor(descriptor: Record<string, any>, parent: RuntimeHost, props: Record<string, unknown>, dataHosts: Map<string, RuntimeHost>): Promise<RuntimeHost> {
    const kind = descriptor.kind === 'component' ? 'component-sfc' : descriptor.kind
    if (kind === 'composition') { return await this.mountComposition(descriptor.identity, parent, descriptor.path ?? descriptor.name, props) }
    if (kind === 'query') { return this._mountQuery(descriptor.identity, parent, descriptor.path ?? descriptor.name, props, descriptor, dataHosts) }
    if (kind === 'stream') { return await this._mountStream(descriptor.identity, parent, descriptor.path ?? descriptor.name, descriptor, dataHosts) }
    if (kind === 'filter') { return this._mountFilter(descriptor.identity, parent, descriptor.path ?? descriptor.name) }
    if (kind === 'component-sfc') { return this._mountComponent(descriptor.identity, parent, descriptor.path ?? descriptor.name, props) }
    if (kind === 'filter-view') { return this._mountPage(descriptor.componentIdentity ?? descriptor.identity, parent, descriptor.path ?? descriptor.name, props) }
    throw new Error(`[RuntimeTs] Unsupported Composition runtime kind: ${String(kind)}`)
  }

  private async _mountStore(identity: string, parent: RuntimeHost, name: string): Promise<RuntimeHost> {
    const artifact = this._requireArtifact('store', identity)
    const host = this._createHost('store', identity, parent, name, ['state', 'updates'])
    const payload = artifact.payload as Record<string, any>
    const state: Record<string, unknown> = {}
    for (const field of payload.data ?? []) {
      state[field.key] = field.initial?.kind === 'literal' ? copyJson(field.initial.value) : evaluateExpression(field.initial, { vars: this._context.vars })
    }
    this.app.set(host.basePath, state)
    host.context.status = 'idle'
    host.context.writableFields = (payload.data ?? []).filter((item: any) => item.kind === 'value').map((item: any) => item.key)
    host.context.derivedFields = (payload.data ?? []).filter((item: any) => item.kind === 'derived').map((item: any) => item.key)
    host.set = (path, value) => {
      if (!host.context.writableFields.includes(String(path).split('.')[0])) { throw new Error(`[Store] Path is derived or missing: ${path}`) }
      this.app.set(`${host.basePath}.${path}`, copyJson(value))
      host.context.updatedAt = new Date().toISOString()
      host.emit('state:change', { path, value })
    }
    host.dispatch = (event) => {
      const handler = (payload.updateHandlers ?? []).find((item: any) => item.eventTypes?.includes(event.type))
      if (!handler) { return false }
      const update = this._program.getArtifact<Record<string, any>>('update', handler.identity)
      for (const mutation of update?.payload.mutations ?? []) {
        const path = String(mutation.path ?? '')
        const value = evaluateExpression(mutation.value ?? { type: 'read', source: 'input', path: '' }, { input: event.payload, event: event.payload, scope: this.app.get(host.basePath) })
        host.set?.(path, value)
      }
      return true
    }
    host.setStatus('active')
    return host
  }

  private _mountFilter(identity: string, parent: RuntimeHost, name: string): RuntimeHost {
    const artifact = this._requireArtifact('filter', identity)
    const host = this._createHost('filter', identity, parent, name, ['state', 'outputs'])
    const payload = artifact.payload as Record<string, any>
    const values = Object.fromEntries(Object.entries(payload.defaults ?? {}).map(([key, value]) => [key, evaluateExpression(value, { vars: this._context.vars })]))
    this.app.set(host.basePath, values)
    const refresh = () => {
      for (const output of payload.outputs ?? []) { host.setOutput(output.key, evaluateExpression(output.expression, { value: values, scope: values, vars: this._context.vars })) }
    }
    host.set = (path, value) => { writePath(values, path, value); this.app.set(host.basePath, copyJson(values)); refresh(); host.emit('state:change', { path, value }) }
    refresh()
    host.setStatus('active')
    return host
  }

  private _mountQuery(identity: string, parent: RuntimeHost, name: string, initialProps: Record<string, unknown>, descriptor: Record<string, any>, dataHosts: Map<string, RuntimeHost>): RuntimeHost {
    const artifact = this._requireArtifact('query', identity)
    const host = this._createHost('query', identity, parent, name, ['run', 'outputs'])
    const payload = artifact.payload as Record<string, any>
    host.run = async (override = {}) => {
      host.setStatus('running')
      const props = { ...initialProps, ...override }
      try {
        let response: unknown
        if (payload.mockDataEnabled || this._context.dataMode === 'mock') {
          response = copyJson(payload.mockData)
        }
        else {
          const endpoint = String(evaluateExpression(payload.endpoint, { props, vars: this._context.vars }) ?? '')
          const path = String(evaluateExpression(payload.query, { props, vars: this._context.vars }) ?? '')
          const headers = { ...(evaluateExpression(payload.headers, { props, vars: this._context.vars }) as Record<string, string> ?? {}) }
          const query: Record<string, unknown> = {}
          await this._applyAuth(payload.auth, headers, query)
          const body = evaluateExpression(payload.requestBody, { props, vars: this._context.vars })
          const method = String(evaluateExpression(payload.method, { props, vars: this._context.vars }) ?? 'POST').toUpperCase()
          const result = await this._host.http.request({
            url: joinUrl(endpoint, path),
            method,
            headers,
            query: ['GET', 'DELETE'].includes(method) ? body as Record<string, unknown> : query,
            body: ['GET', 'DELETE'].includes(method) ? undefined : body,
            signal: this._abortController?.signal,
          })
          response = result.data
        }
        for (const output of payload.outputs ?? []) {
          let value = output.source?.type === 'response' ? readPath(response, output.source.path) : host.getOutput(output.source?.key)
          for (const transform of output.transforms ?? []) { value = await this._runTransform(transform, value) }
          host.setOutput(output.key, value)
        }
        for (const publication of descriptor.storeTo ?? []) {
          const store = dataHosts.get(publication.data)
          Object.entries(publication.fields ?? {}).forEach(([field, output]) => store?.set?.(field, host.getOutput(String(output))))
        }
        host.setStatus('active')
        host.emit('success', host.getOutputs())
        return host.getOutputs()
      }
      catch (error) {
        host.context.error = error instanceof Error ? error.message : String(error)
        host.setStatus('error')
        host.emit('error', error)
        throw error
      }
    }
    host.setStatus('mounted')
    return host
  }

  private async _mountStream(identity: string, parent: RuntimeHost, name: string, descriptor: Record<string, any>, dataHosts: Map<string, RuntimeHost>): Promise<RuntimeHost> {
    const artifact = this._requireArtifact('stream', identity)
    const host = this._createHost('stream', identity, parent, name, ['stream'])
    const payload = copyJson(artifact.payload as Record<string, any>)
    const headers: Record<string, string> = {}
    await this._applyAuth({ mode: payload.transport?.authMode, profile: payload.transport?.authProfileIdentity }, headers, {})
    payload.__headers = headers
    const factory = this._host.stream(payload.transport?.kind)
    host.context.receivedCount = 0
    host.context.lastEventAt = null
    host.setStatus('running')
    host.connection = factory.open(payload, {
      open: () => host.setStatus('active'),
      error: (error) => { host.context.error = error instanceof Error ? error.message : String(error); host.setStatus('error') },
      message: message => this._handleStreamMessage(host, payload, message, descriptor, dataHosts),
    })
    return host
  }

  private _mountComponent(identity: string, parent: RuntimeHost, name: string, props: Record<string, unknown>): RuntimeHost {
    const artifact = this._requireArtifact('component-sfc', identity)
    const host = this._createHost('component-sfc', identity, parent, name, ['render-port', 'events'])
    this.app.set(`${host.basePath}.props`, copyJson(props))
    const state: RuntimeStateController = {
      get: path => this.app.get(path ? `${host.basePath}.${path}` : host.basePath),
      set: (path, value) => this.app.set(`${host.basePath}.${path}`, copyJson(value)),
      snapshot: () => copyJson((this.app.get(host.basePath) as Record<string, unknown>) ?? {}),
    }
    const port = host as RuntimeHost & ComponentSFCRenderPort
    Object.defineProperties(port, {
      runtimeState: { value: state, enumerable: false },
      readonly: { value: false, enumerable: true },
    })
    port.getIr = () => (artifact.payload as Record<string, any>).ir
    port.getArtifact = () => artifact
    host.meta.input = { kind: 'local', props: copyJson(props) }
    host.setStatus('active')
    return host
  }

  private _mountPage(identity: string, parent: RuntimeHost, name: string, props: Record<string, unknown>): RuntimeHost {
    const host = this._createHost('page', identity, parent, name, ['render-port'])
    host.meta.props = copyJson(props)
    host.setStatus('active')
    return host
  }

  private _handleStreamMessage(host: RuntimeHost, payload: Record<string, any>, message: StreamTransportMessage, descriptor: Record<string, any>, dataHosts: Map<string, RuntimeHost>): void {
    host.context.receivedCount += 1
    host.context.lastEventAt = new Date().toISOString()
    const mappings = (payload.events ?? []).filter((event: any) => event.sourceEvent === message.sourceEvent)
    for (const mapping of mappings) {
      const event = {
        type: mapping.type ?? String(readPath(message.data, mapping.typePath) ?? message.sourceEvent),
        payload: readPath(message.data, mapping.payloadPath),
      }
      host.setOutput('event', event)
      for (const alias of descriptor.dispatchTo ?? []) { dataHosts.get(alias)?.dispatch?.(event) }
      host.emit('event', event)
    }
  }

  private _wireCompositionGraph(host: RuntimeHost, payload: Record<string, any>, props: Record<string, unknown>, dataHosts: Map<string, RuntimeHost>, _descriptors: Map<string, Record<string, any>>): void {
    for (const publication of payload.graph?.publications ?? []) {
      const source = host.children.get(publication.sourceRuntime)
      if (!source) { continue }
      const publish = () => this.app.set(`${host.basePath}.data.${publication.targetData}${publication.targetPath ? `.${publication.targetPath}` : ''}`, source.getOutput(publication.sourceOutput))
      this._disposers.push(source.on('output:change', publish))
    }
    for (const success of payload.graph?.successes ?? []) {
      const source = host.children.get(success.sourceRuntime)
      const target = host.children.get(success.targetRuntime)
      if (source && target?.run) { this._disposers.push(source.on('success', () => { void target.run?.() })) }
    }
    for (const update of payload.graph?.updates ?? []) {
      if (update.source?.kind !== 'runtime-output') { continue }
      const source = host.children.get(update.source.runtime)
      const target = host.children.get(update.targetRuntime)
      if (source && target?.run) { this._disposers.push(source.on('output:change', () => { void target.run?.() })) }
    }
    for (const event of payload.graph?.events ?? []) {
      const source = host.children.get(event.runtime)
      if (!source) { continue }
      this._disposers.push(source.on(event.event, (input) => {
        const effect = event.effect
        if (effect.kind === 'execute-action') { void this._actions.execute(effect.action, input, { parentRuntimeId: host.id }) }
        if (effect.kind === 'mutate-store') { dataHosts.get(effect.data)?.set?.(effect.mutation.path, evaluateExpression(effect.mutation.value, { input, event: input, props })) }
        if (effect.kind === 'apply-update') { dataHosts.get(effect.data)?.dispatch?.({ type: effect.update, payload: input }) }
      }))
    }
  }

  private _resolveBinding(binding: unknown, composition: RuntimeHost, props: Record<string, unknown>, dataHosts: Map<string, RuntimeHost>): unknown {
    const value = binding as Record<string, any>
    if (!value || typeof value !== 'object') { return value }
    if (value.kind === 'literal') { return copyJson(value.value) }
    if (value.kind === 'output') { return composition.children.get(value.runtime)?.getOutput(value.output) }
    if (value.kind === 'outputs') { return composition.children.get(value.runtime)?.getOutputs() }
    if (value.kind === 'store') { return dataHosts.get(value.key) ? this.app.get(dataHosts.get(value.key)!.basePath) : undefined }
    if (value.kind === 'data') { return readPath(this.app.get(`${composition.basePath}.data.${value.data}`), value.path) }
    if (value.kind === 'expression') { return evaluateExpression(value.expression, { props, vars: this._context.vars, scope: this.app.get(composition.basePath) }) }
    return undefined
  }

  private async _runTransform(transform: Record<string, any>, value: unknown): Promise<unknown> {
    if (transform.kind === 'converter' || transform.type === 'converter') { return await this._converters.execute(transform.identity, value) }
    if (transform.kind === 'computation' || transform.type === 'computation') { return await this._computations.run(transform.identity, value) }
    if (transform.identity) { return this.runDataView(transform.identity, value, transform.props) }
    return value
  }

  public runDataView(identity: string, input: unknown, props: Record<string, unknown> = {}): unknown {
    const artifact = this._requireArtifact('data-view', identity)
    const payload = artifact.payload as Record<string, any>
    if (payload.expression) { return evaluateExpression(payload.expression, { input, props, scope: input, vars: this._context.vars }) }
    let value = input
    for (const step of payload.steps ?? []) {
      if (step.type === 'filter' && Array.isArray(value)) { value = value.filter(item => Boolean(evaluateExpression(step.expression, { input: item, scope: item, props }))) }
      if (step.type === 'map' && Array.isArray(value)) { value = value.map(item => ({ ...(item as object), ...Object.fromEntries(Object.entries(step.fields ?? {}).map(([key, expression]) => [key, evaluateExpression(expression, { input: item, scope: item, props })])) })) }
    }
    return value
  }

  private async _applyAuth(policy: Record<string, any> | null | undefined, headers: Record<string, string>, query: Record<string, unknown>): Promise<void> {
    if (!policy || policy.mode === 'none') { return }
    if (!this._host.resolveAuth) { throw new Error('[RuntimeTs] Auth resolver is required') }
    const session = await this._host.resolveAuth(policy)
    Object.assign(headers, session.headers ?? {})
    Object.assign(query, session.query ?? {})
    if (session.accessToken) { headers.Authorization = `Bearer ${session.accessToken}` }
  }

  private _createCompositionScopes(host: RuntimeHost, payload: Record<string, any>): void {
    for (const descriptor of payload.scopes ?? []) {
      if (descriptor.effectiveActivation?.mode !== 'startup') { continue }
      const id = `runtime-scope:${host.id}:${descriptor.path}`
      const parentScopeId = descriptor.parentPath ? `runtime-scope:${host.id}:${descriptor.parentPath}` : 'runtime-scope:app'
      this._scopeSnapshots.push({ id, path: descriptor.path, parentScopeId, ownerRuntimeId: host.id, generation: this._generation, state: 'active', memberRuntimeIds: [], childScopeIds: [], resources: {} })
      const parent = this._scopeSnapshots.find(scope => scope.id === parentScopeId)
      parent?.childScopeIds.push(id)
    }
  }

  private _scopeFor(host: RuntimeHost, path: string): Record<string, any> | undefined { return this._scopeSnapshots.find(scope => scope.id === `runtime-scope:${host.id}:${path}`) }

  private _captureRender(): Record<string, unknown> {
    const entries: Array<[string, Record<string, unknown>]> = []
    for (const host of this.getHosts()) {
      if (host.entityType === 'component-sfc') {
        entries.push([host.id, { kind: 'component-sfc', entityIdentity: host.entityIdentity, input: host.meta.input ?? null, computations: [], dataMeta: {} }])
      }
      else if (host.entityType === 'page') {
        entries.push([host.id, { kind: 'filter-view', model: { implementation: {}, props: host.meta.props ?? {}, fields: [] } }])
      }
    }
    return {
      hosts: Object.fromEntries(entries),
      styles: this._program.getArtifacts().filter(item => item.ref.entityType === 'style').map(item => item.payload),
    }
  }

  private _requireArtifact(type: string, identity: string): ProgramArtifact {
    const artifact = this._program.getArtifact(type, identity)
    if (!artifact) { throw new Error(`[RuntimeTs] Artifact is missing: ${type}:${identity}`) }
    return artifact
  }
}

function joinUrl(endpoint: string, path: string): string {
  if (/^https?:\/\//.test(path)) { return path }
  return `${endpoint.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
