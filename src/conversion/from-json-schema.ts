// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { z } from 'zod'
import { regexes } from 'zod/v4/core'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'
import Ajv2020Import from 'ajv/dist/2020'
import addFormatsImport from 'ajv-formats'
import * as rumlJsonSchemaImport from '@law-as-code/ruml-schema'
import * as rumlResultJsonSchemaImport from '@law-as-code/ruml-schema/result'

// Module-interop shims. The JSON documents are namespace-imported and
// unwrapped by hand because consumers compile this source under different
// module settings: ESM (vitest/tsdown) exposes JSON only as `default`, while a
// CommonJS consumer without `esModuleInterop` (apps/api/builder) emits a bare
// `require`, where `.default` is undefined. Taking `default ?? namespace`
// works under both. Same reason for ajv, which ships CJS.
const Ajv2020 = ((Ajv2020Import as unknown as { default?: unknown }).default ??
    Ajv2020Import) as typeof Ajv2020Import
const addFormats = ((addFormatsImport as unknown as { default?: unknown })
    .default ?? addFormatsImport) as typeof addFormatsImport

type JsonNode = Record<string, unknown>

const unwrapModule = (mod: unknown): JsonNode =>
    ((mod as { default?: unknown }).default ?? mod) as JsonNode

// Two layers over the same unmodified schema document:
//  1. structure — `zod-from-json-schema`, which enforces `if/then/else`,
//     patternProperties and `$defs` recursion natively.
//  2. fidelity — AJV compiled on the same document, attached as a Zod check.
//     It is the reference implementation for the keywords the converter can
//     only approximate, so its verdict wins; it also fills declared defaults.
// `fidelityCheck: false` skips layer 2 and returns a plain, composable
// ZodObject — Zod 4 forbids `.partial()` and key-overwriting `.extend()` on
// refined schemas, so the per-definition exports are built without it.
//
// `format` is annotation-only in draft 2020-12, so the converter ignores it.
// The schema uses it as an assertion where no `pattern` accompanies it, so
// those are mirrored below from Zod's own regexes. `regex` has no pattern
// equivalent and stays enforced only by AJV.
const FORMAT_PATTERNS: Record<string, string> = {
    uri: '^[A-Za-z][A-Za-z0-9+.\\-]*:[^\\s]*$',
    date: regexSource(regexes.date),
    // RFC 3339: seconds and offset are required, a fraction is optional.
    'date-time': `^${regexSource(regexes.date).replace(/^\^|\$$/g, '')}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$`,
    time: regexSource(regexes.time({})),
    duration: regexSource(regexes.duration),
}

function regexSource(re: RegExp): string {
    return re.source
}

// An "at least one of" `anyOf: [{ required: [a] }, { required: [b] }]` next to
// `properties`. Any such `anyOf` makes the converter stop validating the
// object's properties, so it is left to AJV (see `convertDefinition` and the
// fidelity layer below).
export const isRequiredOnlyAnyOf = (anyOf: unknown): anyOf is JsonNode[] =>
    Array.isArray(anyOf) &&
    (anyOf as unknown[]).every(
        (member) =>
            member !== null &&
            typeof member === 'object' &&
            Object.keys(member).length === 1 &&
            Array.isArray((member as JsonNode).required),
    )

// Repairs before conversion, all keeping the result refinement-free: bare
// `format` mirrored as `pattern`; required-only `anyOf` removed (above); and
// `additionalProperties: false` restated inside `allOf` as `propertyNames` —
// the converter drops strict keys on objects carrying `allOf`, but honours
// members of the `allOf` itself.
const repairForConversion = (node: unknown): void => {
    if (Array.isArray(node)) {
        node.forEach(repairForConversion)
        return
    }
    if (!node || typeof node !== 'object') return
    const n = node as JsonNode
    if (
        n.type === 'string' &&
        typeof n.format === 'string' &&
        n.pattern === undefined &&
        FORMAT_PATTERNS[n.format] !== undefined
    ) {
        n.pattern = FORMAT_PATTERNS[n.format]
    }
    if (n.properties && isRequiredOnlyAnyOf(n.anyOf)) delete n.anyOf
    // A `oneOf` of objects with no `type` of its own converts to the permissive
    // "any JSON value" union, which loses the branches a form needs (§4.7's
    // datapoint `binding`). The members already say what it is.
    if (
        n.type === undefined &&
        Array.isArray(n.oneOf) &&
        n.oneOf.length > 0 &&
        n.oneOf.every(
            (member) =>
                member &&
                typeof member === 'object' &&
                (member as JsonNode).type === 'object',
        )
    ) {
        n.type = 'object'
    }
    if (
        Array.isArray(n.allOf) &&
        n.additionalProperties === false &&
        n.properties &&
        typeof n.properties === 'object'
    ) {
        n.allOf = [
            ...(n.allOf as unknown[]),
            { propertyNames: { enum: Object.keys(n.properties) } },
        ]
    }
    Object.values(n).forEach(repairForConversion)
}

export type ZodFromJsonSchemaOptions = { fidelityCheck?: boolean }

// AJV compiled on `fullSchema`, as a function returning Zod issues. AJV reports
// a `required` violation on the parent with the missing key in `params`; it is
// appended to the path so the issue lands on the field a form is missing.
// AJV fills a default *before* it checks `required`, so a property that is both
// required and declares a default (Datapoint.binding) would pass when absent.
// `default` is annotation-only, so dropping it from required properties changes
// nothing about validation and leaves only optional defaults to be filled.
const dropRequiredDefaults = (node: unknown): void => {
    if (Array.isArray(node)) {
        node.forEach(dropRequiredDefaults)
        return
    }
    if (!node || typeof node !== 'object') return
    const n = node as JsonNode
    const required = Array.isArray(n.required) ? (n.required as string[]) : []
    const properties = n.properties as Record<string, JsonNode> | undefined
    if (properties) {
        for (const key of required) {
            if (properties[key]) delete properties[key].default
        }
    }
    Object.values(n).forEach(dropRequiredDefaults)
}

// The key and per-member `const` of a `oneOf` whose members are all `$ref`s to
// definitions that require one shared key with distinct constants (NodeResult
// over `status`), or undefined.
export const oneOfDiscriminator = (
    oneOf: unknown,
    $defs: Record<string, JsonNode>,
): { key: string; values: unknown[] } | undefined => {
    if (!Array.isArray(oneOf) || oneOf.length === 0) return undefined
    const members = (oneOf as unknown[]).map((member) => {
        if (!member || typeof member !== 'object') return undefined
        const { $ref } = member as JsonNode
        const match =
            typeof $ref === 'string' && Object.keys(member).length === 1
                ? /^#\/\$defs\/(\w+)$/.exec($ref)
                : null
        return match ? $defs[match[1] as string] : undefined
    })
    const first = members[0]
    if (!first || members.some((member) => !member)) return undefined
    const constOf = (member: JsonNode | undefined, key: string): unknown =>
        (member?.properties as Record<string, JsonNode> | undefined)?.[key]
            ?.const
    const requires = (member: JsonNode | undefined, key: string): boolean =>
        Array.isArray(member?.required) && member.required.includes(key)
    const properties = (first.properties ?? {}) as JsonNode
    for (const key of Object.keys(properties)) {
        const values = members.map((member) => constOf(member, key))
        if (
            values.every((value) => value !== undefined) &&
            new Set(values).size === values.length &&
            members.every((member) => requires(member, key))
        ) {
            return { key, values }
        }
    }
    return undefined
}

// AJV reports a failed `oneOf` with the errors of every member. For a union
// discriminated by a constant the equivalent `if const then member` chain
// reports only the errors of the member the value selects.
const discriminateOneOf = (
    node: unknown,
    $defs: Record<string, JsonNode>,
): void => {
    if (Array.isArray(node)) {
        node.forEach((item) => discriminateOneOf(item, $defs))
        return
    }
    if (!node || typeof node !== 'object') return
    const n = node as JsonNode
    const discriminator = oneOfDiscriminator(n.oneOf, $defs)
    if (discriminator) {
        const { key, values } = discriminator
        const members = n.oneOf as JsonNode[]
        delete n.oneOf
        n.allOf = [
            ...(Array.isArray(n.allOf) ? (n.allOf as unknown[]) : []),
            { properties: { [key]: { enum: values } }, required: [key] },
            ...members.map((member, index) => ({
                if: {
                    properties: { [key]: { const: values[index] } },
                    required: [key],
                },
                then: member,
            })),
        ]
    }
    Object.values(n).forEach((child) => discriminateOneOf(child, $defs))
}

export const ajvIssueReporter = (
    fullSchema: JsonNode,
    { useDefaults = false }: { useDefaults?: boolean } = {},
) => {
    const schema = JSON.parse(JSON.stringify(fullSchema)) as JsonNode
    discriminateOneOf(schema, (schema.$defs ?? {}) as Record<string, JsonNode>)
    if (useDefaults) dropRequiredDefaults(schema)
    const ajv = new Ajv2020({ strict: false, allErrors: true, useDefaults })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    return (value: unknown): z.core.$ZodRawIssue[] => {
        if (validate(value)) return []
        const issues: z.core.$ZodRawIssue[] = []
        for (const error of validate.errors ?? []) {
            // Skip conditional-aggregation errors ('must match "then"/"else"
            // schema') — the leaf error inside the branch carries the detail.
            if (error.keyword === 'if') continue
            // JSON Pointer tokens escape `/` as `~1` and `~` as `~0`.
            const path: PropertyKey[] = error.instancePath
                .split('/')
                .filter(Boolean)
                .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
            const missing = (error.params as { missingProperty?: string })
                .missingProperty
            if (error.keyword === 'required' && missing) path.push(missing)
            issues.push({
                code: 'custom',
                message: `${error.instancePath || '/'} ${error.message ?? 'invalid'}`,
                path,
                input: value,
            })
        }
        return issues
    }
}

// An `allOf` member that only constrains (`if`/`then`/`else`, or a `properties`
// mirror) converts to a Zod *intersection*, whose members each re-parse the
// object and whose results are then merged. Two members disagree as soon as an
// optional key is present but `undefined` — a node carrying
// `decisionMode: undefined` — and Zod *throws* "Unmergable intersection"
// instead of reporting an issue. A whole-document parse checks those same
// constraints with AJV, so the structural layer drops them: the trade
// `convertDefinition` makes in `defs.ts`, applied to every definition that a
// whole-document parse inlines rather than reaches by reference.
//
// A `$ref` member is composition, not a constraint — it contributes the shape
// itself — so it stays.
const dropConstraintAllOf = (node: unknown): void => {
    if (Array.isArray(node)) {
        node.forEach(dropConstraintAllOf)
        return
    }
    if (!node || typeof node !== 'object') return
    const n = node as JsonNode
    if (Array.isArray(n.allOf)) {
        const composition = n.allOf.filter(
            (member) =>
                !!member && typeof member === 'object' && '$ref' in member,
        )
        if (composition.length > 0) n.allOf = composition
        else delete n.allOf
    }
    Object.values(n).forEach(dropConstraintAllOf)
}

export const zodFromJsonSchema = (
    fullSchema: JsonNode,
    { fidelityCheck = true }: ZodFromJsonSchemaOptions = {},
): z.ZodType => {
    const prepared = JSON.parse(JSON.stringify(fullSchema)) as JsonNode
    // Before `repairForConversion`, which appends a non-conditional member to
    // an `allOf` it keeps.
    if (fidelityCheck) dropConstraintAllOf(prepared)
    repairForConversion(prepared)
    const base = convertJsonSchemaToZod(prepared)
    if (!fidelityCheck) return base

    // `useDefaults` lets AJV fill declared defaults into the parsed value, so a
    // whole-document parse normalizes the same fields the per-definition
    // schemas do via `.default()` (see `defs.ts`). AJV writes into the object it
    // validates, and the converter passes map values through by reference, so it
    // gets a clone — a caller's document must not be rewritten by a parse.
    const reportIssues = ajvIssueReporter(fullSchema, { useDefaults: true })

    // `.check()` rather than `.superRefine()` so this pass can edit the
    // structural layer's issues: the converter's generic `custom` issues carry
    // no useful path, so they are dropped in favour of AJV's precise ones.
    return base.check((payload) => {
        for (let i = payload.issues.length - 1; i >= 0; i--) {
            if (payload.issues[i]?.code === 'custom') {
                payload.issues.splice(i, 1)
            }
        }
        const flagged = new Set(
            payload.issues.map((issue) =>
                (issue.path ?? []).map(String).join('/'),
            ),
        )
        const normalized = structuredClone(payload.value)
        for (const issue of reportIssues(normalized)) {
            if (flagged.has((issue.path ?? []).map(String).join('/'))) continue
            payload.issues.push(issue)
        }
        if (payload.issues.length === 0) payload.value = normalized
    })
}

// The schema documents of @law-as-code/ruml-schema, bundled by the build.
export const rumlJsonSchemaDocument = unwrapModule(rumlJsonSchemaImport)
export const rumlResultJsonSchemaDocument = unwrapModule(
    rumlResultJsonSchemaImport,
)

// The document's own `allOf` holds conditional constraints (OP-07, CAP-14,
// §4.8/§4.9). `zodFromJsonSchema` already handles them: `dropConstraintAllOf`
// keeps them out of the structural layer — where converting them yields an
// intersection Zod refuses to merge ("Unmergable intersection" on
// `decisionMode`) — while its AJV pass validates against the full document, so
// the conditionals are enforced there, after defaults are filled.
export const zodFromRumlJsonSchema = (): z.ZodType =>
    zodFromJsonSchema(rumlJsonSchemaDocument)

export const zodFromRumlResultJsonSchema = (): z.ZodType =>
    zodFromJsonSchema(rumlResultJsonSchemaDocument)
