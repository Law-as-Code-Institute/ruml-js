// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { RUML } from '../ruml'
import { collectRumlWarnings } from '../rules/refinements'
import {
    buildRegistries,
    buildRumlSchema,
    toErrors,
    toWarnings,
} from './helpers'
import type {
    RumlValidation,
    RumlValidationIssue,
    RumlValidatorOptions,
} from './types'
import type { RUMLResult } from '../result/result'

// Re-export the public types so the package barrel keeps one validator entry point.
export type {
    CapabilityDefinition,
    RumlValidation,
    RumlValidationIssue,
    RumlValidatorOptions,
} from './types'

export type ValidationError = {
    success: false
    errors: RumlValidationIssue[]
}

export type SafeParseRuml =
    | {
          success: true
          warnings?: RumlValidationIssue[]
          data: RUML
      }
    | ValidationError

export type SafeParseRumlResult =
    | {
          success: true
          warnings?: RumlValidationIssue[]
          data: RUMLResult
      }
    | ValidationError

export class RumlValidator {
    private readonly schema: ReturnType<typeof buildRumlSchema>

    public constructor(options: RumlValidatorOptions = {}) {
        this.schema = buildRumlSchema(
            buildRegistries(options.supportedCapabilities ?? []),
            { expressionReads: options.expressionReads },
        )
    }

    public validate(ruml: unknown): RumlValidation {
        const result = this.safeParse(ruml)

        if (!result.success) {
            return { valid: false, errors: result.errors }
        }

        return result.warnings
            ? { valid: true, warnings: result.warnings }
            : { valid: true }
    }

    public parse(ruml: unknown): RUML {
        return this.schema.parse(ruml)
    }

    public safeParse(ruml: unknown): SafeParseRuml {
        const result = this.schema.safeParse(ruml)

        if (!result.success) {
            return { success: false, errors: toErrors(result.error) }
        }

        const warnings = toWarnings(collectRumlWarnings(result.data))

        if (warnings.length > 0) {
            return { success: true, warnings, data: result.data }
        }

        return { success: true, data: result.data }
    }
}
