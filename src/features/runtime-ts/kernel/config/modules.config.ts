import type { EndgeModuleDefinition } from '@/features/federation/types/endge-modules.types'
import { EndgeActions_Module } from '@/features/runtime-ts/modules/actions/EndgeActions_Module'
import { EndgeComputations_Module } from '@/features/runtime-ts/modules/computations/EndgeComputations_Module'
import { EndgeConfiguration_Module } from '@/features/runtime-ts/modules/configuration/EndgeConfiguration_Module'
import { EndgeContext_Module } from '@/features/runtime-ts/modules/context/EndgeContext_Module'
import { EndgeConverters_Module } from '@/features/runtime-ts/modules/converters/EndgeConverters_Module'
import { EndgeEvents_Module } from '@/features/runtime-ts/modules/events/EndgeEvents_Module'
import { EndgeHost_Module } from '@/features/runtime-ts/modules/host/EndgeHost_Module'
import { EndgeImplementations_Module } from '@/features/runtime-ts/modules/implementations/EndgeImplementations_Module'
import { EndgeInspection_Module } from '@/features/runtime-ts/modules/inspection/EndgeInspection_Module'
import { EndgeMock_Module } from '@/features/runtime-ts/modules/mock/EndgeMock_Module'
import { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeRuntime_Module } from '@/features/runtime-ts/modules/runtime/EndgeRuntime_Module'
import { EndgeVocabs_Module } from '@/features/runtime-ts/modules/vocabs/EndgeVocabs_Module'
import { EndgeWorkspace_Module } from '@/features/runtime-ts/modules/workspace/EndgeWorkspace_Module'

export const ENDGE_RUNTIME_TS_MODULES = [
  { key: 'events', create: () => new EndgeEvents_Module() },
  { key: 'program', create: () => new EndgeProgram_Module(), after: 'events' },
  { key: 'context', create: ({ getModule }) => new EndgeContext_Module(getModule('program')), after: ['program', 'events'] },
  { key: 'workspace', create: ({ getModule }) => new EndgeWorkspace_Module(getModule('program')), after: ['program', 'context'] },
  { key: 'configuration', create: ({ getModule }) => new EndgeConfiguration_Module(getModule('program')), after: ['program', 'context', 'workspace'] },
  { key: 'implementations', create: () => new EndgeImplementations_Module(), after: 'context' },
  { key: 'environment', create: ({ getModule }) => new EndgeHost_Module(getModule('program'), getModule('implementations')), after: ['program', 'configuration', 'implementations'] },
  { key: 'converters', create: ({ getModule }) => new EndgeConverters_Module(getModule('implementations')), after: 'implementations' },
  { key: 'computations', create: ({ getModule }) => new EndgeComputations_Module(getModule('program'), getModule('implementations')), after: ['program', 'implementations'] },
  { key: 'actions', create: ({ getModule }) => new EndgeActions_Module(getModule('program'), getModule('implementations')), after: ['program', 'implementations', 'computations', 'converters'] },
  { key: 'mock', create: () => new EndgeMock_Module(), after: 'context' },
  { key: 'vocabs', create: ({ getModule }) => new EndgeVocabs_Module(getModule('program'), getModule('environment')), after: ['program', 'environment', 'mock'] },
  {
    key: 'runtime',
    create: ({ getModule }) => new EndgeRuntime_Module(
      getModule('program'),
      getModule('context'),
      getModule('workspace'),
      getModule('environment'),
      getModule('actions'),
      getModule('computations'),
      getModule('converters'),
      getModule('vocabs'),
      getModule('events'),
    ),
    after: ['program', 'context', 'workspace', 'environment', 'actions', 'computations', 'converters', 'vocabs'],
  },
  {
    key: 'inspection',
    create: ({ getModule }) => new EndgeInspection_Module(getModule('context'), getModule('runtime'), getModule('events'), getModule('program')),
    after: ['runtime', 'program', 'events', 'context'],
  },
] as const satisfies readonly EndgeModuleDefinition[]
