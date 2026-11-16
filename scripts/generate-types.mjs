// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
// Generates src/generated/*.types.ts from the JSON Schema artifacts.
//
// json-schema-to-typescript needs a preprocessed copy of each schema:
//  - conditionals (if/then/else) carry no type information and their titled
//    allOf members produce invalid identifiers — dropped
//  - patternProperties is ignored by the generator, which would leave the
//    capability maps as empty interfaces. They are collapsed to a single
//    open value type instead: the map's own `additionalProperties` when it has
//    one (node capabilities → CapabilityJson), otherwise the generic
//    capability object. Deliberately NOT a union of the typed per-capability
//    shapes: those interfaces carry no index signature, so a union of them is
//    not assignable to the `Record<string, Json>`-shaped types consumers use
//    for capability maps. Per-capability value schemas remain available as
//    their own definitions.
//  - minItems/maxItems are removed: the generator would turn `minItems: 1`
//    into a non-empty tuple `[T, ...T[]]`, which diverges from the plain `T[]`
//    consumers build and assign. Cardinality is enforced at runtime.
//  - an `allOf` on an array states a constraint (P-06 uniqueness, via
//    contains/minContains/maxContains) and never a shape, but the generator
//    intersects it: `Unique… & CapabilityEntry[]`, which no array satisfies.
//    Dropped. Enforced at runtime.
//  - the root titles become the exported interface names
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const J2TS_VERSION = '15.0.4'
const pkgDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaDir = path.join(
    pkgDir,
    'node_modules/@law-as-code/ruml-schema',
)

const stripConditionals = (node) => {
    if (Array.isArray(node)) {
        node.forEach(stripConditionals)
        return
    }
    if (!node || typeof node !== 'object') return
    if ('if' in node) {
        delete node.if
        delete node.then
        delete node.else
    }
    Object.values(node).forEach(stripConditionals)
    if (Array.isArray(node.allOf)) {
        node.allOf = node.allOf.filter(
            (member) =>
                member &&
                typeof member === 'object' &&
                Object.keys(member).some(
                    (key) => key !== 'title' && key !== 'description',
                ),
        )
        if (node.allOf.length === 0) delete node.allOf
    }
}

// `anyOf: [{ required: [a] }, { required: [b] }]` ("at least one of") carries
// no type information, but makes the generator discard the object's
// properties. Enforced at runtime.
const stripRequiredOnlyAnyOf = (node) => {
    if (Array.isArray(node)) {
        node.forEach(stripRequiredOnlyAnyOf)
        return
    }
    if (!node || typeof node !== 'object') return
    if (
        Array.isArray(node.anyOf) &&
        node.properties &&
        node.anyOf.every(
            (member) =>
                member &&
                typeof member === 'object' &&
                Object.keys(member).every((key) => key === 'required'),
        )
    ) {
        delete node.anyOf
    }
    Object.values(node).forEach(stripRequiredOnlyAnyOf)
}

const stripItemCardinality = (node) => {
    if (Array.isArray(node)) {
        node.forEach(stripItemCardinality)
        return
    }
    if (!node || typeof node !== 'object') return
    if (node.type === 'array') {
        delete node.minItems
        delete node.maxItems
        delete node.allOf
    }
    Object.values(node).forEach(stripItemCardinality)
}

const mergePatternProperties = (node) => {
    if (Array.isArray(node)) {
        node.forEach(mergePatternProperties)
        return
    }
    if (!node || typeof node !== 'object') return
    Object.values(node).forEach(mergePatternProperties)
    if (node.patternProperties && typeof node.patternProperties === 'object') {
        const openValue =
            node.additionalProperties &&
            typeof node.additionalProperties === 'object'
                ? node.additionalProperties
                : { $ref: '#/$defs/CapabilityWithData' }
        node.additionalProperties = openValue
        delete node.patternProperties
    }
}

// A capability entry's `payload` is a bare `type: object` whose typed shape is
// selected per id by the (stripped) conditionals; the generator would emit `{}`.
// It becomes an open record instead — the typed payloads stay available as
// their own definitions.
const openEntryPayloads = (schema) => {
    for (const def of Object.values(schema.$defs ?? {})) {
        const payload = def?.properties?.payload
        if (def?.properties?.id && payload?.type === 'object') {
            payload.additionalProperties = {}
        }
    }
}

const generate = (schemaFile, rootName, outFile) => {
    const schema = JSON.parse(
        fs.readFileSync(path.join(schemaDir, schemaFile), 'utf8'),
    )
    schema.title = rootName
    delete schema.allOf
    stripConditionals(schema)
    openEntryPayloads(schema)
    stripRequiredOnlyAnyOf(schema)
    stripItemCardinality(schema)
    mergePatternProperties(schema)

    const tmp = path.join(os.tmpdir(), `ruml-typegen-${schemaFile}`)
    fs.writeFileSync(tmp, JSON.stringify(schema))
    execFileSync(
        'pnpm',
        [
            'dlx',
            `json-schema-to-typescript@${J2TS_VERSION}`,
            '-i',
            tmp,
            '-o',
            path.join(pkgDir, outFile),
            '--unreachableDefinitions',
            '--no-additionalProperties',
            // -1 disables the minItems/maxItems tuple expansion: a
            // `minItems: 1` array stays `T[]` instead of becoming
            // `[T, ...T[]]`. The cardinality is enforced at runtime (AJV), and
            // the tuple form would make the types diverge from what consumers
            // build.
            '--bannerComment',
            `/* eslint-disable */\n/**\n * Generated by scripts/generate-types.mjs from ${schemaFile} of @law-as-code/ruml-schema — do not edit.\n */`,
        ],
        { stdio: 'inherit' },
    )
    fs.rmSync(tmp)

    // A generated `interface X { [k: string]: T }` is a pure map, but TypeScript
    // does not give interfaces an implicit index signature, so such a type is
    // not assignable to `Record<PropertyKey, unknown>` — which the previous
    // `z.infer`-derived types (plain `Record<string, T>` aliases) were. Emit
    // those as aliases so map types stay interchangeable with Records.
    const outFull = path.join(pkgDir, outFile)
    fs.writeFileSync(
        outFull,
        fs
            .readFileSync(outFull, 'utf8')
            .replace(
                /export interface (\w+) \{\n(\s+)\[k: (string|number)\]: ([^;]+);\n\}/g,
                (_m, name, indent, key, value) =>
                    `export type ${name} = {\n${indent}[k: ${key}]: ${value}\n}`,
            ),
    )
    console.log(`✓ wrote ${outFile}`)
}

fs.mkdirSync(path.join(pkgDir, 'src/generated'), { recursive: true })
generate('ruml.schema.json', 'RUML', 'src/generated/ruml.types.ts')
generate(
    'ruml-result.schema.json',
    'RUMLResult',
    'src/generated/ruml-result.types.ts',
)
