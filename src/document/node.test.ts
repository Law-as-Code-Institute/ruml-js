// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { NodeSchema } from './document'

const minimalNode = {
    id: '415729b7-293c-421d-adde-0bb209a9c9a9',
    operator: 'AND',
    label: 'Credit check',
}

const fullNode = {
    ...minimalNode,
    altText: 'Alt text for screen readers',
    description: 'Detailed description of the node',
    children: ['2', '3'],
    capabilities: [{ id: 'com.example/custom', payload: {} }],
    metadata: { documentType: 'law' },
    decisionMode: 'fallback',
    modular: false,
}

describe('NodeSchema', () => {
    it('accepts a minimal node', () => {
        expect(NodeSchema.safeParse(minimalNode).success).toBe(true)
    })

    it('accepts a fully populated node', () => {
        expect(NodeSchema.safeParse(fullNode).success).toBe(true)
    })

    it('rejects when id is missing', () => {
        const { id: _omit, ...rest } = minimalNode
        expect(NodeSchema.safeParse(rest).success).toBe(false)
    })

    it('rejects a parent node without operator', () => {
        const { operator: _omit, ...rest } = minimalNode
        expect(NodeSchema.safeParse({ ...rest, children: ['2'] }).success).toBe(
            false,
        )
    })

    it('accepts a leaf node without operator', () => {
        const { operator: _omit, ...rest } = minimalNode
        expect(NodeSchema.safeParse(rest).success).toBe(true)
    })

    it('rejects an empty children array — a leaf omits children', () => {
        expect(
            NodeSchema.safeParse({ ...minimalNode, children: [] }).success,
        ).toBe(false)
    })

    it('rejects keyed-object capabilities', () => {
        expect(
            NodeSchema.safeParse({
                ...minimalNode,
                capabilities: { 'ruml:query': { expression: 'true' } },
            }).success,
        ).toBe(false)
    })

    it('rejects empty label', () => {
        expect(
            NodeSchema.safeParse({ ...minimalNode, label: '' }).success,
        ).toBe(false)
    })

    it('rejects lowercase operator (old engine convention)', () => {
        expect(
            NodeSchema.safeParse({ ...minimalNode, operator: 'and' }).success,
        ).toBe(false)
    })

    it('rejects backend lowercase combined operator', () => {
        expect(
            NodeSchema.safeParse({ ...minimalNode, operator: 'nand' }).success,
        ).toBe(false)
    })

    it('accepts undefined operator (draft documents)', () => {
        expect(
            NodeSchema.safeParse({ ...minimalNode, operator: 'undefined' })
                .success,
        ).toBe(true)
    })

    it('rejects description longer than 10000 chars', () => {
        expect(
            NodeSchema.safeParse({
                ...minimalNode,
                description: 'a'.repeat(10_001),
            }).success,
        ).toBe(false)
    })

    it('rejects invalid decisionMode value', () => {
        expect(
            NodeSchema.safeParse({
                ...minimalNode,
                decisionMode: 'unknown',
            }).success,
        ).toBe(false)
    })

    // §4.3: decisionMode on a parent node is ignored, not rejected.
    it('accepts decisionMode on a parent node (children present)', () => {
        expect(
            NodeSchema.safeParse({
                ...minimalNode,
                children: ['2', '3'],
                decisionMode: 'fallback',
            }).success,
        ).toBe(true)
    })
})
