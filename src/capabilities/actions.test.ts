// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { ActionSchema, ActionsSchema } from './values'

const validAction = {
    operation: 'createDocument',
    ref: 'document-service',
}

describe('ActionSchema', () => {
    it('accepts a minimal action', () => {
        expect(ActionSchema.safeParse(validAction).success).toBe(true)
    })

    it('accepts an action with a config object', () => {
        expect(
            ActionSchema.safeParse({
                ...validAction,
                config: { template: 'approval-letter', format: 'pdf' },
            }).success,
        ).toBe(true)
    })

    it.each(['operation', 'ref'])(
        'rejects when required field %s is missing',
        (field) => {
            const { [field as keyof typeof validAction]: _omit, ...rest } =
                validAction
            expect(ActionSchema.safeParse(rest).success).toBe(false)
        },
    )

    it('accepts any operation string (open vocabulary)', () => {
        expect(
            ActionSchema.safeParse({ ...validAction, operation: 'doTheThing' })
                .success,
        ).toBe(true)
    })

    it('rejects unknown extra properties', () => {
        expect(
            ActionSchema.safeParse({ ...validAction, extra: true }).success,
        ).toBe(false)
    })
})

describe('ActionsSchema', () => {
    it.each(['onTrue', 'onFalse', 'onUndefined'])(
        'accepts an actions object with only %s',
        (key) => {
            expect(
                ActionsSchema.safeParse({ [key]: validAction }).success,
            ).toBe(true)
        },
    )

    it('accepts all branches plus a description', () => {
        expect(
            ActionsSchema.safeParse({
                description: 'Creates the decision document',
                onTrue: validAction,
                onFalse: validAction,
                onUndefined: validAction,
            }).success,
        ).toBe(true)
    })

    it('rejects an empty actions object', () => {
        expect(ActionsSchema.safeParse({}).success).toBe(false)
    })

    it('rejects a description without any on* branch', () => {
        expect(
            ActionsSchema.safeParse({ description: 'no reaction' }).success,
        ).toBe(false)
    })

    it('rejects unknown extra properties', () => {
        expect(
            ActionsSchema.safeParse({ onTrue: validAction, extra: true })
                .success,
        ).toBe(false)
    })

    it('rejects unknown properties on a nested action', () => {
        expect(
            ActionsSchema.safeParse({
                onTrue: { ...validAction, extra: true },
            }).success,
        ).toBe(false)
    })

    it('reports an invalid nested action under its branch path', () => {
        const result = ActionsSchema.safeParse({
            onTrue: { operation: 'createDocument' },
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path[0]).toBe('onTrue')
    })
})
