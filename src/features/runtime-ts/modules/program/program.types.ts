import type { BundleJsonValue } from '@/features/runtime-ts/shared/json'

export type ProgramArtifactKey = string

export type ProgramEntityType
  = | 'type'
    | 'component-sfc'
    | 'computation'
    | 'action'
    | 'query'
    | 'vocab'
    | 'data-view'
    | 'store'
    | 'stream'
    | 'simulation'
    | 'update'
    | 'filter'
    | 'composition'
    | 'style'
    | 'configuration'

export interface ProgramArtifactRef {
  entityType: ProgramEntityType
  id: string | number
  identity: string
}

export interface ProgramDependency {
  entityType: ProgramEntityType | string
  id: string | number
  identity?: string
  role?: string
}

export interface ProgramDiagnostic {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  entityRef?: ProgramArtifactRef
  sourcePath?: string
  start?: number
  end?: number
}

export interface ProgramArtifact<TPayload = BundleJsonValue> {
  ref: ProgramArtifactRef
  sourceHash: string
  compilerVersion: string
  contextHash?: string
  status: 'valid' | 'warning' | 'error'
  diagnostics: ProgramDiagnostic[]
  dependencies: ProgramDependency[]
  capabilities: string[]
  metadata: Record<string, BundleJsonValue>
  payload: TPayload
  children?: ProgramArtifact[]
}

export interface CompiledWorkspaceDescriptor {
  identity: string
  displayName: string
  startupCompositionIdentity: string | null
  documentStructure?: 'frontend' | 'custom'
}

export interface CompiledProgramCatalog {
  workspace?: CompiledWorkspaceDescriptor
  folders: Record<string, Record<string, BundleJsonValue>>
  documents: Record<string, Record<string, BundleJsonValue>>
}

export interface ProgramHostActionRequirement {
  identity: string
  owner: string
  providerKey: string
}

export interface ExecutionBundle {
  version: 1
  programId: string
  compilerVersion: string
  createdAt: string
  context: {
    workspace: string | null
    facets: Record<string, string>
    user: string | null
    locale: string | null
    theme: string | null
    timezone: string | null
    configuration: Record<string, BundleJsonValue>
    [key: string]: BundleJsonValue
  }
  requirements: {
    hostActions?: ProgramHostActionRequirement[]
    artifactTypes: string[]
    componentTags: Array<{ tag: string, identity: string }>
  }
  catalog: CompiledProgramCatalog
  artifacts: Record<ProgramArtifactKey, ProgramArtifact>
}

export interface EndgeBundle {
  format: 'endge-bundle'
  version: 1
  bundle?: ExecutionBundle
  inspection?: InspectionRecording
}

export interface InspectionState {
  context: Record<string, BundleJsonValue>
  runtime: RuntimeInspectionSnapshot
  data: BundleJsonValue | null
  dataAvailable: boolean
}

export interface InspectionRecord {
  sequence: number
  at: number
  kind: 'snapshot'
  scope: 'inspection'
  revision: number
  reason: 'initial' | 'manual' | 'resync' | 'checkpoint'
  value: InspectionState
}

export interface InspectionChunk {
  firstSequence: number
  lastSequence: number
  records: InspectionRecord[]
}

export interface InspectionRecording {
  version: 1
  programId: string
  runId: string
  recordingId: string
  chunks: InspectionChunk[]
}

export type RuntimeHostStatus = 'created' | 'mounted' | 'running' | 'active' | 'error' | 'pausing' | 'paused' | 'stopping' | 'stopped' | 'unmounted' | 'destroyed'

export interface RuntimeHostSnapshot {
  id: string
  runtimeType: string
  entityType: string
  entityIdentity: string
  title: string
  status: RuntimeHostStatus
  parentId: string | null
  removedAt: number | null
  createdAt: number
  updatedAt: number
  basePath: string
  capabilities: string[]
  resources: Array<Record<string, BundleJsonValue>>
  channels: Array<Record<string, BundleJsonValue>>
  context: Record<string, BundleJsonValue>
  meta: Record<string, BundleJsonValue>
}

export interface RuntimeInspectionSnapshot {
  version: 1
  runtime: {
    generatedAt: number
    generation: number
    total: number
    hosts: RuntimeHostSnapshot[]
    deletedHosts: RuntimeHostSnapshot[]
    deletedTotal: number
    byStatus: Record<string, number>
    scopes: Array<Record<string, BundleJsonValue>>
  }
  data?: BundleJsonValue
  render?: BundleJsonValue
  dataGeneratedAt?: number
  dataError?: string
}
