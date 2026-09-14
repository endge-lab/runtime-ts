import type { StreamTransportConnection, StreamTransportFactory } from '@/features/runtime-ts/modules/host/host.types'

export class BrowserWebSocketStreamTransportFactory implements StreamTransportFactory {
  public open(artifact: Record<string, any>, callbacks: Parameters<StreamTransportFactory['open']>[1]): StreamTransportConnection {
    const transport = artifact.transport ?? {}
    if (transport.kind !== 'websocket') {
      throw new Error(`Unsupported Stream transport: ${String(transport.kind)}`)
    }
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is unavailable in the current runtime')
    }
    const socket = new WebSocket(String(transport.url))
    let closed = false
    socket.addEventListener('open', () => {
      for (const message of transport.onOpen ?? []) {
        socket.send(JSON.stringify(message))
      }
      callbacks.open()
    })
    socket.addEventListener('message', (event) => {
      try {
        callbacks.message({ sourceEvent: 'message', id: null, data: JSON.parse(String(event.data)) })
      }
      catch (error) {
        callbacks.error(error)
      }
    })
    socket.addEventListener('error', () => callbacks.error(new Error('WebSocket Stream connection failed')))
    socket.addEventListener('close', event => !closed && callbacks.error(new Error(`WebSocket Stream closed (${event.code})`)))
    return { close: () => {
      closed = true
      socket.close()
    } }
  }
}
