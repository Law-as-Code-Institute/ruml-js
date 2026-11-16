// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { z } from 'zod'
import {
    rumlDef,
    rumlEnumDef,
    rumlObjectDef,
    rumlSubDef,
    rumlSubObjectDef,
} from '../conversion/defs'
import type {
    DecisionMode as DecisionModeType,
    DocumentStatus as DocumentStatusType,
    DocumentType as DocumentTypeType,
    LexId as LexIdType,
    Metadata as MetadataType,
    Node as NodeType,
    Operator as OperatorType,
    Rulemap as RulemapType,
    RUML,
    Timestamp as TimestampType,
    Uuid as UuidType,
} from '../generated/ruml.types'

// The RUML document shape — generated from schema/ruml.schema.json. The name
// `RumlBase` (the pre-refinement document type) is kept for the refinements
// and the Validator, which type against it.
export type RumlBase = RUML

export const UuidSchema = rumlDef('Uuid') as z.ZodType<UuidType>
export type Uuid = UuidType

export const LexIdSchema = rumlDef('LexId') as z.ZodType<LexIdType>
export type LexId = LexIdType

export const TimestampSchema = rumlDef('Timestamp') as z.ZodType<TimestampType>
export type Timestamp = TimestampType

export const OperatorSchema = rumlEnumDef<OperatorType>('Operator')
export type Operator = OperatorType

export const DecisionModeSchema = rumlEnumDef<DecisionModeType>('DecisionMode')
export type DecisionMode = DecisionModeType

export const MetadataSchema = rumlObjectDef<MetadataType>('Metadata')
export type Metadata = MetadataType

export const DocumentStatusSchema =
    rumlEnumDef<DocumentStatusType>('DocumentStatus')
export type DocumentStatus = DocumentStatusType

export const DocumentTypeSchema = rumlEnumDef<DocumentTypeType>('DocumentType')
export type DocumentType = DocumentTypeType

// `validUntil` MUST be after `validFrom` when both are present. Compared via
// `Date.parse` so differing timezone offsets order semantically. JSON Schema
// cannot compare two sibling values, so this stays code — shared by the
// ruml:text-reference capability and the document-level
// `validityPeriodsOrdered` refinement.
export const checkValidityPeriod = <
    T extends { validFrom?: string; validUntil?: string },
>(
    value: T,
    ctx: z.core.$RefinementCtx<T>,
): void => {
    const { validFrom, validUntil } = value
    if (validFrom === undefined || validUntil === undefined) return
    if (Date.parse(validUntil) <= Date.parse(validFrom)) {
        ctx.addIssue({
            code: 'custom',
            path: ['validUntil'],
            message: `'validUntil' must be after 'validFrom'`,
        })
    }
}

export const NodeSchema = rumlObjectDef<NodeType>('Node')
export type Node = NodeType

export const RulemapSchema = rumlObjectDef<RulemapType>('Rulemap')
export type Rulemap = RulemapType

// §4.11/§4.12 — how an entry's content is carried. The type-driven field
// requirements live as if/then conditionals on $defs.Text / $defs.Context.
export const EMBEDDING_TYPES = [
    'embedded',
    'url',
    'container',
    'external',
] as const
export type EmbeddingType = (typeof EMBEDDING_TYPES)[number]

// §3.2 — integrity hash (`<algorithm>:<hex>`, carried by ruml:context entries)
// and ISO 639-1 language (ruml:text-reference text entries).
export const HashSchema = rumlSubDef(
    '$defs/Context/properties/hash',
) as z.ZodType<string>
export const LanguageSchema = rumlSubDef(
    '$defs/Text/properties/language',
) as z.ZodType<string>

// §3.2 — an entry of `metadata.authors`.
export const AuthorSchema = rumlSubObjectDef<Author>(
    '$defs/Metadata/properties/authors/items',
)
export type Author = NonNullable<MetadataType['authors']>[number]

// §3.2 — `metadata.derivedFrom`: where this document was derived from.
export const DerivedSchema = rumlSubObjectDef<Derived>(
    '$defs/Metadata/properties/derivedFrom',
)
export type Derived = NonNullable<MetadataType['derivedFrom']>

export const DerivationTypeSchema = rumlSubDef(
    '$defs/Metadata/properties/derivedFrom/properties/derivationType',
) as z.ZodType<DerivationType>
export type DerivationType = Derived['derivationType']
