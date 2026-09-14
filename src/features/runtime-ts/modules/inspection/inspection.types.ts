import type { InspectionRecording } from '@/features/runtime-ts/modules/program/program.types'

export interface InspectionCapture {
  readonly recording: InspectionRecording
  setIncludeData: (value: boolean) => void
  snapshot: (reason?: 'manual' | 'resync') => void
  stop: () => void
}
