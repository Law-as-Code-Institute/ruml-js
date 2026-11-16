// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { HashSchema, LanguageSchema } from './document'

describe('HashSchema (§3.2.4)', () => {
    it('accepts <algorithm>:<hex>', () => {
        expect(
            HashSchema.safeParse(
                'sha256:0f1e2d0000000000000000000000000000000000000000000000000000000000',
            ).success,
        ).toBe(true)
    })
    it('rejects a hash without an algorithm prefix', () => {
        expect(HashSchema.safeParse('0f1e2d').success).toBe(false)
    })
})

describe('LanguageSchema (ISO 639-1)', () => {
    it('accepts a lowercase two-letter code', () => {
        expect(LanguageSchema.safeParse('de').success).toBe(true)
    })
    it('rejects an uppercase or long code', () => {
        expect(LanguageSchema.safeParse('DE').success).toBe(false)
        expect(LanguageSchema.safeParse('deu').success).toBe(false)
    })
})
