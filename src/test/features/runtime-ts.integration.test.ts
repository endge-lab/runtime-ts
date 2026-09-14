import type { RuntimeHttpTransport, StreamTransportFactory } from '@/features/runtime-ts/modules/host/host.types'
import type { EndgeBundle } from '@/features/runtime-ts/modules/program/program.types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EndgeRuntimeTs } from '@/features/runtime-ts/kernel/EndgeRuntimeTs'
import { readInspectionRecording } from '@/features/runtime-ts/modules/inspection/inspection-recording'
import { normalizeRuntimeInspectionSnapshot } from '@/features/runtime-ts/modules/inspection/normalize-runtime-inspection'
import { readRuntimeInspectionSnapshot } from '@/features/runtime-ts/modules/inspection/runtime-inspection'
import { EndgeBundleCodec_Service } from '@/features/runtime-ts/modules/program/EndgeBundleCodec_Service'
import fixture from '@/test/fixtures/bundles/headless-runtime.json'

const bundleFixture = fixture as unknown as EndgeBundle

function createHost() {
  let streamCallbacks: Parameters<StreamTransportFactory['open']>[1] | null = null
  const close = vi.fn()
  const http: RuntimeHttpTransport = {
    request: vi.fn(async request => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { items: [{ id: 1, name: 'Коробка' }], request: request.body },
    })),
  }
  const stream: StreamTransportFactory = {
    open: vi.fn((_artifact, callbacks) => {
      streamCallbacks = callbacks
      callbacks.open()
      return { close }
    }),
  }
  return {
    options: {
      http,
      streams: { sse: stream },
      implementations: [{ key: 'fixture.refresh', execute: vi.fn(async invocation => invocation.input) }],
    },
    http,
    close,
    emit(data: unknown) { streamCallbacks?.message({ sourceEvent: 'message', id: null, data }) },
  }
}

describe('runtime TS с Execution Bundle', () => {
  afterEach(async () => { await EndgeRuntimeTs.reset() })

  it('headless запускает startup Composition, Query, Stream, Store и ComponentSFC', async () => {
    const host = createHost()
    const session = await EndgeRuntimeTs.run({ bundle: bundleFixture, host: host.options })

    expect(session.startupCompositionIdentity).toBe('warehouse-startup')
    expect(host.http.request).toHaveBeenCalledOnce()
    expect(session.output('items')).toEqual([{ id: 1, name: 'Коробка' }])

    const store = EndgeRuntimeTs.runtime.getHosts().find(item => item.entityType === 'store')
    const component = EndgeRuntimeTs.runtime.getHosts().find(item => item.entityType === 'component-sfc')
    expect(EndgeRuntimeTs.runtime.app.get(`${store?.basePath}.items`)).toEqual([{ id: 1, name: 'Коробка' }])
    expect((component as any).getIr()).toMatchObject({ version: 2 })

    host.emit({ type: 'stock.changed', payload: { items: [{ id: 2, name: 'Паллета' }] } })
    expect(EndgeRuntimeTs.runtime.app.get(`${store?.basePath}.items`)).toEqual([{ id: 2, name: 'Паллета' }])
  })

  it('выполняет host Action, Computation, Converter и DataView через Module accessors', async () => {
    const host = createHost()
    await EndgeRuntimeTs.run({ bundle: bundleFixture, host: host.options })
    expect(await EndgeRuntimeTs.actions.execute('warehouse.refresh', { force: true })).toEqual({ force: true })
    expect(await EndgeRuntimeTs.computations.run('warehouse-count', { count: 7 })).toBe(7)
    const dispose = EndgeRuntimeTs.implementations.registerProvider({ key: 'fixture.converter', execute: invocation => String(invocation.input).toUpperCase() })
    EndgeRuntimeTs.converters.bind('uppercase', 'fixture.converter')
    expect(await EndgeRuntimeTs.converters.execute('uppercase', 'box')).toBe('BOX')
    dispose()
    expect(EndgeRuntimeTs.runtime.runDataView('warehouse-visible', [{ id: 1 }])).toEqual([{ id: 1 }])
  })

  it('владеет operation history в Composition scope и выполняет undo/redo headless', async () => {
    const host = createHost()
    await EndgeRuntimeTs.run({ bundle: bundleFixture, host: host.options })
    const component = EndgeRuntimeTs.runtime.getHosts().find(item => item.entityType === 'component-sfc')
    const history = EndgeRuntimeTs.runtime.operations.resolveForHost(component)
    const undo = vi.fn(async () => 'undone')
    const redo = vi.fn(async () => 'redone')
    await history!.commit({ id: 'edit-1', input: { value: 1 }, runOutput: 'done', undo, redo })

    expect(EndgeRuntimeTs.runtime.operations.canUndo()).toBe(true)
    expect(await EndgeRuntimeTs.runtime.operations.undo()).toBe('undone')
    expect(await EndgeRuntimeTs.runtime.operations.redo()).toBe('redone')
    expect(undo).toHaveBeenCalledOnce()
    expect(redo).toHaveBeenCalledOnce()
    const scope = EndgeRuntimeTs.runtime.captureInspection().runtime.scopes.find(item => item.path === 'scope_default')
    expect(scope?.resources).toMatchObject({ total: 1, paused: false })
  })

  it('создаёт совместимый JSON-safe inspection Bundle с runtime и Raph data', async () => {
    const host = createHost()
    await EndgeRuntimeTs.run({ bundle: bundleFixture, host: host.options })

    const snapshot = EndgeRuntimeTs.runtime.captureInspection(true)
    expect(readRuntimeInspectionSnapshot(snapshot)).toEqual(snapshot)
    expect(snapshot.runtime.total).toBeGreaterThanOrEqual(6)
    expect(snapshot.data).toBeTruthy()
    expect(snapshot.render).toMatchObject({ hosts: expect.any(Object), styles: expect.any(Array) })
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
    const normalized = normalizeRuntimeInspectionSnapshot(snapshot)
    expect(normalized.runtime.generatedAt).toBe(0)
    expect(normalized.dataGeneratedAt).toBe(0)
    expect(normalized.runtime.hosts.map(({ entityIdentity, entityType, id, status }) => ({ entityIdentity, entityType, id, status }))).toEqual([
      { entityIdentity: 'warehouse-startup', entityType: 'composition', id: 'app:warehouse-startup:1', status: 'active' },
      { entityIdentity: 'warehouse-stream', entityType: 'stream', id: 'app:warehouse-startup:1:events:5', status: 'active' },
      { entityIdentity: 'warehouse-filter', entityType: 'filter', id: 'app:warehouse-startup:1:filters:3', status: 'active' },
      { entityIdentity: 'warehouse-query', entityType: 'query', id: 'app:warehouse-startup:1:search:4', status: 'active' },
      { entityIdentity: 'warehouse-view', entityType: 'component-sfc', id: 'app:warehouse-startup:1:view:6', status: 'active' },
      { entityIdentity: 'warehouse-store', entityType: 'store', id: 'app:warehouse-startup:1:warehouse:2', status: 'active' },
    ])

    const bundle = EndgeRuntimeTs.exportInspectionBundle({ includeData: true })
    expect(bundle.bundle?.programId).toBe('runtime-ts-test-program')
    expect(bundle.inspection?.programId).toBe(bundle.bundle?.programId)
    expect(bundle.inspection?.chunks[0]?.records[0]?.value.dataAvailable).toBe(true)
    expect(readInspectionRecording(bundle.inspection)).toEqual(bundle.inspection)
  })

  it('декодирует JSON и Gzip без изменения Bundle', async () => {
    const codec = new EndgeBundleCodec_Service()
    const gzip = await codec.encode(bundleFixture, 'gzip')
    const decoded = await codec.decode(gzip)
    expect(decoded.bundle?.programId).toBe('runtime-ts-test-program')
    const host = createHost()
    const session = await EndgeRuntimeTs.run({ bundle: gzip, host: host.options })
    expect(session.startupCompositionIdentity).toBe('warehouse-startup')
  })

  it('отклоняет отсутствующие host capabilities до частичной установки', async () => {
    await expect(EndgeRuntimeTs.run({ bundle: bundleFixture })).rejects.toThrow('Missing host action providers')
    expect(EndgeRuntimeTs.state).toBe('idle')
    expect(EndgeRuntimeTs.program.programId).toBeNull()
    expect(EndgeRuntimeTs.runtime.getHosts()).toEqual([])
  })

  it('откатывает lifecycle при отсутствии startup Composition', async () => {
    const broken = structuredClone(fixture) as unknown as EndgeBundle
    broken.bundle!.catalog.workspace!.startupCompositionIdentity = 'missing'
    const host = createHost()
    await expect(EndgeRuntimeTs.run({ bundle: broken, host: host.options })).rejects.toThrow('Startup Composition is missing')
    expect(EndgeRuntimeTs.state).toBe('idle')
    expect(EndgeRuntimeTs.program.programId).toBeNull()
  })

  it('отклоняет несовместимый контейнер и отсутствующую зависимость artifact', async () => {
    const incompatible = structuredClone(fixture) as unknown as EndgeBundle
    Object.assign(incompatible.bundle!, { version: 2 })
    await expect(EndgeRuntimeTs.run({ bundle: incompatible })).rejects.toThrow('Unsupported program version')

    const missingDependency = structuredClone(fixture) as unknown as EndgeBundle
    delete missingDependency.bundle!.artifacts['store:store-1']
    await expect(EndgeRuntimeTs.run({ bundle: missingDependency })).rejects.toThrow('Missing artifact dependency')

    const invalidJson = new TextEncoder().encode('{not-json')
    await expect(EndgeRuntimeTs.run({ bundle: invalidJson })).rejects.toThrow()
    expect(EndgeRuntimeTs.state).toBe('idle')
    expect(EndgeRuntimeTs.program.programId).toBeNull()
  })

  it('обрабатывает WebSocket transport через тот же headless stream contract', async () => {
    const websocketBundle = structuredClone(fixture) as unknown as EndgeBundle
    const streamArtifact = websocketBundle.bundle!.artifacts['stream:stream-1']!
    const streamPayload = streamArtifact.payload as Record<string, any>
    streamPayload.transport.kind = 'websocket'
    const host = createHost()
    await EndgeRuntimeTs.run({ bundle: websocketBundle, host: { ...host.options, streams: { websocket: host.options.streams.sse } } })

    host.emit({ type: 'stock.changed', payload: { items: [{ id: 3, name: 'Ящик' }] } })
    const store = EndgeRuntimeTs.runtime.getHosts().find(item => item.entityType === 'store')
    expect(EndgeRuntimeTs.runtime.app.get(`${store?.basePath}.items`)).toEqual([{ id: 3, name: 'Ящик' }])
  })

  it('reset отменяет активные HTTP-запросы и очищает runtime owners', async () => {
    let requestCount = 0
    const pending = { signal: null as AbortSignal | null }
    const base = createHost()
    const http: RuntimeHttpTransport = {
      request: async (request) => {
        requestCount += 1
        if (requestCount === 1) {
          return { status: 200, headers: {}, data: { items: [] } }
        }
        pending.signal = request.signal ?? null
        return await new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true })
        })
      },
    }
    await EndgeRuntimeTs.run({ bundle: bundleFixture, host: { ...base.options, http } })
    const query = EndgeRuntimeTs.runtime.getHosts().find(item => item.entityType === 'query')
    const request = query!.run!()
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(pending.signal?.aborted).toBe(false))

    await EndgeRuntimeTs.reset()
    await rejection
    expect(pending.signal?.aborted).toBe(true)
    expect(base.close).toHaveBeenCalledOnce()
    expect(EndgeRuntimeTs.runtime.getHosts()).toEqual([])
    expect(EndgeRuntimeTs.program.programId).toBeNull()
  })

  it('abortSignal завершает активную сессию полным reset', async () => {
    const controller = new AbortController()
    const host = createHost()
    await EndgeRuntimeTs.run({ bundle: bundleFixture, host: host.options, signal: controller.signal })
    controller.abort()

    await vi.waitFor(() => expect(EndgeRuntimeTs.state).toBe('idle'))
    expect(host.close).toHaveBeenCalledOnce()
    expect(EndgeRuntimeTs.program.programId).toBeNull()
  })

  it('требует reset перед повторным Bundle и освобождает stream resources', async () => {
    const host = createHost()
    await EndgeRuntimeTs.run({ bundle: bundleFixture, host: host.options })
    const generation = EndgeRuntimeTs.runtime.captureInspection().runtime.generation
    await expect(EndgeRuntimeTs.run({ bundle: bundleFixture, host: host.options })).rejects.toThrow('reset is required')
    await EndgeRuntimeTs.reset()
    expect(host.close).toHaveBeenCalledOnce()
    expect(EndgeRuntimeTs.runtime.getHosts()).toEqual([])
    const next = createHost()
    await EndgeRuntimeTs.run({ bundle: bundleFixture, host: next.options })
    expect(EndgeRuntimeTs.runtime.captureInspection().runtime.generation).toBe(generation + 1)
  })
})
