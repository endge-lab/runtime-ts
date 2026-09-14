import type { RuntimeInspectionSnapshot } from '@/features/runtime-ts/modules/program/program.types'
import { asObject, copyJson } from '@/features/runtime-ts/shared/json'

const HOST_STATUSES = new Set(['created', 'mounted', 'running', 'active', 'pausing', 'paused', 'stopping', 'stopped', 'unmounted', 'destroyed', 'error'])
const SCOPE_STATUSES = new Set(['inactive', 'activating', 'active', 'pausing', 'paused', 'resuming', 'deactivating', 'error', 'disposed'])

export function readRuntimeInspectionSnapshot(input: unknown): RuntimeInspectionSnapshot {
  const value = asObject(copyJson(input), 'runtime inspection')
  const runtime = asObject(value.runtime, 'runtime inspection structure')
  if (value.version !== 1 || !finite(runtime.generatedAt) || !Array.isArray(runtime.hosts) || !Array.isArray(runtime.scopes) || !Array.isArray(runtime.deletedHosts) || !isRecord(runtime.byStatus)) {
    throw new Error('[Endge Runtime] Invalid runtime inspection structure')
  }
  const parents = new Map<string, string | null>()
  runtime.hosts.forEach((raw: unknown) => {
    const host = asObject(raw, 'host inspection descriptor')
    if (!id(host.id) || parents.has(host.id) || !(host.parentId === null || id(host.parentId)) || !id(host.entityType) || !id(host.entityIdentity)
      || typeof host.title !== 'string' || typeof host.basePath !== 'string' || !HOST_STATUSES.has(String(host.status))
      || !finite(host.createdAt) || !finite(host.updatedAt) || !isRecord(host.meta) || !isRecord(host.context)
      || !Array.isArray(host.resources) || !Array.isArray(host.channels) || !Array.isArray(host.capabilities)) {
      throw new Error('[Endge Runtime] Invalid host inspection descriptor')
    }
    parents.set(host.id, host.parentId)
  })
  validateParents(parents)
  parents.clear()
  runtime.scopes.forEach((raw: unknown) => {
    const scope = asObject(raw, 'scope inspection descriptor')
    if (!id(scope.id) || parents.has(scope.id) || typeof scope.path !== 'string' || !(scope.parentScopeId === null || id(scope.parentScopeId))
      || !(scope.ownerRuntimeId === null || id(scope.ownerRuntimeId)) || !Number.isSafeInteger(scope.generation) || scope.generation < 0
      || !SCOPE_STATUSES.has(String(scope.state)) || !Array.isArray(scope.memberRuntimeIds) || !scope.memberRuntimeIds.every(id)
      || !Array.isArray(scope.childScopeIds) || !scope.childScopeIds.every(id) || !isRecord(scope.resources)) {
      throw new Error('[Endge Runtime] Invalid scope inspection descriptor')
    }
    parents.set(scope.id, scope.parentScopeId)
  })
  validateParents(parents)
  if (value.dataGeneratedAt !== undefined && !finite(value.dataGeneratedAt)) { throw new Error('[Endge Runtime] Invalid data capture time') }
  validateRender(value.render)
  return value as unknown as RuntimeInspectionSnapshot
}

function validateRender(input: unknown): void {
  if (input === undefined) { return }
  const render = asObject(input, 'render inspection')
  const hosts = asObject(render.hosts, 'render hosts')
  if (!Array.isArray(render.styles)) { throw new TypeError('[Endge Runtime] Invalid render inspection') }
  Object.entries(hosts).forEach(([hostId, raw]) => {
    const value = asObject(raw, 'render descriptor')
    if (!id(hostId)) { throw new Error('[Endge Runtime] Invalid render descriptor') }
    if (value.kind === 'component-sfc') {
      if (!Array.isArray(value.computations) || !isRecord(value.dataMeta)) { throw new Error('[Endge Runtime] Invalid component render descriptor') }
    }
    else if (value.kind === 'filter-view') {
      const model = asObject(value.model, 'filter render model')
      if (!isRecord(model.implementation) || !isRecord(model.props) || !Array.isArray(model.fields)) { throw new Error('[Endge Runtime] Invalid filter render descriptor') }
    }
    else {
      throw new Error('[Endge Runtime] Unsupported render descriptor')
    }
  })
}

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 4096 }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function validateParents(parents: Map<string, string | null>): void {
  for (const root of parents.keys()) {
    const branch = new Set<string>()
    let current: string | null = root
    while (current && parents.has(current)) {
      if (branch.has(current)) { throw new Error('[Endge Runtime] Cyclic inspection hierarchy') }
      branch.add(current)
      current = parents.get(current) ?? null
    }
  }
}
