import type { RuntimeTsHostOptions } from '@/features/runtime-ts/modules/host/host.types'

const runtimeTsHost: RuntimeTsHostOptions = {
  http: {
    request: async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { items: [{ id: 1, name: 'Коробка' }] },
    }),
  },
  streams: {
    sse: {
      open: (_artifact, callbacks) => {
        callbacks.open()
        return { close: () => {} }
      },
    },
  },
  implementations: [{
    key: 'fixture.refresh',
    execute: async invocation => invocation.input,
  }],
}

export default runtimeTsHost
