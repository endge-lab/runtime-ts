import type { InspectionCapture } from './inspection.types'
import type { EndgeContext_Module } from '@/features/runtime-ts/modules/context/EndgeContext_Module'
import type { EndgeEvents_Module } from '@/features/runtime-ts/modules/events/EndgeEvents_Module'
import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import type { InspectionRecord, InspectionRecording, InspectionState } from '@/features/runtime-ts/modules/program/program.types'
import type { EndgeRuntime_Module } from '@/features/runtime-ts/modules/runtime/EndgeRuntime_Module'
import { v4 as uuid } from 'uuid'
import { EndgeModule } from '@/features/federation/EndgeModule'
import { copyJson } from '@/features/runtime-ts/shared/json'

export class EndgeInspection_Module extends EndgeModule {
  private readonly _captures = new Set<InspectionCapture>()
  private _runId = uuid()

  public constructor(
    private readonly _context: EndgeContext_Module,
    private readonly _runtime: EndgeRuntime_Module,
    private readonly _events: EndgeEvents_Module,
    private readonly _program: EndgeProgram_Module,
  ) { super() }

  public captureState(includeData = false): InspectionState {
    const captured = this._runtime.captureInspection(includeData)
    const { data, ...runtime } = captured
    return copyJson({
      context: { ...this._context.serialize(), dataMode: this._context.dataMode },
      runtime,
      data: data ?? null,
      dataAvailable: includeData,
    }) as InspectionState
  }

  public createCapture(options: { includeData?: boolean } = {}): InspectionCapture {
    if (!this._program.programId) { throw new Error('[Inspection] A running application is required') }
    let includeData = options.includeData === true
    let sequence = 0
    let revision = 0
    let stopped = false
    const recording: InspectionRecording = {
      version: 1,
      programId: this._program.programId,
      runId: this._runId,
      recordingId: uuid(),
      chunks: [],
    }
    const append = (reason: InspectionRecord['reason']) => {
      if (stopped) { throw new Error('[Inspection] Capture is stopped') }
      const record: InspectionRecord = {
        sequence: sequence++,
        at: Date.now(),
        kind: 'snapshot',
        scope: 'inspection',
        revision: revision++,
        reason,
        value: this.captureState(includeData),
      }
      recording.chunks.push({ firstSequence: record.sequence, lastSequence: record.sequence, records: [record] })
    }
    append('initial')
    const off = this._events.onAny(() => undefined)
    const capture: InspectionCapture = {
      recording,
      setIncludeData: (value) => { includeData = value },
      snapshot: reason => append(reason ?? 'manual'),
      stop: () => {
        if (stopped) { return }
        stopped = true
        off()
        this._captures.delete(capture)
      },
    }
    this._captures.add(capture)
    return capture
  }

  public override reset(): void {
    for (const capture of [...this._captures]) { capture.stop() }
    this._runId = uuid()
  }
}
