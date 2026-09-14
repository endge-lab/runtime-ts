import type { RuntimeInspectionSnapshot } from '@/features/runtime-ts/modules/program/program.types'
import { copyJson } from '@/features/runtime-ts/shared/json'

export function normalizeRuntimeInspectionSnapshot(input: RuntimeInspectionSnapshot): RuntimeInspectionSnapshot {
  const value = copyJson(input)
  value.runtime.generatedAt = 0
  if (value.dataGeneratedAt !== undefined) { value.dataGeneratedAt = 0 }
  value.runtime.hosts.forEach((host) => {
    host.createdAt = 0
    host.updatedAt = 0
    host.removedAt = host.removedAt === null ? null : 0
  })
  value.runtime.deletedHosts.forEach((host) => {
    host.createdAt = 0
    host.updatedAt = 0
    host.removedAt = host.removedAt === null ? null : 0
  })
  value.runtime.hosts.sort((left, right) => left.id.localeCompare(right.id))
  value.runtime.deletedHosts.sort((left, right) => left.id.localeCompare(right.id))
  value.runtime.scopes.sort((left, right) => String(left.id).localeCompare(String(right.id)))
  return value
}
