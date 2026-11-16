// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { z } from 'zod'
import type { ExpressionReads } from '../rules/refinements'

// Describes one capability so the Validator can fully validate its value
// wherever it appears. Authored once by the owner of the id's namespace
// (`ruml:` is reserved for core; third parties use reverse-domain). The value
// schema is an arbitrary `z.ZodType`, so a capability value can be any shape —
// not just a string (e.g. our `com.rulemapping/engine` is `{color, explanation}`).
export type CapabilityDefinition = {
    id: string
    // value under root `capabilities[id]`; omit if the capability never appears at the root
    rootValueSchema?: z.ZodType
    // value under `node.capabilities[id]`; omit if the capability never appears on a node
    nodeValueSchema?: z.ZodType
}

export type RumlValidatorOptions = {
    // External / additional capability schemas, validated on top of the always-
    // included `ruml:` core capabilities.
    supportedCapabilities?: CapabilityDefinition[]
    // Makes the DP-18 check exact: pass `queryDatapointRefs` from the `./query`
    // entry. Without it a text scan is used, which misses nested reads.
    expressionReads?: ExpressionReads
}

// A single validation finding. `path` is the dotted location in the document
// (e.g. `rulemap.nodes.1.capabilities`), kept structured so consumers can map a
// finding back to its source instead of parsing a prefixed string.
export type RumlValidationIssue = { message: string; path: string }

export type RumlValidation =
    | { valid: true; warnings?: RumlValidationIssue[] }
    | { valid: false; errors: RumlValidationIssue[] }
