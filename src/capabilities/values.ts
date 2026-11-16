// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { rumlObjectDef, rumlSubObjectDef } from '../conversion/defs'
import { checkValidityPeriod } from '../document/document'
import type {
    Action,
    Actions,
    AiQueryPayload,
    CapabilityAiQueryNode,
    CapabilityExpression,
    CapabilityQuery,
    Context,
    ContextPayload,
    ContextRefs,
    NodeRef,
    ProtocolPayload,
    Text,
    TextReferencePayload,
    TextRefs,
    TreeInclude,
    TreeRefs,
} from '../generated/ruml.types'

export type {
    Action,
    Actions,
    Context,
    ContextRefs,
    Text,
    TextReferencePayload,
    TextRefs,
} from '../generated/ruml.types'

// §4.8 — node-level ruml:query value (JSONata boolean expression).
export const CapabilityQueryNodeValueSchema =
    rumlObjectDef<CapabilityQuery>('CapabilityQuery')
export type CapabilityQueryNodeValue = CapabilityQuery

// §4.14 — node-level ruml:expression value: the combiner behind `DELEGATED`.
export const CapabilityExpressionNodeValueSchema =
    rumlObjectDef<CapabilityExpression>('CapabilityExpression')
export type CapabilityExpressionNodeValue = CapabilityExpression

// §4.10 — the `at least one of onTrue/onFalse/onUndefined` rule lives as an
// anyOf on $defs.Actions.
export const ActionSchema = rumlObjectDef<Action>('Action')

export const ActionsSchema = rumlObjectDef<Actions>('Actions')

// §4.9 — node-level ruml:ai-query value.
export const CapabilityAiQueryNodeValueSchema =
    rumlObjectDef<CapabilityAiQueryNode>('CapabilityAiQueryNode')
export type CapabilityAiQueryNodeValue = CapabilityAiQueryNode

// §4.9 — root-level ruml:ai-query payload (config.systemPrompt etc.).
export const CapabilityAiQueryValueSchema =
    rumlObjectDef<AiQueryPayload>('AiQueryPayload')
export type CapabilityAiQueryValue = AiQueryPayload

// §4.11 — a single context entry (root-level `data` value).
export const ContextSchema = rumlObjectDef<Context>('Context')

// §4.11 — root-level ruml:context payload.
export const CapabilityContextValueSchema =
    rumlObjectDef<ContextPayload>('ContextPayload')

// §4.11 — node-level ruml:context value ({ refs: [...] }). Duplicate ids are
// also rejected by the schema's `uniqueItems`; kept here so the standalone
// schema behaves identically.
export const ContextRefsSchema = rumlObjectDef<ContextRefs>(
    'ContextRefs',
).refine((value) => new Set(value.refs).size === value.refs.length, {
    message: 'refs must not contain duplicate context ids',
    path: ['refs'],
})

// §4.12 — a single text entry (root-level `data` value). The type-driven
// field requirements live as if/then conditionals on $defs.Text;
// `validUntil > validFrom` is code-only (JSON Schema cannot compare siblings).
export const TextSchema =
    rumlObjectDef<Text>('Text').superRefine(checkValidityPeriod)

// §4.12 — root-level ruml:text-reference payload.
export const CapabilityTextsValueSchema = rumlObjectDef<TextReferencePayload>(
    'TextReferencePayload',
)

// §4.13 — root-level ruml:protocol payload (config.level).
export const CapabilityProtocolValueSchema =
    rumlObjectDef<ProtocolPayload>('ProtocolPayload')
export type CapabilityProtocolValue = ProtocolPayload

// §4.12 — node-level ruml:text-reference payload: local anchors `{ id, element?, type }`.
export const TextReferencesNodeSchema = rumlObjectDef<TextRefs>('TextRefs')

// §4.11/§4.12 — prefix each capability's `containerPath` values must carry.
export const CONTEXT_CONTAINER_PATH_PREFIX = '.context/'
export const TEXTS_CONTAINER_PATH_PREFIX = '.texts/'

// §4.12 — a single `{ id, element?, type }` anchor of a node's `ruml:text-reference` refs.
export const TextReferenceSchema = rumlSubObjectDef<TextRef>(
    '$defs/TextRefs/properties/refs/items',
)
export type TextRef = TextRefs['refs'][number]

// §4.15 — node-level ruml:tree-reference payload: references to nodes of other
// RUML files (`represents`, `refersTo`).
export const TreeReferencesNodeSchema = rumlObjectDef<TreeRefs>('TreeRefs')
export const TreeReferenceSchema = rumlObjectDef<NodeRef>('NodeRef')
export type TreeRef = NodeRef
export type { TreeRefs }

// §4.16 — node-level ruml:tree-include payload: the included node of another
// RUML file.
export const TreeIncludeNodeSchema = rumlObjectDef<TreeInclude>('TreeInclude')
export type { TreeInclude }

export const AiQueryInputSchema = rumlSubObjectDef<AiQueryInput>(
    '$defs/CapabilityAiQueryNode/properties/inputs',
)

// §4.9 — the input selection and tuning knobs of a ruml:ai-query value.
export type AiQueryInput = NonNullable<CapabilityAiQueryNode['inputs']>
export type AiQueryConfig = NonNullable<CapabilityAiQueryNode['config']>
