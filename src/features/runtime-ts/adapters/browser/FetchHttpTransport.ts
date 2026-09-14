import type { RuntimeHttpRequest, RuntimeHttpResponse, RuntimeHttpTransport } from '@/features/runtime-ts/modules/host/host.types'

export class FetchHttpTransport implements RuntimeHttpTransport {
  public async request(request: RuntimeHttpRequest): Promise<RuntimeHttpResponse> {
    const url = new URL(request.url, globalThis.location?.href ?? 'http://localhost')
    Object.entries(request.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    })
    const timeout = request.timeoutMs ? AbortSignal.timeout(request.timeoutMs) : undefined
    const signal = request.signal && timeout
      ? AbortSignal.any([request.signal, timeout])
      : request.signal ?? timeout
    const headers = new Headers(request.headers)
    let body: BodyInit | undefined
    if (request.body !== undefined) {
      if (request.body instanceof URLSearchParams || typeof request.body === 'string') {
        body = request.body
      }
      else {
        body = JSON.stringify(request.body)
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json')
        }
      }
    }
    const response = await fetch(url, { method: request.method, headers, body, signal })
    const contentType = response.headers.get('content-type') ?? ''
    const data = contentType.includes('json') ? await response.json() : await response.text()
    if (!response.ok) {
      throw Object.assign(new Error(`[HTTP] ${request.method} ${url}: ${response.status}`), { response: { status: response.status, data } })
    }
    return { status: response.status, headers: Object.fromEntries(response.headers), data }
  }
}
