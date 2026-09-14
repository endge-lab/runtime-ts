import type { ProgramArtifact, ProgramHostActionRequirement } from '@/features/runtime-ts/modules/program/program.types'

export interface RuntimeHttpRequest {
  url: string
  method: string
  headers?: Record<string, string>
  query?: Record<string, unknown>
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

export interface RuntimeHttpResponse {
  status: number
  headers: Record<string, string>
  data: unknown
}

export interface RuntimeHttpTransport {
  request: (request: RuntimeHttpRequest) => Promise<RuntimeHttpResponse>
}

export interface StreamTransportMessage {
  sourceEvent: string
  id: string | null
  data: unknown
}

export interface StreamTransportConnection {
  close: () => void | Promise<void>
  pause?: () => Promise<void>
  resume?: () => Promise<void>
}

export interface StreamTransportFactory {
  open: (
    artifact: Record<string, any>,
    callbacks: {
      message: (message: StreamTransportMessage) => void
      error: (error: unknown) => void
      open: () => void
    },
  ) => StreamTransportConnection
}

export interface RuntimeAuthSession {
  accessToken?: string | null
  profileIdentity?: string | null
  headers?: Record<string, string>
  query?: Record<string, string>
}

export type ResolveRuntimeAuth = (
  policy: Record<string, unknown>,
  options?: { forceRefresh?: boolean },
) => Promise<RuntimeAuthSession>

export interface ImplementationInvocation {
  executable: { type: string, identity: string, value?: unknown }
  input?: unknown
  target?: unknown
  context?: Record<string, unknown>
}

export interface RuntimeImplementationProvider {
  key: string
  active?: boolean
  canExecute?: (invocation: ImplementationInvocation) => boolean
  execute: (invocation: ImplementationInvocation) => unknown | Promise<unknown>
}

export interface RuntimeLogger {
  debug?: (message: string, data?: unknown) => void
  info?: (message: string, data?: unknown) => void
  warn?: (message: string, data?: unknown) => void
  error?: (message: string, data?: unknown) => void
}

export interface RuntimeTsHostOptions {
  http?: RuntimeHttpTransport
  streams?: Partial<Record<'sse' | 'websocket', StreamTransportFactory>>
  resolveAuth?: ResolveRuntimeAuth
  implementations?: readonly RuntimeImplementationProvider[]
  logger?: RuntimeLogger
}

export interface RuntimeHostCapabilities {
  assertRequirements: (requirements: readonly ProgramHostActionRequirement[], artifacts: readonly ProgramArtifact[]) => void
}
