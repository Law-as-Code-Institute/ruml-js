// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { TextIdSchema } from '../capabilities/ids'
import { derivedGuid, newGuid, newTextKey, textDigest } from './index'

describe('textDigest', () => {
    const content = {
        type: 'akomaNtoso',
        content: [
            {
                type: 'p',
                attrs: {
                    eId: 'text-n1',
                    GUID: '0b1e9e8a-2c55-4f5f-9a3e-6d1c7b2a4e01',
                },
                content: ['Grüße – § 1'],
            },
        ],
    }

    it('is the SHA3-256 of the RFC 8785 form', () => {
        expect(textDigest(content)).toBe(
            'sha3-256:a4d34290665e92a03a9cbcae65e26e9d98fc52a7e65e3577757ab2e2b30b5694',
        )
    })

    it('leaves members without a value out, as JSON does', () => {
        expect(textDigest({ ...content, attrs: undefined })).toBe(
            textDigest(content),
        )
    })
})

describe('derivedGuid', () => {
    it('is a stable UUID per owner and role', () => {
        const owner = '0b1e9e8a-2c55-4f5f-9a3e-6d1c7b2a4e01'
        expect(derivedGuid(owner, 'num')).toBe(derivedGuid(owner, 'num'))
        expect(derivedGuid(owner, 'num')).not.toBe(
            derivedGuid(owner, 'content'),
        )
        expect(derivedGuid(owner, 'num')).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        )
    })
})

describe('identifiers', () => {
    it('creates lowercase UUID v4 GUIDs', () => {
        expect(newGuid()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        )
    })

    it('creates text keys the schema accepts', () => {
        const key = newTextKey()
        expect(key).toMatch(/^text_[0-9a-f]{32}$/)
        expect(TextIdSchema.safeParse(key).success).toBe(true)
    })
})
