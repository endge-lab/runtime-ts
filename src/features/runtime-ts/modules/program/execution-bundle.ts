import type { EndgeBundle, ExecutionBundle, ProgramArtifact, ProgramEntityType } from './program.types'
import { readInspectionRecording } from '@/features/runtime-ts/modules/inspection/inspection-recording'
import { asObject, asText, copyJson } from '@/features/runtime-ts/shared/json'

const PAYLOAD_TYPES = new Set<ProgramEntityType>([
  'type',
  'component-sfc',
  'computation',
  'action',
  'query',
  'vocab',
  'data-view',
  'store',
  'stream',
  'simulation',
  'update',
  'filter',
  'composition',
  'style',
  'configuration',
])

export function readExecutionBundle(input: unknown): ExecutionBundle {
  const value = asObject(copyJson(input), 'program')
  if (value.version !== 1) {
    throw new Error('[Bundle] Unsupported program version')
  }
  asText(value.programId, 'programId')
  asText(value.compilerVersion, 'compilerVersion')
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new TypeError('[Bundle] Invalid creation time')
  }
  const context = asObject(value.context, 'context')
  const facets = asObject(context.facets, 'context facets')
  if (Object.values(facets).some(item => typeof item !== 'string')) {
    throw new Error('[Bundle] Invalid context facets')
  }
  asObject(context.configuration, 'configuration')
  const requirements = asObject(value.requirements, 'requirements')
  if (!Array.isArray(requirements.artifactTypes) || !Array.isArray(requirements.componentTags)) {
    throw new TypeError('[Bundle] Invalid requirements')
  }
  if (requirements.artifactTypes.some(type => !PAYLOAD_TYPES.has(type))) {
    throw new Error('[Bundle] Unsupported artifact requirement')
  }
  const hostActions = new Set<string>()
  if (requirements.hostActions !== undefined) {
    if (!Array.isArray(requirements.hostActions)) {
      throw new TypeError('[Bundle] Invalid host action requirements')
    }
    requirements.hostActions.forEach((raw: unknown) => {
      const action = asObject(raw, 'host action')
      const identity = asText(action.identity, 'host action identity')
      asText(action.owner, 'host action owner')
      asText(action.providerKey, 'host action provider')
      if (hostActions.has(identity)) {
        throw new Error('[Bundle] Duplicate host action requirement')
      }
      hostActions.add(identity)
    })
  }
  const catalog = asObject(value.catalog, 'catalog')
  asObject(catalog.folders, 'catalog folders')
  asObject(catalog.documents, 'catalog documents')
  if (catalog.workspace !== undefined) {
    const workspace = asObject(catalog.workspace, 'catalog workspace')
    asText(workspace.identity, 'workspace identity')
    asText(workspace.displayName, 'workspace displayName')
    if (workspace.identity !== context.workspace) {
      throw new Error('[Bundle] Workspace context mismatch')
    }
    if (workspace.startupCompositionIdentity !== null && typeof workspace.startupCompositionIdentity !== 'string') {
      throw new Error('[Bundle] Invalid startup Composition')
    }
  }
  const artifacts = asObject(value.artifacts, 'artifacts')
  const identities = new Set<string>()
  const allArtifacts: ProgramArtifact[] = []
  const validateArtifact = (raw: unknown, key?: string): void => {
    const artifact = asObject(raw, 'artifact')
    const ref = asObject(artifact.ref, 'artifact ref')
    if (!PAYLOAD_TYPES.has(ref.entityType)) {
      throw new Error('[Bundle] Unsupported artifact type')
    }
    if (typeof ref.id !== 'string' && typeof ref.id !== 'number') {
      throw new TypeError('[Bundle] Invalid artifact id')
    }
    const identity = asText(ref.identity, 'artifact identity')
    if (key !== undefined && key !== `${ref.entityType}:${ref.id}`) {
      throw new Error('[Bundle] Artifact key mismatch')
    }
    const identityKey = `${ref.entityType}:${identity}`
    if (key !== undefined && identities.has(identityKey)) {
      throw new Error('[Bundle] Duplicate artifact identity')
    }
    identities.add(identityKey)
    if (!['valid', 'warning'].includes(artifact.status)) {
      throw new Error('[Bundle] Artifact has compilation errors')
    }
    if (artifact.compilerVersion !== value.compilerVersion) {
      throw new Error('[Bundle] Mixed compiler versions')
    }
    asText(artifact.sourceHash, 'artifact sourceHash')
    if (!Array.isArray(artifact.dependencies) || !Array.isArray(artifact.diagnostics) || !Array.isArray(artifact.capabilities)) {
      throw new TypeError('[Bundle] Invalid artifact collections')
    }
    if (artifact.diagnostics.some((item: any) => item?.severity === 'error')) {
      throw new Error('[Bundle] Artifact has compilation errors')
    }
    asObject(artifact.metadata, 'artifact metadata')
    asObject(artifact.payload, 'artifact payload')
    allArtifacts.push(artifact as ProgramArtifact)
    if (artifact.children !== undefined) {
      if (!Array.isArray(artifact.children)) {
        throw new TypeError('[Bundle] Invalid child artifacts')
      }
      artifact.children.forEach((child: unknown) => validateArtifact(child))
    }
  }
  Object.entries(artifacts).forEach(([key, artifact]) => validateArtifact(artifact, key))
  allArtifacts.forEach((artifact) => {
    artifact.dependencies.forEach((dependency) => {
      if (!PAYLOAD_TYPES.has(dependency.entityType as ProgramEntityType)) {
        return
      }
      if (dependency.entityType === 'action' && hostActions.has(String(dependency.identity ?? dependency.id))) {
        return
      }
      const exists = allArtifacts.some(candidate => candidate.ref.entityType === dependency.entityType
        && (String(candidate.ref.id) === String(dependency.id) || candidate.ref.identity === dependency.identity))
      if (!exists) {
        throw new Error(`[Bundle] Missing artifact dependency: ${artifact.ref.entityType}:${artifact.ref.identity} -> ${dependency.entityType}:${dependency.identity ?? dependency.id}`)
      }
    })
  })
  requirements.componentTags.forEach((raw: unknown) => {
    const tag = asObject(raw, 'component tag')
    asText(tag.tag, 'component tag')
    const identity = asText(tag.identity, 'component identity')
    if (!identities.has(`component-sfc:${identity}`)) {
      throw new Error('[Bundle] Missing component tag artifact')
    }
  })
  return value as ExecutionBundle
}

export function readEndgeBundle(input: unknown): EndgeBundle {
  const value = asObject(copyJson(input), 'container')
  if (value.format !== 'endge-bundle' || value.version !== 1 || (!value.bundle && !value.inspection)) {
    throw new Error('[Bundle] Unsupported or empty Endge Bundle')
  }
  const bundle = value.bundle === undefined ? undefined : readExecutionBundle(value.bundle)
  const inspection = value.inspection === undefined ? undefined : readInspectionRecording(value.inspection)
  if (bundle && inspection && bundle.programId !== inspection.programId) { throw new Error('[Bundle] Program and recording do not match') }
  return { format: 'endge-bundle', version: 1, ...(bundle ? { bundle } : {}), ...(inspection ? { inspection } : {}) }
}
