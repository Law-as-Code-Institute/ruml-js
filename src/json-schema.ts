// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import {
    rumlJsonSchemaDocument,
    rumlResultJsonSchemaDocument,
} from './conversion/from-json-schema'

// The JSON Schema documents are now the source this package derives from, not
// something it generates — these accessors keep the previous call shape for
// consumers that read the schema (e.g. to serve or bundle it).
export const buildRumlJsonSchema = (): Record<string, unknown> =>
    rumlJsonSchemaDocument

export const buildRumlResultJsonSchema = (): Record<string, unknown> =>
    rumlResultJsonSchemaDocument

export const rumlJsonSchema = rumlJsonSchemaDocument
export const rumlResultJsonSchema = rumlResultJsonSchemaDocument
