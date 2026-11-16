// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { MetadataSchema } from './document'

const minimalMetadata = {
    id: '415729b7-293c-421d-adde-0bb209a9c9a9',
    version: '1.0.0',
    created: '2025-01-01T00:00:00.000Z',
    modified: '2025-01-01T00:00:00.000Z',
    status: 'draft',
    documentType: 'law',
}

const fullMetadata = {
    ...minimalMetadata,
    title: 'Consumer Credit Rulemap',
    description: 'Determines eligibility for consumer credit.',
    authors: [
        {
            name: 'Jane Doe',
            email: 'jane@example.com',
            organization: 'Acme Legal',
        },
    ],
    organization: 'Bundesministerium der Justiz',
    jurisdiction: 'DE',
    legalDomain: 'DE-BANK',
    tags: ['credit', 'consumer'],
    derivedFrom: {
        originalId: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
        originalHash:
            'sha256:abc0000000000000000000000000000000000000000000000000000000000000',
        originalStatus: 'inForce',
        derivationType: 'amendment',
        derivedAt: '2025-01-01T00:00:00.000Z',
        derivedBy: 'editor@example.com',
    },
    language: 'de',
    validFrom: '2025-01-01T00:00:00.000Z',
    validUntil: '2026-01-01T00:00:00.000Z',
    replaces: '5688f4ec-9e11-4bcc-a2d0-377987bff216',
    replacedBy: '551ff73a-66ce-48ca-b889-84bc63ce864c',
}

describe('MetadataSchema', () => {
    it('accepts a minimal metadata object', () => {
        expect(MetadataSchema.safeParse(minimalMetadata).success).toBe(true)
    })

    it('accepts a fully populated metadata object', () => {
        expect(MetadataSchema.safeParse(fullMetadata).success).toBe(true)
    })

    it.each(['id', 'version', 'created', 'modified', 'status'])(
        'rejects when required field %s is missing',
        (field) => {
            const { [field]: _omit, ...rest } = minimalMetadata as Record<
                string,
                unknown
            >
            expect(MetadataSchema.safeParse(rest).success).toBe(false)
        },
    )

    it('accepts optional title and description', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                title: 'A rulemap',
                description: 'What it does',
            }).success,
        ).toBe(true)
    })

    it('rejects a non-string title', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                title: 42,
            }).success,
        ).toBe(false)
    })

    it('rejects unknown extra properties (strictObject)', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                extraneous: 'nope',
            }).success,
        ).toBe(false)
    })

    it('rejects a non-v4 UUID for id', () => {
        const result = MetadataSchema.safeParse({
            ...minimalMetadata,
            id: 'not-a-uuid',
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual(['id'])
    })

    it('rejects a created timestamp without offset', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                created: '2025-01-01T00:00:00',
            }).success,
        ).toBe(false)
    })

    it('rejects an unknown status value', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                status: 'archived',
            }).success,
        ).toBe(false)
    })

    it.each([
        ['2025-01-01T00:00:00Z', true],
        ['2025-01-01T00:00:00.123+01:00', true],
        ['2025-01-01T00:00Z', false],
        ['2025-02-30T00:00:00Z', false],
    ])('created %s: valid = %s', (created, valid) => {
        expect(
            MetadataSchema.safeParse({ ...minimalMetadata, created }).success,
        ).toBe(valid)
    })

    it('accepts a comment (§3.3.3)', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                status: 'suspended',
                comment: 'Ausgesetzt bis zur Entscheidung des Gerichts',
            }).success,
        ).toBe(true)
    })

    it('accepts documentType documentGeneration, not document-generation', () => {
        const withType = (documentType: string) =>
            MetadataSchema.safeParse({ ...minimalMetadata, documentType })
                .success
        expect(withType('documentGeneration')).toBe(true)
        expect(withType('document-generation')).toBe(false)
    })

    it('rejects an unknown documentType value', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                documentType: 'novel',
            }).success,
        ).toBe(false)
    })

    describe('authors', () => {
        it('accepts an authors array with one entry', () => {
            expect(
                MetadataSchema.safeParse({
                    ...minimalMetadata,
                    authors: [{ name: 'Jane Doe' }],
                }).success,
            ).toBe(true)
        })

        it('rejects an empty authors array', () => {
            const result = MetadataSchema.safeParse({
                ...minimalMetadata,
                authors: [],
            })
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual(['authors'])
        })

        it('rejects an author with an invalid email', () => {
            expect(
                MetadataSchema.safeParse({
                    ...minimalMetadata,
                    authors: [{ name: 'Jane', email: 'not-an-email' }],
                }).success,
            ).toBe(false)
        })
    })

    describe('jurisdiction', () => {
        it.each(['EU', 'DE-BANK', 'DE-BANK-CREDIT'])('accepts %s', (value) => {
            expect(
                MetadataSchema.safeParse({
                    ...minimalMetadata,
                    jurisdiction: value,
                }).success,
            ).toBe(true)
        })

        it.each(['D', 'DE-', '-DE', 'DE BANK', '123', 'us-tax'])(
            'rejects %s',
            (value) => {
                expect(
                    MetadataSchema.safeParse({
                        ...minimalMetadata,
                        jurisdiction: value,
                    }).success,
                ).toBe(false)
            },
        )
    })

    describe('language', () => {
        it.each(['de', 'en', 'fr'])('accepts ISO 639-1 code %s', (value) => {
            expect(
                MetadataSchema.safeParse({
                    ...minimalMetadata,
                    language: value,
                }).success,
            ).toBe(true)
        })

        it.each(['DE', 'eng', 'd', '12'])('rejects %s', (value) => {
            expect(
                MetadataSchema.safeParse({
                    ...minimalMetadata,
                    language: value,
                }).success,
            ).toBe(false)
        })
    })

    it('rejects a non-v4 UUID for replaces', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                replaces: 'not-a-uuid',
            }).success,
        ).toBe(false)
    })

    it('rejects a non-v4 UUID for replacedBy', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                replacedBy: 'not-a-uuid',
            }).success,
        ).toBe(false)
    })

    it('rejects a derivedFrom object missing required fields', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                derivedFrom: {
                    originalId: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
                },
            }).success,
        ).toBe(false)
    })

    it('rejects an invalid validFrom timestamp', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                validFrom: 'yesterday',
            }).success,
        ).toBe(false)
    })

    it('accepts tags as an empty array', () => {
        expect(
            MetadataSchema.safeParse({ ...minimalMetadata, tags: [] }).success,
        ).toBe(true)
    })

    it('rejects tags containing a non-string entry', () => {
        expect(
            MetadataSchema.safeParse({
                ...minimalMetadata,
                tags: ['ok', 42],
            }).success,
        ).toBe(false)
    })
})
