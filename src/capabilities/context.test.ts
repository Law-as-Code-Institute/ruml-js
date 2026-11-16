// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { ContextIdSchema } from './ids'
import {
    CapabilityContextValueSchema,
    ContextRefsSchema,
    ContextSchema,
} from './values'

const validContext = {
    title: 'BGH zur Auslegung des Wohnsitzbegriffs',
    category: 'courtDecision',
    type: 'embedded',
    timestamp: '2024-01-15T10:00:00Z',
}

describe('ContextIdSchema', () => {
    // CTX-04: `[a-z_][a-z0-9_]*`, no prefix required.
    it.each(['ctx_bgh_2024', 'bgh_2024', 'ctx_', '_a', 'a'])(
        'accepts a spec key: %s',
        (id) => {
            expect(ContextIdSchema.safeParse(id).success).toBe(true)
        },
    )

    it.each([
        'ctx_BGH_2024',
        '2024_bgh',
        '',
        'ctx-a',
        'ctx_bgh-2024',
        'ctx_§',
        'ctx_foo\n',
    ])('rejects an invalid key: %j', (id) => {
        expect(ContextIdSchema.safeParse(id).success).toBe(false)
    })
})

describe('ContextSchema', () => {
    it('accepts a minimal embedded context', () => {
        expect(ContextSchema.safeParse(validContext).success).toBe(true)
    })

    it('defaults subject to false', () => {
        expect(ContextSchema.parse(validContext).subject).toBe(false)
    })

    it.each(['title', 'category', 'timestamp'])(
        'rejects when required field %s is missing',
        (field) => {
            const { [field as keyof typeof validContext]: _omit, ...rest } =
                validContext
            expect(ContextSchema.safeParse(rest).success).toBe(false)
        },
    )

    it('rejects an unknown category', () => {
        expect(
            ContextSchema.safeParse({ ...validContext, category: 'unknown' })
                .success,
        ).toBe(false)
    })

    it('rejects an unknown type', () => {
        expect(
            ContextSchema.safeParse({ ...validContext, type: 'inline' })
                .success,
        ).toBe(false)
    })

    it('rejects a non-ISO timestamp', () => {
        expect(
            ContextSchema.safeParse({
                ...validContext,
                timestamp: '2024-01-15',
            }).success,
        ).toBe(false)
    })

    it('accepts arbitrary metadata, content and source objects', () => {
        expect(
            ContextSchema.safeParse({
                ...validContext,
                metadata: { court: 'BGH', anything: 1 },
                content: { summary: 'x'.repeat(1000), media: [{}] },
                source: { license: null, custom: true },
            }).success,
        ).toBe(true)
    })

    describe('type requirements', () => {
        it('requires a valid url for type url', () => {
            const base = { ...validContext, type: 'url' as const }
            expect(ContextSchema.safeParse(base).success).toBe(false)
            expect(
                ContextSchema.safeParse({ ...base, url: 'not a url' }).success,
            ).toBe(false)
            expect(
                ContextSchema.safeParse({
                    ...base,
                    url: 'https://www.gesetze-im-internet.de/estg/__32a.html',
                }).success,
            ).toBe(true)
        })

        it('requires a .context/ path for type container (hash optional)', () => {
            const base = { ...validContext, type: 'container' as const }
            // wrong prefix
            expect(
                ContextSchema.safeParse({ ...base, containerPath: 'doc.pdf' })
                    .success,
            ).toBe(false)
            // valid path, no hash needed
            expect(
                ContextSchema.safeParse({
                    ...base,
                    containerPath: '.context/doc.pdf',
                }).success,
            ).toBe(true)
            // hash is allowed and validated against <algorithm>:<hex>
            expect(
                ContextSchema.safeParse({
                    ...base,
                    containerPath: '.context/doc.pdf',
                    hash: 'sha3-256:def4560000000000000000000000000000000000000000000000000000000000',
                }).success,
            ).toBe(true)
            expect(
                ContextSchema.safeParse({
                    ...base,
                    containerPath: '.context/doc.pdf',
                    hash: 'not-a-hash',
                }).success,
            ).toBe(false)
        })

        it('requires a ref for type external', () => {
            const base = { ...validContext, type: 'external' as const }
            expect(ContextSchema.safeParse(base).success).toBe(false)
            expect(
                ContextSchema.safeParse({ ...base, ref: 'legal-database' })
                    .success,
            ).toBe(true)
        })
    })
})

describe('ContextRefsSchema', () => {
    it('accepts a non-empty list of context ids', () => {
        expect(
            ContextRefsSchema.safeParse({ refs: ['ctx_guidance'] }).success,
        ).toBe(true)
    })

    it('rejects an empty refs list', () => {
        expect(ContextRefsSchema.safeParse({ refs: [] }).success).toBe(false)
    })

    it('rejects duplicate context ids', () => {
        expect(
            ContextRefsSchema.safeParse({ refs: ['ctx_a', 'ctx_a'] }).success,
        ).toBe(false)
    })

    it('accepts a context id without the ctx_ prefix', () => {
        expect(
            ContextRefsSchema.safeParse({ refs: ['guidance'] }).success,
        ).toBe(true)
    })

    it('rejects a malformed context id', () => {
        expect(
            ContextRefsSchema.safeParse({ refs: ['Guidance'] }).success,
        ).toBe(false)
    })

    it('rejects a missing refs field', () => {
        expect(ContextRefsSchema.safeParse({}).success).toBe(false)
    })

    it('rejects unknown extra properties', () => {
        expect(
            ContextRefsSchema.safeParse({
                refs: ['ctx_guidance'],
                extra: true,
            }).success,
        ).toBe(false)
    })
})

describe('CapabilityContextValueSchema', () => {
    it('accepts data keyed by context id', () => {
        expect(
            CapabilityContextValueSchema.safeParse({
                data: { ctx_guidance: validContext },
            }).success,
        ).toBe(true)
    })

    it('accepts a data key without the ctx_ prefix', () => {
        expect(
            CapabilityContextValueSchema.safeParse({
                data: { guidance: validContext },
            }).success,
        ).toBe(true)
    })

    it('rejects a data key with a capital letter', () => {
        expect(
            CapabilityContextValueSchema.safeParse({
                data: { ctx_Guidance: validContext },
            }).success,
        ).toBe(false)
    })

    it('rejects an invalid context entry', () => {
        expect(
            CapabilityContextValueSchema.safeParse({
                data: { ctx_guidance: { ...validContext, category: 'x' } },
            }).success,
        ).toBe(false)
    })

    it('rejects root-level fields outside the payload', () => {
        expect(
            CapabilityContextValueSchema.safeParse({
                required: true,
                data: {},
            }).success,
        ).toBe(false)
    })
})
