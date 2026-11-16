// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { RumlBase } from '../document/document'
import type {
    Datapoint,
    DatapointsPayload,
    Text,
} from '../generated/ruml.types'
import {
    ACTIONS_CAPABILITY_ID,
    AI_QUERY_CAPABILITY_ID,
    CONTEXT_CAPABILITY_ID,
    DATAPOINTS_CAPABILITY_ID,
    EXPRESSION_CAPABILITY_ID,
    QUERY_CAPABILITY_ID,
    TEXT_REFERENCE_CAPABILITY_ID,
} from '../capabilities/ids'
import {
    capabilityPayload,
    capabilityRole,
    duplicateCapabilityIds,
    duplicateNodeCapabilityIds,
    nodeCapabilityPayload,
    nodeCapabilityPayloads,
} from '../capabilities/registry'
import type { TextRef } from '../capabilities/values'
import { datapointRefs } from '../capabilities/datapointRefs'

export type RumlRefinement = {
    check: (doc: RumlBase) => boolean
    options: { message: string; path: (string | number)[] }
}

type RumlNode = RumlBase['rulemap']['nodes'][string]

const nodesOf = (doc: RumlBase): RumlNode[] => Object.values(doc.rulemap.nodes)

// The keys of a root capability's `payload.data`.
const rootDataKeys = (doc: RumlBase, capabilityId: string): Set<string> => {
    const payload = capabilityPayload(doc.capabilities, capabilityId) as
        | { data?: Record<string, unknown> }
        | undefined
    return new Set(Object.keys(payload?.data ?? {}))
}

// OP-07: operator 'undefined' is only allowed during authoring.
// Mirrored as an `if/then/else` in the schema — update both together.
export const operatorUndefinedOnlyInDraft: RumlRefinement = {
    check: (doc) => {
        if (doc.metadata.status === 'draft') return true
        return !nodesOf(doc).some((node) => node.operator === 'undefined')
    },
    options: {
        message:
            "operator 'undefined' is only allowed when metadata.status is 'draft'",
        path: ['rulemap', 'nodes'],
    },
}

// CAP-15: every node capability id MUST be declared in the root capabilities.
export const nodeCapabilitiesDeclaredAtRoot: RumlRefinement = {
    check: (doc) => {
        const declared = new Set((doc.capabilities ?? []).map(({ id }) => id))
        return nodesOf(doc).every((node) =>
            (node.capabilities ?? []).every(({ id }) => declared.has(id)),
        )
    },
    options: {
        message: 'node capability id not declared in root capabilities',
        path: ['rulemap', 'nodes'],
    },
}

// CAP-10: a capability id MUST NOT appear twice at the root. CAP-06/OP-02: on
// a node that holds for `data` and `combiner` ids; `decision` and `reaction`
// ids may repeat.
export const capabilityIdsUnique: RumlRefinement = {
    check: (doc) =>
        duplicateCapabilityIds(doc.capabilities).length === 0 &&
        nodesOf(doc).every(
            (node) =>
                duplicateNodeCapabilityIds(node.capabilities, doc.capabilities)
                    .length === 0,
        ),
    options: {
        message: 'a capability id is declared more than once',
        path: ['capabilities'],
    },
}

// CAP-14. Mirrored as an `if/then` in the schema — update both together.
export const noNodeCapabilitiesWhenRootEmpty: RumlRefinement = {
    check: (doc) => {
        if ((doc.capabilities ?? []).length > 0) return true
        return nodesOf(doc).every((node) => node.capabilities === undefined)
    },
    options: {
        message:
            'node capabilities are not allowed when root capabilities is empty',
        path: ['rulemap', 'nodes'],
    },
}

// CTX-10 (§4.11).
export const contextRefsResolveToRootData: RumlRefinement = {
    check: (doc) => {
        const defined = rootDataKeys(doc, CONTEXT_CAPABILITY_ID)
        return nodesOf(doc).every((node) =>
            (
                nodeCapabilityPayload(node.capabilities, CONTEXT_CAPABILITY_ID)
                    ?.refs ?? []
            ).every((ref) => defined.has(ref)),
        )
    },
    options: {
        message:
            'a ruml:context refs entry does not resolve to a key in the root ruml:context data',
        path: ['rulemap', 'nodes'],
    },
}

const textReferenceRefs = (node: RumlNode): TextRef[] => {
    const value = nodeCapabilityPayload(
        node.capabilities,
        TEXT_REFERENCE_CAPABILITY_ID,
    )
    return value?.refs ?? []
}

const textData = (doc: RumlBase): Record<string, Text> =>
    capabilityPayload(doc.capabilities, TEXT_REFERENCE_CAPABILITY_ID)?.data ??
    {}

// TXT-19 (§4.12): every anchor names an entry of this file. TXT-20 (the
// `element` exists) is not enforced: a dangling anchor is shown, not rejected.
export const nodeTextReferencesResolveToRootData: RumlRefinement = {
    check: (doc) => {
        const data = textData(doc)
        return nodesOf(doc).every((node) =>
            textReferenceRefs(node).every((ref) => data[ref.id] !== undefined),
        )
    },
    options: {
        message:
            'a ruml:text-reference anchor does not resolve to a root data key',
        path: ['rulemap', 'nodes'],
    },
}

// Official decision ids, and non-official ids declared with that role at root.
const hasDecisionCapability = (doc: RumlBase, node: RumlNode): boolean =>
    (node.capabilities ?? []).some(
        ({ id }) => capabilityRole(doc.capabilities, id) === 'decision',
    )

const isLeafNode = (node: RumlNode): boolean =>
    node.children === undefined || node.children.length === 0

// CAP-07. Mirrored as an `if/then` in the schema for the official ids — update
// both together.
export const decisionNodesAreLeaves: RumlRefinement = {
    check: (doc) =>
        nodesOf(doc).every(
            (node) => !(hasDecisionCapability(doc, node) && !isLeafNode(node)),
        ),
    options: {
        message:
            'a node with a decision capability (ruml:query, ruml:ai-query, ruml:tree-include or an id declared with role decision) must be a leaf (no non-empty children)',
        path: ['rulemap', 'nodes'],
    },
}

const combinerEntries = (doc: RumlBase, node: RumlNode) =>
    (node.capabilities ?? []).filter(
        ({ id }) => capabilityRole(doc.capabilities, id) === 'combiner',
    )

// OP-02: a DELEGATED node with children has exactly one combiner. Without
// children it is rejected outside a draft by NODE-07 (schema).
export const delegatedNodesHaveOneCombiner: RumlRefinement = {
    check: (doc) =>
        nodesOf(doc).every(
            (node) =>
                node.operator !== 'DELEGATED' ||
                isLeafNode(node) ||
                combinerEntries(doc, node).length === 1,
        ),
    options: {
        message:
            "a node with operator 'DELEGATED' and children must have exactly one entry of a capability with the combiner role",
        path: ['rulemap', 'nodes'],
    },
}

// CAP-08.
export const combinersOnlyOnDelegatedNodes: RumlRefinement = {
    check: (doc) =>
        nodesOf(doc).every(
            (node) =>
                node.operator === 'DELEGATED' ||
                combinerEntries(doc, node).length === 0,
        ),
    options: {
        message:
            "a capability with the combiner role must not appear on a node whose operator is not 'DELEGATED'",
        path: ['rulemap', 'nodes'],
    },
}

// OP-04. The schema states it for ruml:expression; a non-official combiner is
// only known by its declared role.
export const combinersHaveDescription: RumlRefinement = {
    check: (doc) =>
        nodesOf(doc).every((node) =>
            combinerEntries(doc, node).every(({ payload }) => {
                const { description } = payload as { description?: unknown }
                return (
                    typeof description === 'string' && description.trim() !== ''
                )
            }),
        ),
    options: {
        message:
            'the node-level payload of a combiner must have a non-empty description',
        path: ['rulemap', 'nodes'],
    },
}

// MOD-01: a node referenced more than once (a self-reference counts) is a
// module.
export const repeatedNodesAreModular: RumlRefinement = {
    check: (doc) => {
        const references = new Map<string, number>()
        for (const node of nodesOf(doc)) {
            for (const lexId of node.children ?? []) {
                references.set(lexId, (references.get(lexId) ?? 0) + 1)
            }
        }
        return [...references].every(
            ([lexId, count]) =>
                count < 2 || doc.rulemap.nodes[lexId]?.modular === true,
        )
    },
    options: {
        message:
            'a node referenced more than once in children arrays must have modular: true',
        path: ['rulemap', 'nodes'],
    },
}

export type ExpressionReads = (expression: string) => string[]

const EXPRESSION_CAPABILITY_IDS: readonly string[] = [
    QUERY_CAPABILITY_ID,
    EXPRESSION_CAPABILITY_ID,
]

// DP-18 (§4.8, §4.14): every datapoint an expression reads is declared. One
// issue per offending expression. `expressionReads` decides how exact the
// check is: the default scan never rejects a valid expression but misses
// reads in nested places; `queryDatapointRefs` from the `./query` entry is
// exact and is passed in by the caller, so this entry stays free of jsonata.
export const undeclaredExpressionReads = (
    doc: RumlBase,
    expressionReads: ExpressionReads = datapointRefs,
): RumlRefinement['options'][] => {
    const declared = rootDataKeys(doc, DATAPOINTS_CAPABILITY_ID)
    return Object.entries(doc.rulemap.nodes).flatMap(([lexId, node]) =>
        (node.capabilities ?? []).flatMap(({ id, payload }, index) => {
            const { expression } = payload as { expression?: unknown }
            if (
                !EXPRESSION_CAPABILITY_IDS.includes(id) ||
                typeof expression !== 'string'
            ) {
                return []
            }
            const undeclared = expressionReads(expression).filter(
                (name) => !declared.has(name),
            )
            if (undeclared.length === 0) return []
            return [
                {
                    path: [
                        'rulemap',
                        'nodes',
                        lexId,
                        'capabilities',
                        index,
                        'payload',
                        'expression',
                    ],
                    message: `the expression reads a datapoint not declared in ruml:datapoints: ${undeclared.join(', ')}`,
                },
            ]
        }),
    )
}

// Every datapoint of a payload, including set fields at any depth.
const allDatapoints = (payload: DatapointsPayload | undefined): Datapoint[] => {
    const collect = (entries: Record<string, Datapoint> = {}): Datapoint[] =>
        Object.values(entries)
    return [
        ...collect(payload?.data),
        ...Object.values(payload?.sets ?? {}).flatMap((set) =>
            collect(set.fields),
        ),
    ]
}

// DP-16 (§4.7.4).
export const datapointSetsResolve: RumlRefinement = {
    check: (doc) => {
        const payload = capabilityPayload(
            doc.capabilities,
            DATAPOINTS_CAPABILITY_ID,
        )
        const sets = new Set(Object.keys(payload?.sets ?? {}))
        return allDatapoints(payload).every(
            (datapoint) =>
                datapoint.type !== 'object' ||
                (datapoint.set !== undefined && sets.has(datapoint.set)),
        )
    },
    options: {
        message:
            "a datapoint of type 'object' does not resolve its set to an entry in ruml:datapoints sets",
        path: ['capabilities'],
    },
}

type AiQueryInputs = {
    context?: (string | { id?: string })[]
    dataPoints?: string[]
    texts?: string[]
}

const aiQueryInputs = (node: RumlNode): AiQueryInputs[] =>
    nodeCapabilityPayloads(node.capabilities, AI_QUERY_CAPABILITY_ID).map(
        (payload) => (payload.inputs as AiQueryInputs | undefined) ?? {},
    )

const contextIdOf = (entry: string | { id?: string }): string | undefined =>
    typeof entry === 'string' ? entry : entry.id

const aiQueryIdsResolveToRootData = (
    capabilityId: string,
    select: (inputs: AiQueryInputs) => (string | undefined)[],
    message: string,
): RumlRefinement => ({
    check: (doc) => {
        const declared = rootDataKeys(doc, capabilityId)
        return nodesOf(doc).every((node) =>
            aiQueryInputs(node)
                .flatMap(select)
                .every((id) => id === undefined || declared.has(id)),
        )
    },
    options: { message, path: ['rulemap', 'nodes'] },
})

// CTX-10, DP-18, TXT-19 (§4.9).
export const aiQueryContextResolvesToRootData = aiQueryIdsResolveToRootData(
    CONTEXT_CAPABILITY_ID,
    (inputs) => (inputs.context ?? []).map(contextIdOf),
    'a ruml:ai-query inputs.context id does not resolve to a key in the root ruml:context data',
)

export const aiQueryDatapointsDeclared = aiQueryIdsResolveToRootData(
    DATAPOINTS_CAPABILITY_ID,
    (inputs) => inputs.dataPoints ?? [],
    'a ruml:ai-query inputs.dataPoints id is not declared in ruml:datapoints',
)

export const aiQueryTextsDeclared = aiQueryIdsResolveToRootData(
    TEXT_REFERENCE_CAPABILITY_ID,
    (inputs) => inputs.texts ?? [],
    'a ruml:ai-query inputs.texts id is not declared in ruml:text-reference',
)

// §4.8/4.9: a leaf without a decision capability is always `undefined`, so its
// onTrue/onFalse handlers can never fire. Spec-permitted, hence a warning.
export const leafActionsNeedQuery: RumlRefinement = {
    check: (doc) =>
        nodesOf(doc).every((node) => {
            if (!isLeafNode(node) || hasDecisionCapability(doc, node)) {
                return true
            }
            return nodeCapabilityPayloads(
                node.capabilities,
                ACTIONS_CAPABILITY_ID,
            ).every(
                (actions) =>
                    actions.onTrue === undefined &&
                    actions.onFalse === undefined,
            )
        }),
    options: {
        message:
            'leaf node with ruml:actions but no decision capability (ruml:query, ruml:ai-query, ruml:tree-include) has onTrue/onFalse handlers that can never fire — its status is always undefined (only onUndefined fires)',
        path: ['rulemap', 'nodes'],
    },
}

const validityPeriodValid = (value: {
    validFrom?: string
    validUntil?: string
}): boolean =>
    value.validFrom === undefined ||
    value.validUntil === undefined ||
    Date.parse(value.validUntil) > Date.parse(value.validFrom)

// JSON Schema cannot compare two sibling values.
export const validityPeriodsOrdered: RumlRefinement = {
    check: (doc) => Object.values(textData(doc)).every(validityPeriodValid),
    options: {
        message: `'validUntil' must be after 'validFrom'`,
        path: ['capabilities'],
    },
}

// §3.8: SHOULD, not MUST — a warning.
export const representsPresentInLawDocuments: RumlRefinement = {
    check: (doc) =>
        doc.metadata.documentType !== 'law' ||
        nodesOf(doc).every((node) =>
            textReferenceRefs(node).some((ref) => ref.type === 'represents'),
        ),
    options: {
        message:
            "documentType 'law' but a node has no ruml:text-reference anchor of type represents — each node should mark the norm it represents",
        path: ['rulemap', 'nodes'],
    },
}

export type RumlWarning = RumlRefinement['options']

// Soft checks: spec-permitted but likely-unintended configurations. Unlike the
// refinements wired into RUMLSchema these do NOT fail validation.
export const RUML_WARNINGS: RumlRefinement[] = [
    leafActionsNeedQuery,
    representsPresentInLawDocuments,
]

export const collectRumlWarnings = (doc: RumlBase): RumlWarning[] =>
    RUML_WARNINGS.filter((warning) => !warning.check(doc)).map(
        (warning) => warning.options,
    )

export const metadataTimestamps: RumlRefinement = {
    check: ({ metadata }: RumlBase) => metadata.modified >= metadata.created,
    options: {
        message: 'modified MUST be >= created',
        path: ['metadata', 'modified'],
    },
}

export const metadataValidity: RumlRefinement = {
    check: ({ metadata }: RumlBase) => {
        if (!metadata.validFrom || !metadata.validUntil) {
            return true
        }

        return metadata.validFrom < metadata.validUntil
    },
    options: {
        message:
            'If both validFrom and validUntil are set, validUntil MUST be > validFrom',
        path: ['metadata', 'validUntil'],
    },
}

// §3.3.3: the schema requires `validUntil` for 'expired'; "in the past" depends
// on the clock.
export const metadataExpired: RumlRefinement = {
    check: ({ metadata }: RumlBase) =>
        metadata.status !== 'expired' ||
        metadata.validUntil === undefined ||
        metadata.validUntil < new Date().toISOString(),
    options: {
        message: 'status expired MUST have a validUntil in the past',
        path: ['metadata', 'validUntil'],
    },
}
