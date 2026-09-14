import type { RuntimeHttpTransport, RuntimeLogger, RuntimeTsHostOptions, StreamTransportFactory } from './host.types'
import type { RuntimeTsBootContext } from '@/features/runtime-ts/kernel/types/bootstrap.types'
import type { EndgeImplementations_Module } from '@/features/runtime-ts/modules/implementations/EndgeImplementations_Module'
import type { EndgeProgram_Module } from '@/features/runtime-ts/modules/program/EndgeProgram_Module'
import { EndgeModule } from '@/features/federation/EndgeModule'
import { BrowserWebSocketStreamTransportFactory } from '@/features/runtime-ts/adapters/browser/BrowserWebSocketStreamTransportFactory'
import { FetchHttpTransport } from '@/features/runtime-ts/adapters/browser/FetchHttpTransport'
import { FetchSseStreamTransportFactory } from '@/features/runtime-ts/adapters/browser/FetchSseStreamTransportFactory'

const silentLogger: RuntimeLogger = {}

export class EndgeHost_Module extends EndgeModule<RuntimeTsBootContext> {
  private _options: RuntimeTsHostOptions = {}
  private _providerDisposers: Array<() => void> = []

  public constructor(
    private readonly _program: EndgeProgram_Module,
    private readonly _implementations: EndgeImplementations_Module,
  ) { super() }

  public override setup(ctx: RuntimeTsBootContext): void { this._options = ctx.host }

  public override build(): void {
    const missing = (this._program.requirements.hostActions ?? []).filter(item => !this._options.implementations?.some(provider => provider.key === item.providerKey && provider.active !== false))
    if (missing.length) {
      throw new Error(`[RuntimeTs] Missing host action providers: ${missing.map(item => item.providerKey).join(', ')}`)
    }
  }

  public override start(): void {
    this._providerDisposers = (this._options.implementations ?? []).map(provider => this._implementations.registerProvider(provider))
  }

  public get http(): RuntimeHttpTransport { return this._options.http ?? new FetchHttpTransport() }
  public get logger(): RuntimeLogger { return this._options.logger ?? silentLogger }
  public get resolveAuth() { return this._options.resolveAuth }

  public stream(kind: 'sse' | 'websocket'): StreamTransportFactory {
    const explicit = this._options.streams?.[kind]
    if (explicit) { return explicit }
    if (kind === 'sse') { return new FetchSseStreamTransportFactory() }
    return new BrowserWebSocketStreamTransportFactory()
  }

  public override reset(): void {
    this._providerDisposers.splice(0).reverse().forEach(dispose => dispose())
    this._options = {}
  }
}
