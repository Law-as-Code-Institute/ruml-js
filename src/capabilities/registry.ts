// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'
import { entryPayloadRoutes, rumlDef, rumlObjectDef } from '../conversion/defs'
import { rumlJsonSchemaDocument } from '../conversion/from-json-schema'
import type {
    Actions,
    AiQueryPayload,
    Capabilities as CapabilitiesType,
    CapabilityAiQueryNode,
    CapabilityEntry as CapabilityEntryType,
    CapabilityExpression,
    CapabilityQuery,
    ContextPayload,
    ContextRefs,
    DatapointsPayload,
    NodeCapabilities as NodeCapabilitiesType,
    NodeCapabilityEntry as NodeCapabilityEntryType,
    ProtocolPayload,
    TextReferencePayload,
    TextRefs,
    TreeInclude,
    TreeRefs,
} from '../generated/ruml.types'
import {
    DRAFT_REGEX,
    REVERSE_DOMAIN_REGEX,
    type OfficialCapabilityId,
} from './ids'

export {
    CapabilityIdSchema,
    OFFICIAL_RUML_CAPABILITY_IDS,
    type CapabilityId,
} from './ids'

export type CapabilityEntry = CapabilityEntryType
export type NodeCapabilityEntry = NodeCapabilityEntryType

// §4.2 — one declared capability `{ id, required?, payload? }`. The typed
// payload of each official id is selected by the def's own `allOf` routes.
export const CapabilityEntrySchema =
    rumlObjectDef<CapabilityEntryType>('CapabilityEntry')

// §4.3 — one node-level capability `{ id, payload }` (CAP-17).
export const NodeCapabilityEntrySchema = rumlObjectDef<NodeCapabilityEntryType>(
    'NodeCapabilityEntry',
)

// Payload schemas per capability id at each level, derived from the entry
// defs' `allOf` routes (`if id = ruml:datapoints then payload DatapointsPayload`)
// so registry and schema cannot drift.
const routesToRegistry = (
    routes: Record<string, string>,
): Record<string, z.ZodType> =>
    Object.fromEntries(
        Object.entries(routes).map(([id, defName]) => [id, rumlDef(defName)]),
    )

// A capability registry maps a capability id to the Zod schema of its
// `payload` at one level (root or node). The core `ruml:` registries below seed
// it; the `Validator` merges injected external definitions on top.
export type CapabilityValueRegistry = Record<string, z.ZodType>

export const CORE_ROOT_CAPABILITY_VALUE_SCHEMAS: CapabilityValueRegistry =
    routesToRegistry(
        entryPayloadRoutes(rumlJsonSchemaDocument, 'CapabilityEntry'),
    )

export const TYPED_NODE_CAPABILITY_VALUE_SCHEMAS: CapabilityValueRegistry =
    routesToRegistry(
        entryPayloadRoutes(rumlJsonSchemaDocument, 'NodeCapabilityEntry'),
    )

// Typed payloads of the official ids, per level.
export type RootCapabilityPayloads = {
    'ruml:datapoints': DatapointsPayload
    'ruml:text-reference': TextReferencePayload
    'ruml:context': ContextPayload
    'ruml:ai-query': AiQueryPayload
    'ruml:protocol': ProtocolPayload
}

export type NodeCapabilityPayloads = {
    'ruml:query': CapabilityQuery
    'ruml:actions': Actions
    'ruml:context': ContextRefs
    'ruml:ai-query': CapabilityAiQueryNode
    'ruml:expression': CapabilityExpression
    'ruml:text-reference': TextRefs
    'ruml:tree-reference': TreeRefs
    'ruml:tree-include': TreeInclude
}

type Entry = { id: string; payload?: object; required?: boolean }

// The first entry with `id`, or undefined. Capabilities are ordered lists; at
// root CAP-10 guarantees at most one entry per id, on a node a decision or
// reaction id may repeat (CAP-06) — use `nodeCapabilityPayloads` for those.
export const findCapability = <E extends Entry>(
    capabilities: readonly E[] | undefined,
    id: string,
): E | undefined => capabilities?.find((entry) => entry.id === id)

export const hasCapability = (
    capabilities: readonly Entry[] | undefined,
    id: string,
): boolean => findCapability(capabilities, id) !== undefined

// The typed payload of an official root capability, or undefined when the
// capability is absent or carries no payload.
export function capabilityPayload<K extends keyof RootCapabilityPayloads>(
    capabilities: CapabilitiesType | undefined,
    id: K,
): RootCapabilityPayloads[K] | undefined
export function capabilityPayload(
    capabilities: readonly Entry[] | undefined,
    id: string,
): Record<string, unknown> | undefined
export function capabilityPayload(
    capabilities: readonly Entry[] | undefined,
    id: string,
): unknown {
    return findCapability(capabilities, id)?.payload
}

// The typed payload of an official node capability.
export function nodeCapabilityPayload<K extends keyof NodeCapabilityPayloads>(
    capabilities: NodeCapabilitiesType | undefined,
    id: K,
): NodeCapabilityPayloads[K] | undefined
export function nodeCapabilityPayload(
    capabilities: readonly Entry[] | undefined,
    id: string,
): Record<string, unknown> | undefined
export function nodeCapabilityPayload(
    capabilities: readonly Entry[] | undefined,
    id: string,
): unknown {
    return findCapability(capabilities, id)?.payload
}

// The typed payloads of every entry of an official node capability, in order.
export function nodeCapabilityPayloads<K extends keyof NodeCapabilityPayloads>(
    capabilities: NodeCapabilitiesType | undefined,
    id: K,
): NodeCapabilityPayloads[K][]
export function nodeCapabilityPayloads(
    capabilities: readonly Entry[] | undefined,
    id: string,
): Record<string, unknown>[]
export function nodeCapabilityPayloads(
    capabilities: readonly Entry[] | undefined,
    id: string,
): unknown[] {
    return (capabilities ?? [])
        .filter((entry) => entry.id === id && entry.payload !== undefined)
        .map((entry) => entry.payload)
}

// §4.1 — the fixed role of each official capability.
export type CapabilityRole = NonNullable<CapabilityEntryType['role']>

export const OFFICIAL_CAPABILITY_ROLES: Record<
    OfficialCapabilityId,
    CapabilityRole
> = {
    'ruml:datapoints': 'data',
    'ruml:text-reference': 'data',
    'ruml:tree-reference': 'data',
    'ruml:context': 'data',
    'ruml:query': 'decision',
    'ruml:ai-query': 'decision',
    'ruml:tree-include': 'decision',
    'ruml:expression': 'combiner',
    'ruml:actions': 'reaction',
    'ruml:protocol': 'reaction',
}

// The role of a capability id: fixed for official ids, declared at root for
// every other id (CAP-03).
export const capabilityRole = (
    capabilities: CapabilitiesType | undefined,
    id: string,
): CapabilityRole | undefined =>
    (OFFICIAL_CAPABILITY_ROLES as Record<string, CapabilityRole>)[id] ??
    findCapability(capabilities, id)?.role

// CAP-10: ids that occur more than once in one capabilities list.
export const duplicateCapabilityIds = (
    capabilities: readonly Entry[] | undefined,
): string[] => {
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const { id } of capabilities ?? []) {
        if (seen.has(id)) duplicates.add(id)
        seen.add(id)
    }
    return [...duplicates]
}

// CAP-06/OP-02: on a node only `data` and `combiner` ids are unique; an id
// whose role is unknown (undeclared non-official id) is not judged.
export const duplicateNodeCapabilityIds = (
    nodeCapabilities: readonly Entry[] | undefined,
    rootCapabilities?: CapabilitiesType,
): string[] =>
    duplicateCapabilityIds(nodeCapabilities).filter((id) => {
        const role = capabilityRole(rootCapabilities, id)
        return role === 'data' || role === 'combiner'
    })

// Validate an entry's `payload` against the registered schema and surface the
// issues under `[index, 'payload', …]`. Core ids are already routed by the entry
// def itself, so only ids outside `core` are checked here.
const reportRegisteredPayloadIssues = (
    entries: readonly Entry[],
    registry: CapabilityValueRegistry,
    core: CapabilityValueRegistry,
    ctx: z.core.$RefinementCtx,
) => {
    entries.forEach((entry, index) => {
        const schema = core[entry.id] ? undefined : registry[entry.id]
        if (!schema) return
        const result = schema.safeParse(entry.payload ?? {})
        if (result.success) return
        for (const issue of result.error.issues) {
            ctx.addIssue({ ...issue, path: [index, 'payload', ...issue.path] })
        }
    })
}

const reportDuplicateIds = (
    entries: readonly Entry[],
    ctx: z.core.$RefinementCtx,
    duplicates: string[] = duplicateCapabilityIds(entries),
) => {
    const ids = entries.map((entry) => entry.id)
    for (const id of duplicates) {
        ctx.addIssue({
            code: 'custom',
            path: [ids.lastIndexOf(id), 'id'],
            message: `capability "${id}" is declared more than once`,
        })
    }
}

// CAP-01 as this package applies it: a draft or reverse-domain capability
// declared `required: true` that no schema is registered for. The one
// predicate behind `buildCapabilitiesSchema` and the `RumlValidator`.
export const isUnregisteredRequiredCapability = (
    { id, required }: Pick<CapabilityEntryType, 'id' | 'required'>,
    knownCapabilityIds: ReadonlySet<string>,
): boolean =>
    required === true &&
    (DRAFT_REGEX.test(id) || REVERSE_DOMAIN_REGEX.test(id)) &&
    !knownCapabilityIds.has(id)

export const unregisteredRequiredCapabilityMessage = (id: string): string =>
    `capability "${id}" is declared "required: true" but no schema is registered to validate its value`

export type BuildCapabilitiesOptions = {
    // When true, a required capability we have no schema for is rejected —
    // nothing can validate it. Off by default (core ignores unknowns); the
    // Validator turns it on once it knows which external schemas exist.
    rejectUnregisteredRequired?: boolean
    // Ids we can validate at any level (root or node). Used so a capability
    // typed only on nodes still counts as "known". Defaults to the root keys.
    knownCapabilityIds?: ReadonlySet<string>
}

// Builds the ROOT-level capabilities schema (an ordered entry list) for a
// given registry.
export const buildCapabilitiesSchema = (
    registry: CapabilityValueRegistry,
    options: BuildCapabilitiesOptions = {},
): z.ZodType<CapabilitiesType> => {
    const knownCapabilityIds =
        options.knownCapabilityIds ?? new Set(Object.keys(registry))
    return z
        .array(CapabilityEntrySchema)
        .superRefine((entries: CapabilityEntryType[], ctx) => {
            reportDuplicateIds(entries, ctx)
            reportRegisteredPayloadIssues(
                entries,
                registry,
                CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
                ctx,
            )
            if (!options.rejectUnregisteredRequired) return
            entries.forEach((entry, index) => {
                if (
                    isUnregisteredRequiredCapability(entry, knownCapabilityIds)
                ) {
                    ctx.addIssue({
                        code: 'custom',
                        path: [index],
                        message: unregisteredRequiredCapabilityMessage(
                            entry.id,
                        ),
                    })
                }
            })
        })
}

export const CapabilitiesSchema = buildCapabilitiesSchema(
    CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
).meta({ id: 'Capabilities' })
export type Capabilities = CapabilitiesType

// Builds the NODE-level capabilities schema for a given registry. Untyped ids
// keep accepting any payload object (§4.3 "Value Types").
export const buildNodeCapabilitiesSchema = (
    registry: CapabilityValueRegistry,
): z.ZodType<NodeCapabilitiesType> =>
    z
        .array(NodeCapabilityEntrySchema)
        .superRefine((entries: NodeCapabilityEntryType[], ctx) => {
            reportDuplicateIds(
                entries,
                ctx,
                duplicateNodeCapabilityIds(entries),
            )
            reportRegisteredPayloadIssues(
                entries,
                registry,
                TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
                ctx,
            )
        })

export const NodeCapabilitiesSchema = buildNodeCapabilitiesSchema(
    TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
).meta({ id: 'NodeCapabilities' })
export type NodeCapabilities = NodeCapabilitiesType
