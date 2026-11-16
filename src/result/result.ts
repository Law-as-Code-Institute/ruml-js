// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod'
import { NODE_STATUS } from '../constants'
import {
    entryPayloadRoutes,
    rumlResultDef,
    rumlResultEnumDef,
    rumlResultObjectDef,
} from '../conversion/defs'
import {
    rumlResultJsonSchemaDocument,
    zodFromRumlResultJsonSchema,
} from '../conversion/from-json-schema'
import type {
    CapabilityQueryResult,
    Evaluation as EvaluationType,
    EvaluationMode as EvaluationModeType,
    FalseResult,
    IgnoredReason as IgnoredReasonType_,
    IgnoredReasonType as IgnoredReasonKind,
    IgnoredResult,
    NodePath as NodePathType,
    NodeResult as NodeResultType,
    NodeResultBase,
    ResultNodeCapabilities as ResultNodeCapabilitiesType,
    RumlReference as RumlReferenceType,
    RUMLResult as RUMLResultType,
    TrueResult,
    UndefinedReason as UndefinedReasonType,
    UndefinedResult,
} from '../generated/ruml-result.types'

export const NodePathSchema = rumlResultDef(
    'NodePath',
) as z.ZodType<NodePathType>
export type NodePath = NodePathType

export const EvaluationModeSchema =
    rumlResultEnumDef<EvaluationModeType>('EvaluationMode')
export type EvaluationMode = EvaluationModeType

// Final status of a node after evaluation. `pending` is intentionally NOT a
// valid value — nodes that were never reached/evaluated do not appear in the
// results object at all. The schema has no def for it any more: each status is
// the `const` of one NodeResult variant.
export const NodeResultStatusSchema = z
    .enum(NODE_STATUS)
    .meta({ id: 'NodeResultStatus' })
export type NodeResultStatus = NodeResultType['status']

export type IgnoredReasonType = IgnoredReasonKind

export const IgnoredReasonSchema =
    rumlResultObjectDef<IgnoredReasonType_>('IgnoredReason')
export type IgnoredReason = IgnoredReasonType_

export const UndefinedReasonSchema =
    rumlResultObjectDef<UndefinedReasonType>('UndefinedReason')
export type UndefinedReason = UndefinedReasonType
export type UndefinedReasonKind = UndefinedReasonType['type']

export const CapabilityQueryResultValueSchema =
    rumlResultObjectDef<CapabilityQueryResult>('CapabilityQueryResult')
export type CapabilityQueryResultValue = CapabilityQueryResult

// Typed result value schemas per capability id. Node capability results are an
// ordered entry list now, so the routes come from the entry's own id/payload
// conditionals rather than from patternProperties, which the array def has not
// carried since the reshape.
export const RESULT_NODE_CAPABILITY_VALUE_SCHEMAS: Record<string, z.ZodType> =
    Object.fromEntries(
        Object.entries(
            entryPayloadRoutes(
                rumlResultJsonSchemaDocument,
                'ResultNodeCapabilityEntry',
            ),
        ).map(([id, defName]) => [id, rumlResultDef(defName)]),
    )

// An array def, so not `rumlResultObjectDef` — that casts to a ZodObject and
// `.shape`/`.extend` would throw on it at runtime.
export const ResultNodeCapabilitiesSchema = rumlResultDef(
    'ResultNodeCapabilities',
) as z.ZodType<ResultNodeCapabilitiesType>
export type ResultNodeCapabilities = ResultNodeCapabilitiesType

// A union over `status`, whose variants fix the type of the required `reason`.
// Not an object def, so no `.shape`/`.extend`.
export const NodeResultSchema = rumlResultDef(
    'NodeResult',
) as z.ZodType<NodeResultType>
export type NodeResult = NodeResultType
export type {
    FalseResult,
    IgnoredResult,
    NodeResultBase,
    TrueResult,
    UndefinedResult,
}

export const RumlReferenceSchema =
    rumlResultObjectDef<RumlReferenceType>('RumlReference')
export type RumlReference = RumlReferenceType

export const EvaluationSchema =
    rumlResultObjectDef<EvaluationType>('Evaluation')
export type Evaluation = EvaluationType

// The exported model — derived from schema/ruml-result.schema.json.
export const RUMLResultSchema =
    zodFromRumlResultJsonSchema() as z.ZodType<RUMLResultType>
export type RUMLResult = RUMLResultType
