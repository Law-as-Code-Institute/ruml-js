// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { z } from 'zod'
import { rumlDef } from '../conversion/defs'
import type { CapabilityId as CapabilityIdType } from '../generated/ruml.types'

export const CAPABILITY_ID_MIN_LENGTH = 1
export const CAPABILITY_ID_MAX_LENGTH = 128

export const DATAPOINTS_CAPABILITY_ID = 'ruml:datapoints'
export const TEXT_REFERENCE_CAPABILITY_ID = 'ruml:text-reference'
export const TREE_REFERENCE_CAPABILITY_ID = 'ruml:tree-reference'
export const TREE_INCLUDE_CAPABILITY_ID = 'ruml:tree-include'
export const CONTEXT_CAPABILITY_ID = 'ruml:context'
export const QUERY_CAPABILITY_ID = 'ruml:query'
export const AI_QUERY_CAPABILITY_ID = 'ruml:ai-query'
export const EXPRESSION_CAPABILITY_ID = 'ruml:expression'
export const ACTIONS_CAPABILITY_ID = 'ruml:actions'
export const PROTOCOL_CAPABILITY_ID = 'ruml:protocol'

// Official ids whose root payload carries a keyed `data` map.
export const OFFICIAL_RUML_CAPABILITY_IDS_WITH_DATA = [
    DATAPOINTS_CAPABILITY_ID,
    TEXT_REFERENCE_CAPABILITY_ID,
    CONTEXT_CAPABILITY_ID,
] as const

export const OFFICIAL_RUML_CAPABILITY_IDS_WITHOUT_DATA = [
    TREE_REFERENCE_CAPABILITY_ID,
    TREE_INCLUDE_CAPABILITY_ID,
    QUERY_CAPABILITY_ID,
    AI_QUERY_CAPABILITY_ID,
    EXPRESSION_CAPABILITY_ID,
    ACTIONS_CAPABILITY_ID,
    PROTOCOL_CAPABILITY_ID,
] as const

export const OFFICIAL_RUML_CAPABILITY_IDS = [
    ...OFFICIAL_RUML_CAPABILITY_IDS_WITH_DATA,
    ...OFFICIAL_RUML_CAPABILITY_IDS_WITHOUT_DATA,
] as const
export type OfficialCapabilityId = (typeof OFFICIAL_RUML_CAPABILITY_IDS)[number]

export const DRAFT_REGEX = /^ruml:draft(?:\/[a-z0-9_-]+)+$/

export const REVERSE_DOMAIN_REGEX =
    /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+(?:\/[a-z0-9_-]+)+$/

// §4.4 — official `ruml:` ids, `ruml:draft/` ids, or third-party
// reverse-domain ids.
export const CapabilityIdSchema = rumlDef(
    'CapabilityId',
) as z.ZodType<CapabilityIdType>
export type CapabilityId = CapabilityIdType

// Single source for data-entry id rules ("Key = ID", §3.2.6): a capability's
// `data` keys double as the entry id. One pattern for all four kinds (DP-02,
// CTX-04, TXT-02); a prefix such as `dp_` is a convention, not a rule. Regexes
// mirror the $defs patterns; the schemas are derived from those defs.
const DATA_ID_REGEX = /^[a-z_][a-z0-9_]*$/
export const DATAPOINT_ID_REGEX = DATA_ID_REGEX // §4.7
export const SET_ID_REGEX = DATA_ID_REGEX // §4.7.4
export const CONTEXT_ID_REGEX = DATA_ID_REGEX // §4.11
export const TEXT_ID_REGEX = DATA_ID_REGEX // §4.12

export const DatapointIdSchema = rumlDef('DatapointId') as z.ZodType<string>
export const SetIdSchema = rumlDef('SetId') as z.ZodType<string>
export const ContextIdSchema = rumlDef('ContextId') as z.ZodType<string>
export const TextIdSchema = rumlDef('TextId') as z.ZodType<string>
