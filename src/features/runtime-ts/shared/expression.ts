import { readPath } from './json'

export interface ExpressionScope {
  input?: unknown
  props?: Record<string, unknown>
  value?: Record<string, unknown>
  scope?: unknown
  response?: unknown
  event?: unknown
  vars?: Record<string, unknown>
  outputs?: Record<string, unknown>
}

export function evaluateExpression(expression: unknown, scope: ExpressionScope = {}): unknown {
  if (expression == null || typeof expression !== 'object' || Array.isArray(expression)) {
    return expression
  }
  const node = expression as Record<string, any>
  switch (node.type) {
    case 'literal': return node.value
    case 'read': return readPath(readSource(scope, node.source), node.path)
    case 'path': return readPath(scope.scope, node.path)
    case 'object': return Object.fromEntries(Object.entries(node.properties ?? {}).map(([key, value]) => [key, evaluateExpression(value, scope)]))
    case 'array': return (node.items ?? []).map((item: unknown) => evaluateExpression(item, scope))
    case 'operation': return runOperation(node.operation, (node.arguments ?? []).map((item: unknown) => evaluateExpression(item, scope)))
    case 'template': return String(node.value ?? '').replace(/\{([^}]+)\}/g, (_match, path) => String(readPath(scope.vars, path) ?? ''))
    default: return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, evaluateExpression(value, scope)]))
  }
}

function readSource(scope: ExpressionScope, source: string): unknown {
  if (source === 'input') { return scope.input }
  if (source === 'prop') { return scope.props }
  if (source === 'value') { return scope.value }
  if (source === 'scope') { return scope.scope }
  if (source === 'response') { return scope.response }
  if (source === 'event') { return scope.event }
  if (source === 'var') { return scope.vars }
  if (source === 'computation-output' || source === 'output') { return scope.outputs }
  return undefined
}

function runOperation(operation: string, args: unknown[]): unknown {
  switch (operation) {
    case 'merge': return Object.assign({}, ...args.filter(value => value && typeof value === 'object'))
    case 'compact': return compact(args[0])
    case 'coalesce': return args.find(value => value !== null && value !== undefined)
    case 'concat': return args.every(Array.isArray) ? args.flat() : args.map(value => String(value ?? '')).join('')
    case 'equals': return args[0] === args[1]
    case 'not': return !args[0]
    case 'and': return args.every(Boolean)
    case 'or': return args.some(Boolean)
    case 'add': return args.reduce<number>((sum, value) => sum + Number(value ?? 0), 0)
    default: throw new Error(`[Runtime Expression] Unsupported operation: ${operation}`)
  }
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter(item => item !== null && item !== undefined).map(compact)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => item === null || item === undefined || item === '' ? [] : [[key, compact(item)]]))
  }
  return value
}
