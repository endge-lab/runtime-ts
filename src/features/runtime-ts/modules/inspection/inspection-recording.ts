import type { InspectionRecording, InspectionState } from '@/features/runtime-ts/modules/program/program.types'
import { asObject, asText, copyJson } from '@/features/runtime-ts/shared/json'
import { readRuntimeInspectionSnapshot } from './runtime-inspection'

export function readInspectionState(input: unknown): InspectionState {
  const value = asObject(copyJson(input), 'inspection state')
  const context = asObject(value.context, 'inspection context')
  for (const key of ['workspace', 'user', 'locale', 'theme', 'timezone']) {
    if (context[key] !== null && typeof context[key] !== 'string') { throw new Error('[Inspection] Invalid context field') }
  }
  const facets = asObject(context.facets, 'facets')
  if (Object.values(facets).some(item => typeof item !== 'string')) { throw new Error('[Inspection] Invalid facets') }
  if (context.dataMode !== undefined && !['live', 'mock'].includes(context.dataMode)) { throw new Error('[Inspection] Invalid data mode') }
  readRuntimeInspectionSnapshot(value.runtime)
  if (typeof value.dataAvailable !== 'boolean' || !Object.hasOwn(value, 'data')) { throw new Error('[Inspection] Missing data availability') }
  return value as unknown as InspectionState
}

export function readInspectionRecording(input: unknown): InspectionRecording {
  const value = asObject(copyJson(input), 'recording')
  if (value.version !== 1 || !Array.isArray(value.chunks)) { throw new Error('[Inspection] Unsupported recording') }
  asText(value.programId, 'programId')
  asText(value.runId, 'runId')
  asText(value.recordingId, 'recordingId')
  let expectedSequence: number | null = null
  value.chunks.forEach((raw: unknown) => {
    const chunk = asObject(raw, 'inspection chunk')
    if (!Array.isArray(chunk.records) || !chunk.records.length) { throw new Error('[Inspection] Invalid chunk records') }
    chunk.records.forEach((entry: unknown, index: number) => {
      const record = asObject(entry, 'inspection record')
      if (!Number.isSafeInteger(record.sequence) || record.sequence < 0 || !Number.isFinite(record.at) || record.at < 0) { throw new Error('[Inspection] Invalid record position') }
      if (expectedSequence !== null && record.sequence !== expectedSequence) { throw new Error('[Inspection] Non-contiguous recording') }
      expectedSequence = record.sequence + 1
      if (record.kind !== 'snapshot' || record.scope !== 'inspection' || !['initial', 'manual', 'resync', 'checkpoint'].includes(record.reason)) { throw new Error('[Inspection] Unsupported runtime-ts record') }
      if (!Number.isSafeInteger(record.revision) || record.revision < 0) { throw new Error('[Inspection] Invalid snapshot revision') }
      readInspectionState(record.value)
      if (index === 0 && chunk.firstSequence !== record.sequence) { throw new Error('[Inspection] Chunk range mismatch') }
      if (index === chunk.records.length - 1 && chunk.lastSequence !== record.sequence) { throw new Error('[Inspection] Chunk range mismatch') }
    })
  })
  return value as unknown as InspectionRecording
}
