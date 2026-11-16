import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/capabilities/query-expression.ts',
        'src/text/index.ts',
    ],
    format: ['esm'],
    fixedExtension: false,
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
    // The schemas are bundled, so consumers do not need the schema package.
    deps: { alwaysBundle: ['@law-as-code/ruml-schema'] },
})
