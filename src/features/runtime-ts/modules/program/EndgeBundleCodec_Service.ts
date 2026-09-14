import type { EndgeBundle } from './program.types'
import { AsyncGunzip, gzip } from 'fflate'
import { readEndgeBundle } from './execution-bundle'

export const ENDGE_BUNDLE_MAX_BYTES = 256 * 1024 * 1024

export class EndgeBundleCodec_Service {
  public constructor(private readonly _maxBytes = ENDGE_BUNDLE_MAX_BYTES) {
    if (!Number.isSafeInteger(_maxBytes) || _maxBytes < 1 || _maxBytes > ENDGE_BUNDLE_MAX_BYTES) {
      throw new Error('[Bundle] Invalid file limit')
    }
  }

  public async encode(input: EndgeBundle, format: 'json' | 'gzip' = 'gzip', signal?: AbortSignal): Promise<Uint8Array> {
    signal?.throwIfAborted()
    const bytes = new TextEncoder().encode(JSON.stringify(readEndgeBundle(input), null, format === 'json' ? 2 : undefined))
    if (bytes.length > this._maxBytes) {
      throw new Error('[Bundle] Uncompressed file limit exceeded')
    }
    if (format === 'json') {
      return bytes
    }
    return await new Promise((resolve, reject) => {
      const cancel = gzip(bytes, { level: 9, mtime: 0 }, (error, output) => error ? reject(error) : resolve(output))
      signal?.addEventListener('abort', () => {
        cancel()
        reject(signal.reason)
      }, { once: true })
    })
  }

  public async decode(bytes: Uint8Array, signal?: AbortSignal): Promise<EndgeBundle> {
    signal?.throwIfAborted()
    if (bytes.length > this._maxBytes) {
      throw new Error('[Bundle] File limit exceeded')
    }
    const decoded = bytes[0] === 0x1F && bytes[1] === 0x8B ? await this._gunzip(bytes, signal) : bytes
    const text = new TextDecoder('utf-8', { fatal: true }).decode(decoded).replace(/^\uFEFF/, '').trimStart()
    if (!text.startsWith('{')) {
      throw new Error('[Bundle] Expected JSON or Gzip Endge Bundle')
    }
    return readEndgeBundle(JSON.parse(text))
  }

  private async _gunzip(bytes: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
    return await new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = []
      let size = 0
      const stream = new AsyncGunzip((error, chunk, final) => {
        if (error) {
          reject(error)
          return
        }
        size += chunk.length
        if (size > this._maxBytes) {
          stream.terminate()
          reject(new Error('[Bundle] Uncompressed file limit exceeded'))
          return
        }
        chunks.push(chunk)
        if (final) {
          const output = new Uint8Array(size)
          let offset = 0
          chunks.forEach((item) => {
            output.set(item, offset)
            offset += item.length
          })
          resolve(output)
        }
      })
      signal?.addEventListener('abort', () => {
        stream.terminate()
        reject(signal.reason)
      }, { once: true })
      for (let offset = 0; offset < bytes.length; offset += 16384) {
        const end = Math.min(bytes.length, offset + 16384)
        stream.push(new Uint8Array(bytes.subarray(offset, end)), end === bytes.length)
      }
    })
  }
}
