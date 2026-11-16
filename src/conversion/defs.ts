// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'
import {
    ajvIssueReporter,
    isRequiredOnlyAnyOf,
    oneOfDiscriminator,
    rumlJsonSchemaDocument,
    rumlResultJsonSchemaDocument,
    zodFromJsonSchema,
} from './from-json-schema'

type JsonNode = Record<string, unknown>

// Extract one named `$defs` entry as a standalone Zod schema, with the
// document's `$defs` in scope so `$ref` still resolves. Every model schema in
// this package is derived this way; none is hand-written.
const makeDefExtractor = (doc: JsonNode) => {
    const cache = new Map<string, z.ZodType>()
    const extract = (name: string): z.ZodType => {
        const cached = cache.get(name)
        if (cached) return cached
        const $defs = doc.$defs as Record<string, JsonNode>
        const def = $defs[name]
        if (!def) {
            throw new Error(`No $defs.${name} in the RUML JSON schema`)
        }
        // The schema id is the definition name: consumers that re-serialize
        // these schemas (the API's OpenAPI generation) rely on it to emit a
        // named component reference instead of inlining the definition.
        const schema = convertDefinition(def, $defs, extract).meta({ id: name })
        cache.set(name, schema)
        return schema
    }
    return extract
}

// Resolves `#/$defs/<Name>` through the document's extractor, so a schema
// reached by reference is the same (cached) schema the package exports for
// that definition.
type DefResolver = (name: string) => z.ZodType

const refName = (node: JsonNode): string | undefined => {
    const match =
        typeof node.$ref === 'string'
            ? /^#\/\$defs\/(\w+)$/.exec(node.$ref)
            : null
    return match?.[1]
}

// A definition carrying `allOf` (the conditional constraint mirrors) would
// convert to a Zod *intersection*, which has no `.shape` — and the capability
// editors introspect these schemas to derive their form fields. So the object
// itself is converted from the definition without its `allOf`, keeping a real
// `ZodObject`, and the conditionals are attached as a check over the remaining
// members. That is the shape these schemas had before they were derived: a
// plain object plus refinements, with the conditionals living in the emitted
// JSON Schema.
const convertDefinition = (
    def: JsonNode,
    $defs: JsonNode,
    resolveDef?: DefResolver,
): z.ZodType => {
    // A union discriminated by a constant (NodeResult over `status`): the
    // converter's union only says that no member matched and does not enforce
    // the members' `unevaluatedProperties`, so AJV decides and reports.
    if (oneOfDiscriminator(def.oneOf, $defs as Record<string, JsonNode>)) {
        const reportIssues = ajvIssueReporter({ ...def, $defs })
        return zodFromJsonSchema(
            { ...def, $defs },
            { fidelityCheck: false },
        ).check((payload) => {
            for (let i = payload.issues.length - 1; i >= 0; i--) {
                if (payload.issues[i]?.code === 'custom') {
                    payload.issues.splice(i, 1)
                }
            }
            for (const issue of reportIssues(payload.value)) {
                payload.issues.push(issue)
            }
        })
    }
    const { allOf: ownAllOf, anyOf, ...rest } = def
    const deferAnyOf =
        rest.properties !== undefined && isRequiredOnlyAnyOf(anyOf)
    const base = deferAnyOf || anyOf === undefined ? rest : { ...rest, anyOf }
    const allOf: unknown[] = [
        ...(Array.isArray(ownAllOf) ? (ownAllOf as unknown[]) : []),
        ...(deferAnyOf ? [{ anyOf }] : []),
    ]
    if (allOf.length === 0) {
        return reapplyOwnDefaults(
            def,
            zodFromJsonSchema(
                { ...withoutOwnDefaults(def), $defs },
                { fidelityCheck: false },
            ),
            $defs,
            resolveDef,
        )
    }
    const structural = zodFromJsonSchema(
        { ...withoutOwnDefaults(base), $defs },
        { fidelityCheck: false },
    )
    // The conditionals are enforced by AJV rather than by converting them to
    // Zod: it reports which field inside the selected branch failed, where the
    // converter reports only that a branch did not match.
    //
    // Only the `allOf` members are compiled, never the whole definition: the
    // object itself already covers structure, and consumers legitimately reuse
    // an entry schema with an extra field (the collection editors prepend the
    // record key), which a whole-definition check would reject as an
    // unknown property.
    const reportIssues = ajvIssueReporter({ allOf, $defs })
    return reapplyOwnDefaults(def, structural, $defs, resolveDef).check(
        (payload) => {
            for (const issue of reportIssues(payload.value)) {
                payload.issues.push(issue)
            }
        },
    )
}

// A `default` on one of a definition's own properties makes the converter wrap
// the whole object in a pipe, which hides its `.shape` — and the capability
// editors introspect that shape to build their form fields. So those defaults
// are removed before conversion (see `withoutOwnDefaults`) and re-applied here,
// on the property, which is where the hand-written schemas had them.
//
// How they are re-applied depends on whether the property is required, because
// the two ecosystems disagree: in JSON Schema `default` is an annotation and
// never satisfies `required`, while Zod's `.default()` fills a missing value.
//   - optional property → a real `.default()`, applied at parse time
//   - required property → metadata only, so the value still has to be present
//     (this is the `binding` case: §4.7 requires it, and the editor shows it
//     pre-filled and locked via the `default`/`readOnly` annotations)
// Defaults nested deeper are left to the converter; only the definition's own
// shape needs to stay introspectable.
// A property that is a pure map (`additionalProperties` with no `properties`
// of its own) converts to an object with a catchall, but the hand-written
// schemas expressed those as `z.record(keySchema, valueSchema)` — and the
// collection editors detect a record to learn the shape of one entry. Rebuild
// them as records, keeping the optional wrapper and metadata.
const asRecord = (
    property: JsonNode,
    field: z.ZodType,
    $defs: JsonNode,
    resolveDef?: DefResolver,
): z.ZodType | undefined => {
    const values = property.additionalProperties
    if (
        property.properties !== undefined ||
        !values ||
        typeof values !== 'object'
    ) {
        return undefined
    }
    const keys = property.propertyNames
    const keySchema =
        keys && typeof keys === 'object'
            ? (zodFromJsonSchema(
                  { ...(keys as JsonNode), $defs },
                  {
                      fidelityCheck: false,
                  },
              ) as z.ZodType<string>)
            : z.string()
    // A `$ref` value goes through the extractor: converting it here would
    // convert the definition's `allOf` too, and that yields a Zod
    // *intersection* — no `.shape` for the editors to introspect, which is
    // exactly what `convertDefinition` avoids for a top-level def.
    const ref = refName(values as JsonNode)
    const valueSchema =
        ref && resolveDef
            ? resolveDef(ref)
            : zodFromJsonSchema(
                  { ...(values as JsonNode), $defs },
                  {
                      fidelityCheck: false,
                  },
              )
    const record = z.record(keySchema, valueSchema).meta({ ...field.meta() })
    return field._zod.def.type === 'optional' ? record.optional() : record
}

const reapplyOwnDefaults = (
    def: JsonNode,
    schema: z.ZodType,
    $defs: JsonNode,
    resolveDef?: DefResolver,
): z.ZodType => {
    const properties = def.properties as Record<string, JsonNode> | undefined
    const shape = (schema as { shape?: Record<string, z.ZodType> }).shape
    if (!properties || !shape) return schema

    const required = new Set(
        Array.isArray(def.required) ? (def.required as string[]) : [],
    )
    const rebuilt: Record<string, z.ZodType> = {}
    for (const [name, property] of Object.entries(properties)) {
        const field = shape[name]
        if (!field) continue
        const record = asRecord(property, field, $defs, resolveDef)
        if (record) {
            rebuilt[name] = record
            continue
        }
        if (!('default' in property)) continue
        rebuilt[name] = required.has(name)
            ? field.meta({
                  ...field.meta(),
                  default: property.default,
                  ...(property.readOnly === true ? { readOnly: true } : {}),
              })
            : field.default(property.default as never)
    }
    return Object.keys(rebuilt).length > 0
        ? (schema as unknown as z.ZodObject).extend(rebuilt)
        : schema
}

// A copy of the definition with its own properties' `default` removed.
const withoutOwnDefaults = (def: JsonNode): JsonNode => {
    const properties = def.properties as Record<string, JsonNode> | undefined
    if (!properties) return def
    return {
        ...def,
        properties: Object.fromEntries(
            Object.entries(properties).map(([name, property]) => {
                if (!('default' in property)) return [name, property]
                const { default: _default, ...rest } = property
                return [name, rest]
            }),
        ),
    }
}

// A named $defs entry of schema/ruml.schema.json as a Zod schema.
export const rumlDef = makeDefExtractor(rumlJsonSchemaDocument)

// A named $defs entry of schema/ruml-result.schema.json as a Zod schema.
export const rumlResultDef = makeDefExtractor(rumlResultJsonSchemaDocument)

// The static face of a converted object def: an object schema whose parsed
// output is the generated type `T`. The converter returns `ZodTypeAny`
// statically but a real `ZodObject` at runtime, so object defs are typed
// through this to keep `.extend`/`.partial`/`.pick`/`.shape` available to
// consumers (the API DTOs compose with them).
export type SchemaOf<T> = z.ZodObject<{
    [K in keyof T]-?: undefined extends T[K]
        ? z.ZodOptional<z.ZodType<Exclude<T[K], undefined>>>
        : z.ZodType<T[K]>
}>

// Some sub-schemas the package exposes are not named `$defs` entries — they
// live inline inside a definition (an author inside `Metadata.authors.items`,
// a datapoint's `validation` object, …). They are addressed by the path to
// that node instead. Slash-separated, rooted at the schema document.
const makeSubDefExtractor = (doc: JsonNode) => {
    const cache = new Map<string, z.ZodType>()
    return (pointer: string): z.ZodType => {
        const cached = cache.get(pointer)
        if (cached) return cached
        const node = pointer
            .split('/')
            .reduce<unknown>(
                (current, key) =>
                    (current as Record<string, unknown> | undefined)?.[key],
                doc,
            )
        if (!node || typeof node !== 'object') {
            throw new Error(`No node at "${pointer}" in the RUML JSON schema`)
        }
        const schema = zodFromJsonSchema(
            { ...(node as JsonNode), $defs: doc.$defs },
            { fidelityCheck: false },
        )
        cache.set(pointer, schema)
        return schema
    }
}

// A node addressed by path inside schema/ruml.schema.json, as a Zod schema.
export const rumlSubDef = makeSubDefExtractor(rumlJsonSchemaDocument)

export const rumlSubObjectDef = <T>(pointer: string): SchemaOf<T> =>
    rumlSubDef(pointer) as unknown as SchemaOf<T>

export const rumlObjectDef = <T>(name: string): SchemaOf<T> =>
    rumlDef(name) as unknown as SchemaOf<T>

// The static face of a converted `enum` definition. The converter produces a
// real `ZodEnum` at runtime, so typing it as one keeps `.options` (and the
// rest of the enum API) available to consumers.
export type EnumOf<T extends string> = z.ZodEnum<{ [K in T]: K }>

export const rumlEnumDef = <T extends string>(name: string): EnumOf<T> =>
    rumlDef(name) as unknown as EnumOf<T>

export const rumlResultEnumDef = <T extends string>(name: string): EnumOf<T> =>
    rumlResultDef(name) as unknown as EnumOf<T>

export const rumlResultObjectDef = <T>(name: string): SchemaOf<T> =>
    rumlResultDef(name) as unknown as SchemaOf<T>

// The routing table of an object def whose patternProperties map exact-key
// patterns (`^ruml:query$`) to `$defs` refs — returns { id: defName }.
// Non-exact patterns (the generic reverse-domain / without-data groups) are
// skipped. Used to derive the typed capability registries from the schema
// itself, so registry and schema cannot drift.
export const exactKeyRoutes = (
    doc: JsonNode,
    defName: string,
): Record<string, string> => {
    const $defs = doc.$defs as Record<string, JsonNode>
    const patternProperties = ($defs[defName]?.patternProperties ??
        {}) as Record<string, JsonNode>
    const routes: Record<string, string> = {}
    for (const [pattern, ref] of Object.entries(patternProperties)) {
        const exact = /^\^([A-Za-z0-9:_-]+)\$$/.exec(pattern)
        const target = /^#\/\$defs\/(\w+)$/.exec(
            typeof ref.$ref === 'string' ? ref.$ref : '',
        )
        if (exact && target) routes[exact[1] as string] = target[1] as string
    }
    return routes
}

// The routing table of a capability entry def (CapabilityEntry,
// NodeCapabilityEntry), whose `allOf` members select the payload schema by id
// (`if id const "ruml:query" then payload $ref CapabilityQuery`) — returns
// { id: defName }. Members without a payload `$ref` (ruml:protocol on nodes:
// "no payload") are skipped.
export const entryPayloadRoutes = (
    doc: JsonNode,
    defName: string,
): Record<string, string> => {
    const $defs = doc.$defs as Record<string, JsonNode>
    const members = ($defs[defName]?.allOf ?? []) as JsonNode[]
    const routes: Record<string, string> = {}
    for (const member of members) {
        const id = (
            member.if as
                | { properties?: { id?: { const?: unknown } } }
                | undefined
        )?.properties?.id?.const
        const ref = (
            member.then as
                | { properties?: { payload?: { $ref?: unknown } } }
                | undefined
        )?.properties?.payload?.$ref
        const target =
            typeof ref === 'string' ? /^#\/\$defs\/(\w+)$/.exec(ref) : null
        if (typeof id === 'string' && target) {
            routes[id] = target[1] as string
        }
    }
    return routes
}
