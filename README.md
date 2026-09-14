# @endge/runtime-ts

Автономный headless runtime для выполнения переносимого `ExecutionBundle v1` без
`@endge/core`, Domain, Compiler, UI или Bridge.

Пакет совместим с контрактами `@endge/core@12.0.1`, использует собственную
Federation и устанавливает Bundle атомарно: после проверки владельцем artifacts
становится `program` Module, а исходный transport-объект не хранится вторым
состоянием.

## Запуск

```ts
import { EndgeRuntimeTs } from '@endge/runtime-ts'

const session = await EndgeRuntimeTs.run({
  bundle,
  host: {
    implementations: [
      {
        key: 'warehouse.refresh',
        execute: async ({ input }) => input,
      },
    ],
  },
})

const snapshot = EndgeRuntimeTs.runtime.captureInspection(true)
const debuggerBundle = EndgeRuntimeTs.exportInspectionBundle({ includeData: true })

await session.unmount()
await EndgeRuntimeTs.reset()
```

`run()` принимает `ExecutionBundle`, контейнер `EndgeBundle` или JSON/Gzip bytes.
Он всегда монтирует только `catalog.workspace.startupCompositionIdentity`.
Повторный запуск в том же JavaScript realm требует `reset()`.

## Host ports

- HTTP transport;
- SSE и WebSocket factories;
- resolver auth-сессии;
- implementation providers для host actions;
- необязательный logger.

Fetch HTTP/SSE и browser WebSocket экспортируются из
`@endge/runtime-ts/adapters/browser`. Node WebSocket adapter экспортируется из
`@endge/runtime-ts/adapters/node`.

Renderer не является частью пакета. `ComponentSFCRenderPort` предоставляет
renderer-neutral доступ к исполняемому SFC host и его состоянию.

## Ручная проверка Bundle

```bash
pnpm bundle:run -- /absolute/path/bundle.json
pnpm bundle:run -- /absolute/path/bundle.gz --watch
```

Если Bundle требует host actions или особую авторизацию, передайте модуль,
экспортирующий `RuntimeTsHostOptions`:

```bash
pnpm bundle:run -- /absolute/path/bundle.json \
  --host-module /absolute/path/host.mjs
```

Репозиторный fixture можно прогнать вместе с его локальным fake-host:

```bash
pnpm bundle:run -- "$PWD/src/test/fixtures/bundles/headless-runtime.json" \
  --host-module "$PWD/src/test/manual/fixture-host.ts"
```

Запись от AODB не используется и не входит в тестовые fixtures.

## Проверка

```bash
pnpm lint-check
pnpm typecheck
pnpm test
pnpm build
```
