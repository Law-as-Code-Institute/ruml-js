# ruml-js

The TypeScript parser for RUML, the Rulemapping Logic Format: types, schema-derived models,
serialization and validation. RUML is an open, JSON-based file format for the
machine-executable representation of legal decision logic; the specification, the schemas
and the conformance tests are in [ruml](https://github.com/Law-as-Code-Institute/ruml).

## Installing

```sh
npm install @law-as-code/ruml-parser
```

The package is ESM only (`"type": "module"`).

## Developing

The repository needs [pnpm](https://pnpm.io) 11: `package.json` takes its dependency
versions from the catalog in `pnpm-workspace.yaml` (`catalog:`), which npm cannot read.

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## How it is built

The RUML JSON Schemas (`ruml.schema.json`, `ruml-result.schema.json`) are the source
everything else derives from.

- **Zod models** are extracted at runtime from the schema `$defs`
  (`src/conversion/defs.ts`), so models and schema cannot drift.
- **TypeScript types** are generated from the schema into `src/generated/`. Run
  `pnpm run generate:types` after a schema change; do not edit `src/generated/` by hand.
- **Code-only rules** live in `src/rules/refinements.ts` and `src/capabilities/values.ts`:
  only what JSON Schema cannot express (references within the document,
  `validUntil > validFrom`).

## Entry points

- `.` — types, Zod models, serialization, validation (`RumlValidator`). jsonata-free.
- `./query` — `validateQueryExpression`, `queryDatapointRefs` and `undeclaredDatapointRefs`
  (JSONata, §4.8). Imports `jsonata`; isolated here so the main entry never pulls it in.
- `./text` — RUML Text (§4.12): the content digest, `GUID`s and text keys, and the text of
  an element.

The JSON Schemas themselves are a package of their own, `@law-as-code/ruml-schema` on npm,
published from [ruml](https://github.com/Law-as-Code-Institute/ruml).

`sideEffects: false` lets bundlers tree-shake regardless.

## Validation

`RumlValidator` checks a document against the full RUML schema and the rules that span the
document (references between its parts, operators by status). Build it once, then reuse it.

```ts
import { RumlValidator } from '@law-as-code/ruml-parser'

const result = new RumlValidator().validate(doc) // doc: unknown
if (!result.valid) {
    result.errors // e.g. [{ message: 'Invalid option: expected one of "AND"|"OR"|…', path: 'rulemap.nodes.1.operator' }]
} else {
    result.warnings // optional, non-fatal findings (e.g. action handlers that can never fire)
}
```

`validate` never throws. `parse` is the throwing variant (raises a `ZodError`).

### Expressions

An expression may only read datapoints declared in `ruml:datapoints` (DP-18). By default a
text scan checks that; it never rejects a valid expression but misses reads inside a
function body, such as `$map(list, function($v) { $v + income })`. Pass the JSONata-based
reader from `./query` for the exact check:

```ts
import { RumlValidator } from '@law-as-code/ruml-parser'
import { queryDatapointRefs } from '@law-as-code/ruml-parser/query'

const validator = new RumlValidator({ expressionReads: queryDatapointRefs })
```

### External capabilities

The core `ruml:` capabilities are always validated. To also validate third-party
capabilities (reverse-domain ids such as `org.example/engine`), pass their value schemas —
one `CapabilityDefinition` per id, with a `rootValueSchema` and/or `nodeValueSchema` (Zod
schemas) for wherever the capability appears. Supplying a reserved `ruml:` id throws. In the
document, such a capability is declared at the root with its `role`.

```ts
import { RumlValidator } from '@law-as-code/ruml-parser'

const validator = new RumlValidator({
    supportedCapabilities: [myCapabilityDefinition],
})
```

## Contributing

Feedback is welcome as issues; pull requests are not accepted yet. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Apache-2.0, see [LICENSE](LICENSE). Copyright 2026 Rulemapping Group GmbH.

Published by Law as Code Institut GmbH. RUML is a trademark of Rulemapping Group GmbH; an
application for registration as an EU trade mark has been filed.
