import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map(async entry => entry.isDirectory()
    ? await sourceFiles(path.join(root, entry.name))
    : entry.name.endsWith('.ts') ? [path.join(root, entry.name)] : []))).flat()
}

describe('граница пакета runtime-ts', () => {
  it('production-код не зависит от Core, AODB, Vue и DOM renderer', async () => {
    const root = path.resolve(import.meta.dirname, '../../features')
    const files = await sourceFiles(root)
    const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n')
    expect(source).not.toMatch(/from ['"]@endge\/core/)
    expect(source).not.toMatch(/ramax-aodb|aodb-app/)
    expect(source).not.toMatch(/from ['"]vue['"]/)
  })
})
