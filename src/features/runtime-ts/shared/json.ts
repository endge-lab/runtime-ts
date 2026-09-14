export type BundleJsonValue = null | boolean | number | string | BundleJsonValue[] | { [key: string]: BundleJsonValue }

export function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function asObject(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`[Bundle] Invalid ${label}`)
  }
  return value as Record<string, any>
}

export function asText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`[Bundle] Invalid ${label}`)
  }
  return value
}

export function jsonSafe<T>(value: T): T {
  return copyJson(value)
}

export function readPath(value: unknown, path: string | null | undefined): unknown {
  if (!path) {
    return value
  }
  return String(path).split('.').filter(Boolean).reduce<unknown>((current, key) => {
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, value)
}

export function writePath(target: Record<string, any>, path: string, value: unknown): void {
  const parts = String(path).split('.').filter(Boolean)
  if (!parts.length) {
    throw new Error('[Runtime] Empty data path')
  }
  let current = target
  parts.slice(0, -1).forEach((part) => {
    const next = current[part]
    current = next && typeof next === 'object' && !Array.isArray(next)
      ? next
      : (current[part] = {})
  })
  current[parts.at(-1)!] = copyJson(value)
}
