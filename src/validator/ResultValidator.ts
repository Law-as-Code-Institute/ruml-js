// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { type RUMLResult, RUMLResultSchema } from '../result/result'
import type { RumlValidation, RumlValidationIssue } from './types'
import { toErrors } from './helpers'
import { type Uuid } from '../document/document'
import type { SafeParseRumlResult } from './Validator'

export class RumlResultValidator {
    private readonly rumlId: Uuid
    private readonly rumlHash: string
    private readonly schema: typeof RUMLResultSchema

    public constructor(rumlId: Uuid, rumlHash: string) {
        this.rumlId = rumlId
        this.rumlHash = rumlHash
        this.schema = RUMLResultSchema
    }

    public validate = (rumlResult: unknown): RumlValidation => {
        const result = this.safeParse(rumlResult)

        return result.success
            ? { valid: true }
            : { valid: false, errors: result.errors }
    }

    public safeParse(rumlResult: unknown): SafeParseRumlResult {
        const result = this.schema.safeParse(rumlResult)

        if (!result.success) {
            return { success: false, errors: toErrors(result.error) }
        }

        const rumlIssues = this.validateRumlReference(result.data)

        if (rumlIssues.length > 0) {
            return { success: false, errors: rumlIssues }
        }

        return { success: true, data: result.data }
    }

    private validateRumlReference(result: RUMLResult): RumlValidationIssue[] {
        const rumlIssues: RumlValidationIssue[] = []

        if (this.rumlId !== result.rumlReference.id) {
            rumlIssues.push({
                message: 'Ruml reference Id mismatch.',
                path: 'rumlReference.id',
            })
        }

        if (this.rumlHash !== result.rumlReference.hash) {
            rumlIssues.push({
                message:
                    'Hash mismatch. The ruml data structure reference changed.',
                path: 'rumlReference.hash',
            })
        }

        return rumlIssues
    }
}
