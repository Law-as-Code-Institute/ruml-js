// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { CapabilityQueryNodeValueSchema } from './values'

describe('CapabilityQueryNodeValueSchema', () => {
    it('accepts a value with only an expression', () => {
        const result = CapabilityQueryNodeValueSchema.safeParse({
            expression: 'dp_annual_income > 50000',
        })
        expect(result.success).toBe(true)
    })

    it('accepts a value with an expression and a description', () => {
        const result = CapabilityQueryNodeValueSchema.safeParse({
            expression: 'dp_credit_score >= 600',
            description: 'Mindesteinkommensgrenze',
        })
        expect(result.success).toBe(true)
    })

    it('rejects a missing expression', () => {
        const result = CapabilityQueryNodeValueSchema.safeParse({
            description: 'no expression',
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual(['expression'])
    })

    it('rejects an empty expression', () => {
        const result = CapabilityQueryNodeValueSchema.safeParse({
            expression: '',
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual(['expression'])
    })

    it('rejects a non-string expression', () => {
        const result = CapabilityQueryNodeValueSchema.safeParse({
            expression: 42,
        })
        expect(result.success).toBe(false)
    })

    it('rejects unknown extra properties', () => {
        const result = CapabilityQueryNodeValueSchema.safeParse({
            expression: 'dp_age >= 18',
            unknown: 'foo',
        })
        expect(result.success).toBe(false)
    })
})
