import type { EndgeFederationContext } from '@/features/federation/types/federation.types'
import type { RuntimeTsHostOptions } from '@/features/runtime-ts/modules/host/host.types'
import type { EndgeBundle, ExecutionBundle } from '@/features/runtime-ts/modules/program/program.types'

export type RuntimeTsBundleInput = ExecutionBundle | EndgeBundle | Uint8Array

export interface RuntimeTsRunOptions extends EndgeFederationContext {
  bundle: RuntimeTsBundleInput
  vars?: Record<string, unknown>
  host?: RuntimeTsHostOptions
}

export interface RuntimeTsBootContext extends EndgeFederationContext {
  bundle: ExecutionBundle
  vars: Record<string, unknown>
  host: RuntimeTsHostOptions
}
