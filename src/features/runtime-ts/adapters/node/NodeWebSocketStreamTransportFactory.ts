import type { StreamTransportConnection, StreamTransportFactory } from '@/features/runtime-ts/modules/host/host.types'
import WebSocket from 'ws'

export class NodeWebSocketStreamTransportFactory implements StreamTransportFactory {
  public open(artifact: Record<string, any>, callbacks: Parameters<StreamTransportFactory['open']>[1]): StreamTransportConnection {
    const transport = artifact.transport ?? {}
    if (transport.kind !== 'websocket') {
      throw new Error(`Unsupported Stream transport: ${String(transport.kind)}`)
    }
    const socket = new WebSocket(String(transport.url))
    let closed = false
    socket.on('open', () => {
      for (const message of transport.onOpen ?? []) {
        socket.send(JSON.stringify(message))
      }
      callbacks.open()
    })
    socket.on('message', (value) => {
      try {
        callbacks.message({ sourceEvent: 'message', id: null, data: JSON.parse(value.toString()) })
      }
      catch (error) {
        callbacks.error(error)
      }
    })
    socket.on('error', error => callbacks.error(error))
    socket.on('close', code => !closed && callbacks.error(new Error(`WebSocket Stream closed (${code})`)))
    return { close: () => {
      closed = true
      socket.close()
    } }
  }
}
