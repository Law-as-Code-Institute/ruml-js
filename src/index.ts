// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
export * from './constants'
export * from './document/document'
export * from './capabilities/ids'
export * from './capabilities/registry'
export * from './capabilities/values'
export * from './capabilities/datapoints'
export * from './capabilities/datapointRefs'
export * from './ruml'
export {
    collectRumlWarnings,
    RUML_WARNINGS,
    type RumlWarning,
} from './rules/refinements'
export * from './result/result'
export * from './conversion/from-json-schema'
export * from './json-schema'
export {
    type CapabilityDefinition,
    RumlValidator,
    type RumlValidation,
    type RumlValidatorOptions,
    type RumlValidationIssue,
} from './validator/Validator'
export type { NodeCapabilities } from './generated/ruml.types'

// NB: capabilities/query-expression is intentionally NOT re-exported here — it
// imports jsonata. Keep it behind the `./query` entry so the main entry stays
// jsonata-free; `validateQueryExpression` is imported from the `./query` entry.
