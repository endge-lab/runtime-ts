import type { EventSourceMessage } from 'eventsource-parser'
import type { StreamTransportConnection, StreamTransportFactory } from '@/features/runtime-ts/modules/host/host.types'
import { createParser } from 'eventsource-parser'

export class FetchSseStreamTransportFactory implements StreamTransportFactory {
  public open(artifact: Record<string, any>, callbacks: Parameters<StreamTransportFactory['open']>[1]): StreamTransportConnection {
    const transport = artifact.transport ?? {}
    if (transport.kind !== 'sse') {
      throw new Error(`Unsupported Stream transport: ${String(transport.kind)}`)
    }
    const controller = new AbortController()
    let closed = false
    const run = async () => {
      try {
        const response = await fetch(String(transport.url), {
          headers: artifact.__headers ?? {},
          credentials: transport.withCredentials ? 'include' : 'same-origin',
          signal: controller.signal,
        })
        if (!response.ok || !response.body) {
          throw new Error(`Unexpected response: ${response.status}`)
        }
        callbacks.open()
        const parser = createParser({ onEvent: (event: EventSourceMessage) => callbacks.message({
          sourceEvent: event.event || 'message',
          id: event.id || null,
          data: parseData(event.data),
        }) })
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        while (true) {
          if (closed) {
            break
          }
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          parser.feed(value)
        }
      }
      catch (error) {
        if (!closed && !controller.signal.aborted) {
          callbacks.error(error)
        }
      }
    }
    void run()
    return { close: () => {
      closed = true
      controller.abort()
    } }
  }
}

function parseData(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}
