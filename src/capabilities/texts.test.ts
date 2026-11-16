// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { TextIdSchema } from './ids'
import {
    CapabilityTextsValueSchema,
    TextReferencesNodeSchema,
    TextSchema,
} from './values'

const GUID = '4c1f0a52-8f7e-4b4a-9d0e-2a6b3c8e1f10'

const validText = {
    title: '§ 823 BGB',
    uri: 'BGB',
    timestamp: '2024-01-01T00:00:00Z',
    status: 'inForce',
    text: 'Wer vorsätzlich oder fahrlässig...',
}

describe('TextIdSchema', () => {
    // TXT-02: `[a-z_][a-z0-9_]*`, no prefix required.
    it.each(['text_bgb_823', 'bgb_823', 'text_', '_a', 'a'])(
        'accepts a spec key: %s',
        (id) => {
            expect(TextIdSchema.safeParse(id).success).toBe(true)
        },
    )

    it.each([
        'text_BGB_823',
        '823_bgb',
        '',
        'text-a',
        'text_bgb-823',
        'text_§',
        'text_foo\n',
    ])('rejects an invalid key: %j', (id) => {
        expect(TextIdSchema.safeParse(id).success).toBe(false)
    })
})

describe('TextSchema', () => {
    it('accepts a minimal embedded text', () => {
        expect(TextSchema.safeParse(validText).success).toBe(true)
    })

    it('defaults type to embedded and isReferenced to true', () => {
        const result = TextSchema.parse(validText)
        expect(result.type).toBe('embedded')
        expect(result.isReferenced).toBe(true)
    })

    it.each(['title', 'timestamp', 'status', 'text'])(
        'rejects when required field %s is missing',
        (field) => {
            const { [field as keyof typeof validText]: _omit, ...rest } =
                validText
            expect(TextSchema.safeParse(rest).success).toBe(false)
        },
    )

    it('accepts a text written in the file itself, without uri', () => {
        const { uri: _uri, ...rest } = validText
        expect(TextSchema.safeParse(rest).success).toBe(true)
    })

    it.each(['draft', 'proposed', 'enacted', 'inForce', 'amended', 'repealed'])(
        'accepts known status %s',
        (status) => {
            expect(TextSchema.safeParse({ ...validText, status }).success).toBe(
                true,
            )
        },
    )

    it('rejects an unknown status', () => {
        expect(
            TextSchema.safeParse({ ...validText, status: 'unknown' }).success,
        ).toBe(false)
    })

    it('rejects a non-ISO timestamp', () => {
        expect(
            TextSchema.safeParse({ ...validText, timestamp: '2024-01-01' })
                .success,
        ).toBe(false)
    })

    it('accepts a timestamp with a timezone offset (§3.2)', () => {
        expect(
            TextSchema.safeParse({
                ...validText,
                timestamp: '2024-01-01T00:00:00+01:00',
            }).success,
        ).toBe(true)
    })

    it('rejects a language that is not ISO 639-1', () => {
        expect(
            TextSchema.safeParse({ ...validText, language: 'deu' }).success,
        ).toBe(false)
        expect(
            TextSchema.safeParse({ ...validText, language: 'de' }).success,
        ).toBe(true)
    })

    it('accepts an optional version field', () => {
        expect(
            TextSchema.safeParse({
                ...validText,
                version: 'Fassung vom 1.1.2024',
            }).success,
        ).toBe(true)
    })

    describe('type requirements', () => {
        it('rejects an unknown type', () => {
            expect(
                TextSchema.safeParse({ ...validText, type: 'unknown' }).success,
            ).toBe(false)
        })

        it('requires text for embedded (the default)', () => {
            const { text: _text, ...rest } = validText
            expect(TextSchema.safeParse(rest).success).toBe(false)
        })

        it('requires a valid url for type url', () => {
            const base = { ...validText, type: 'url' as const }
            const { text: _text, ...rest } = base
            expect(TextSchema.safeParse(rest).success).toBe(false)
            expect(
                TextSchema.safeParse({ ...rest, url: 'not a url' }).success,
            ).toBe(false)
            expect(
                TextSchema.safeParse({
                    ...rest,
                    url: 'https://www.gesetze-im-internet.de/bgb/__823.html',
                }).success,
            ).toBe(true)
        })

        it('requires a .texts/ path for type container', () => {
            const base = { ...validText, type: 'container' as const }
            const { text: _text, ...rest } = base
            expect(
                TextSchema.safeParse({ ...rest, containerPath: 'bgb.txt' })
                    .success,
            ).toBe(false)
            expect(
                TextSchema.safeParse({
                    ...rest,
                    containerPath: '.texts/bgb.txt',
                }).success,
            ).toBe(true)
        })

        it('requires a ref for type external', () => {
            const base = { ...validText, type: 'external' as const }
            const { text: _text, ...rest } = base
            expect(TextSchema.safeParse(rest).success).toBe(false)
            expect(
                TextSchema.safeParse({ ...rest, ref: 'juris:BGB/823' }).success,
            ).toBe(true)
        })
    })

    describe('validity period', () => {
        it('rejects validUntil that is not after validFrom', () => {
            expect(
                TextSchema.safeParse({
                    ...validText,
                    validFrom: '2024-01-01T00:00:00Z',
                    validUntil: '2024-01-01T00:00:00Z',
                }).success,
            ).toBe(false)
        })

        it('accepts validUntil after validFrom', () => {
            expect(
                TextSchema.safeParse({
                    ...validText,
                    validFrom: '2002-01-01T00:00:00Z',
                    validUntil: '2024-01-01T00:00:00Z',
                }).success,
            ).toBe(true)
        })
    })
})

describe('CapabilityTextsValueSchema', () => {
    it('accepts data keyed by text id', () => {
        expect(
            CapabilityTextsValueSchema.safeParse({
                data: { text_bgb_823: validText },
            }).success,
        ).toBe(true)
    })

    it('accepts a data key without the text_ prefix', () => {
        expect(
            CapabilityTextsValueSchema.safeParse({
                data: { bgb_823: validText },
            }).success,
        ).toBe(true)
    })

    it.each(['text-bgb-823', 'text_BGB_823'])(
        'rejects a malformed data key: %s',
        (key) => {
            expect(
                CapabilityTextsValueSchema.safeParse({
                    data: { [key]: validText },
                }).success,
            ).toBe(false)
        },
    )

    it('rejects an invalid text entry', () => {
        expect(
            CapabilityTextsValueSchema.safeParse({
                data: { text_bgb_823: { ...validText, status: 'unknown' } },
            }).success,
        ).toBe(false)
    })

    it('rejects fields outside data', () => {
        expect(
            CapabilityTextsValueSchema.safeParse({ data: {}, config: {} })
                .success,
        ).toBe(false)
    })
})

describe('TextReferencesNodeSchema', () => {
    const accepts = (payload: unknown) =>
        TextReferencesNodeSchema.safeParse(payload).success

    it('accepts an anchor to a whole text', () => {
        expect(
            accepts({ refs: [{ id: 'text_bgb_823', type: 'represents' }] }),
        ).toBe(true)
    })

    it('accepts an anchor to one element, and refers-to anchors beside it', () => {
        expect(
            accepts({
                refs: [
                    { id: 'text_a', element: GUID, type: 'represents' },
                    { id: 'text_a', type: 'refers-to' },
                    { id: 'text_b', element: GUID, type: 'refers-to' },
                ],
            }),
        ).toBe(true)
    })

    it('rejects a second represents anchor', () => {
        expect(
            accepts({
                refs: [
                    { id: 'text_a', type: 'represents' },
                    { id: 'text_b', type: 'represents' },
                ],
            }),
        ).toBe(false)
    })

    it('rejects a duplicate anchor', () => {
        const ref = { id: 'text_a', element: GUID, type: 'refers-to' }
        expect(accepts({ refs: [ref, { ...ref }] })).toBe(false)
    })

    it('rejects an anchor without type or with an unknown type', () => {
        expect(accepts({ refs: [{ id: 'text_a' }] })).toBe(false)
        expect(accepts({ refs: [{ id: 'text_a', type: 'embodies' }] })).toBe(
            false,
        )
    })

    it('accepts a text id without the text_ prefix', () => {
        expect(accepts({ refs: [{ id: 'bgb_823', type: 'refers-to' }] })).toBe(
            true,
        )
    })

    it.each(['text_BGB_823', 'text-bgb-823'])(
        'rejects a malformed text id: %s',
        (id) => {
            expect(accepts({ refs: [{ id, type: 'refers-to' }] })).toBe(false)
        },
    )

    it('rejects an element that is not a lowercase UUID', () => {
        expect(
            accepts({
                refs: [{ id: 'text_a', element: 'art-z1', type: 'refers-to' }],
            }),
        ).toBe(false)
    })

    it('rejects anchor uris and normRef: anchors are local', () => {
        expect(
            accepts({
                refs: [{ id: 'text_a', uri: `#x/${GUID}`, type: 'refers-to' }],
            }),
        ).toBe(false)
        expect(accepts({ normRef: { id: 'text_a' } })).toBe(false)
    })

    it('rejects an empty refs list, an empty object and extra properties', () => {
        expect(accepts({ refs: [] })).toBe(false)
        expect(accepts({})).toBe(false)
        expect(
            accepts({
                refs: [{ id: 'text_a', type: 'refers-to' }],
                extra: true,
            }),
        ).toBe(false)
    })
})
