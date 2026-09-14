import path from 'node:path'

import dts from 'unplugin-dts/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: {
        'runtime-ts': path.resolve(__dirname, 'src/main.ts'),
        'browser': path.resolve(__dirname, 'src/features/runtime-ts/adapters/browser/index.ts'),
        'node': path.resolve(__dirname, 'src/features/runtime-ts/adapters/node/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@endge/raph', '@endge/utils', 'eventsource-parser', 'fflate', 'uuid', 'ws'],
      output: { entryFileNames: '[name].js' },
    },
  },
  plugins: [dts({
    bundleTypes: false,
    exclude: ['src/test/**'],
    tsconfigPath: './tsconfig.json',
  })],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
