// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { RUMLSchema } from './ruml'
import { collectRumlWarnings } from './rules/refinements'

const validDoc = {
    $format: 'RUML',
    $specVersion: '1.0',
    metadata: {
        id: '415729b7-293c-421d-adde-0bb209a9c9a9',
        version: '1.0.0',
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        status: 'review',
    },
    rulemap: {
        nodes: {
            '1': {
                id: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
                label: 'Root',
            },
        },
    },
}

const singleNodeDoc = (
    rootCapabilities: unknown[] | undefined,
    nodeCapabilities: unknown[] | undefined,
) => ({
    ...validDoc,
    ...(rootCapabilities ? { capabilities: rootCapabilities } : {}),
    rulemap: {
        nodes: {
            '1': {
                id: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
                label: 'Root',
                ...(nodeCapabilities ? { capabilities: nodeCapabilities } : {}),
            },
        },
    },
})

// §3.3.3 status rules are enforced by both the schema and a code refinement,
// so one violation can surface twice on the same path.
const issuePaths = (issues: { path: PropertyKey[] }[] = []) => [
    ...new Set(issues.map((issue) => issue.path.map(String).join('.'))),
]

describe('RUMLSchema', () => {
    it('accepts a valid minimal document', () => {
        const result = RUMLSchema.safeParse(validDoc)
        expect(result.success).toBe(true)
    })

    it("accepts documentType 'law' without any text reference (no §3.6 rule in the spec)", () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            metadata: { ...validDoc.metadata, documentType: 'law' },
        })
        expect(result.success).toBe(true)
    })

    it('accepts the §4.3 node-capability example (mixed capability kinds + decisionMode)', () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            capabilities: [
                {
                    id: 'ruml:datapoints',
                    payload: {
                        data: {
                            dp_age: {
                                name: 'Alter',
                                type: 'integer',
                                binding: { type: 'input' },
                            },
                        },
                    },
                },
                { id: 'ruml:query' },
                { id: 'ruml:ai-query' },
                { id: 'ruml:draft/ai-annotations', role: 'data' },
                { id: 'com.acme/reviewed', role: 'data' },
            ],
            rulemap: {
                nodes: {
                    '1': {
                        id: '551ff73a-66ce-48ca-b889-84bc63ce864c',
                        label: 'Antragsteller volljährig',
                        decisionMode: 'fallback',
                        capabilities: [
                            {
                                id: 'ruml:query',
                                payload: { expression: 'dp_age >= 18' },
                            },
                            {
                                id: 'ruml:ai-query',
                                payload: {
                                    model: 'a',
                                    prompt: 'Ist der Antragsteller volljährig?',
                                },
                            },
                            {
                                id: 'ruml:draft/ai-annotations',
                                payload: {
                                    annotations: [
                                        { type: 'confidence', value: 0.92 },
                                    ],
                                },
                            },
                            {
                                id: 'com.acme/reviewed',
                                payload: { reviewed: true },
                            },
                        ],
                    },
                },
            },
        })
        expect(result.success).toBe(true)
    })

    it('accepts a document with a populated capabilities list', () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            capabilities: [
                {
                    id: 'ruml:datapoints',
                    required: true,
                    payload: {
                        data: {
                            dp_income: {
                                name: 'Income',
                                type: 'currency',
                                unit: 'EUR',
                                binding: { type: 'input' },
                            },
                        },
                    },
                },
            ],
        })
        expect(result.success).toBe(true)
    })

    it('rejects id-keyed (pre-list) capabilities', () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            capabilities: { 'ruml:query': {} },
        })
        expect(result.success).toBe(false)
    })

    it('rejects unknown $format literal', () => {
        const result = RUMLSchema.safeParse({ ...validDoc, $format: 'OTHER' })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path[0]).toBe('$format')
    })

    it('rejects unknown $specVersion', () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            $specVersion: '0.2',
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path[0]).toBe('$specVersion')
    })

    it('rejects id of wrong length', () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            metadata: { ...validDoc.metadata, id: 'tooShort' },
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual(['metadata', 'id'])
    })

    it("accepts node operator 'undefined' when status is 'draft'", () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            metadata: { ...validDoc.metadata, status: 'draft' },
            rulemap: {
                nodes: {
                    '1': {
                        id: '415729b7-293c-421d-adde-0bb209a9c9a9',
                        operator: 'undefined',
                        label: 'Root',
                    },
                },
            },
        })
        expect(result.success).toBe(true)
    })

    it("rejects node operator 'undefined' when status is not 'draft'", () => {
        const result = RUMLSchema.safeParse({
            ...validDoc,
            rulemap: {
                nodes: {
                    '1': {
                        id: '415729b7-293c-421d-adde-0bb209a9c9a9',
                        operator: 'undefined',
                        label: 'Root',
                    },
                },
            },
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual([
            'rulemap',
            'nodes',
            '1',
            'operator',
        ])
    })

    describe('operator on a leaf node (NODE-07)', () => {
        const leafWithOperator = (status: string, operator: string) =>
            RUMLSchema.safeParse({
                ...validDoc,
                metadata: { ...validDoc.metadata, status },
                rulemap: {
                    nodes: {
                        '1': { ...validDoc.rulemap.nodes['1'], operator },
                    },
                },
            })

        it.each(['AND', 'NOT_XOR', 'DELEGATED', 'undefined'])(
            'accepts %s on a leaf in a draft',
            (operator) => {
                expect(leafWithOperator('draft', operator).success).toBe(true)
            },
        )

        it.each(['AND', 'NOT_XOR', 'DELEGATED'])(
            'rejects %s on a leaf outside a draft',
            (operator) => {
                const result = leafWithOperator('review', operator)
                expect(result.success).toBe(false)
                if (result.success) return
                expect(result.error.issues[0]?.path).toEqual([
                    'rulemap',
                    'nodes',
                    '1',
                    'operator',
                ])
            },
        )
    })

    describe('nodes referenced more than once (MOD-01)', () => {
        const child = (id: string, extra: Record<string, unknown> = {}) => ({
            id,
            label: 'Child',
            ...extra,
        })
        const twice = (nodes: Record<string, unknown>) =>
            RUMLSchema.safeParse({
                ...validDoc,
                rulemap: {
                    nodes: {
                        '1': {
                            ...validDoc.rulemap.nodes['1'],
                            operator: 'AND',
                            children: ['2', '3'],
                        },
                        ...nodes,
                    },
                },
            })
        const shared = '9f1b6f2e-5d0c-4c47-9a57-2f0b1c7c3e11'
        const parent = {
            id: '5688f4ec-9e11-4bcc-a2d0-377987bff216',
            label: 'Parent',
            operator: 'OR',
            children: ['2'],
        }

        it('accepts a modular node referenced by two parents', () => {
            expect(
                twice({ '2': child(shared, { modular: true }), '3': parent })
                    .success,
            ).toBe(true)
        })

        it.each([[{}], [{ modular: false }]])(
            'rejects a node referenced by two parents with %j',
            (extra) => {
                expect(
                    twice({ '2': child(shared, extra), '3': parent }).success,
                ).toBe(false)
            },
        )

        it('rejects a node listed twice by one parent without modular', () => {
            const doc = (extra: Record<string, unknown>) =>
                twice({
                    '2': child(shared, extra),
                    '3': { ...parent, children: ['2', '2'] },
                })
            expect(doc({}).success).toBe(false)
            expect(doc({ modular: true }).success).toBe(true)
        })

        it('counts a self-reference', () => {
            const recursive = (extra: Record<string, unknown>) =>
                twice({
                    '2': child(shared, { modular: true }),
                    '3': { ...parent, ...extra, children: ['2', '3'] },
                })
            expect(recursive({}).success).toBe(false)
            expect(recursive({ modular: true }).success).toBe(true)
        })
    })

    describe('Capabilities parser obligations', () => {
        it('rejects a node capability id not declared at root (CAP-15)', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(
                    [{ id: 'ruml:datapoints' }],
                    [{ id: 'ruml:query', payload: { expression: 'true' } }],
                ),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path[0]).toBe('rulemap')
        })

        it('accepts a node capability id declared at root (CAP-15)', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(
                    [{ id: 'ruml:datapoints' }],
                    [{ id: 'ruml:datapoints', payload: {} }],
                ),
            )
            expect(result.success).toBe(true)
        })

        it('rejects a node capability entry without payload (CAP-17)', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(
                    [{ id: 'ruml:datapoints' }],
                    [{ id: 'ruml:datapoints' }],
                ),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([
                'rulemap',
                'nodes',
                '1',
                'capabilities',
                0,
                'payload',
            ])
        })

        it('rejects node capabilities when root capabilities is absent (CAP-14)', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(undefined, [
                    { id: 'ruml:datapoints', payload: {} },
                ]),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path[0]).toBe('rulemap')
        })

        it('rejects node capabilities when root capabilities is empty (CAP-14)', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc([], [{ id: 'ruml:datapoints', payload: {} }]),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path[0]).toBe('rulemap')
        })

        it.each([[[]], [undefined]])(
            'rejects an empty node capabilities list when root capabilities is %j (CAP-14)',
            (rootCapabilities) => {
                expect(
                    RUMLSchema.safeParse(singleNodeDoc(rootCapabilities, []))
                        .success,
                ).toBe(false)
            },
        )

        it('rejects a root capability id declared twice (CAP-10)', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(
                    [{ id: 'ruml:query' }, { id: 'ruml:query' }],
                    undefined,
                ),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual(['capabilities'])
        })

        // CAP-06/OP-02: on a node only `data` and `combiner` ids are unique.
        const twiceOnNode = (role: string) =>
            RUMLSchema.safeParse(
                singleNodeDoc(
                    [{ id: 'com.acme/reviewed', role }],
                    [
                        { id: 'com.acme/reviewed', payload: { a: 1 } },
                        { id: 'com.acme/reviewed', payload: { a: 2 } },
                    ],
                ),
            )

        it.each(['data', 'combiner'])(
            'rejects a node capability id of role %s carried twice (CAP-06, OP-02)',
            (role) => {
                const result = twiceOnNode(role)
                expect(result.success).toBe(false)
                if (result.success) return
                expect(result.error.issues[0]?.path).toEqual(['capabilities'])
            },
        )

        it.each(['decision', 'reaction'])(
            'accepts a node capability id of role %s carried twice (CAP-06)',
            (role) => {
                expect(twiceOnNode(role).success).toBe(true)
            },
        )

        it('rejects an official data capability carried twice on a node (CAP-06)', () => {
            const withEntries = (entries: unknown[]) =>
                RUMLSchema.safeParse(
                    singleNodeDoc([{ id: 'ruml:datapoints' }], entries),
                )
            const entry = { id: 'ruml:datapoints', payload: {} }
            expect(withEntries([entry]).success).toBe(true)
            expect(
                withEntries([entry, { ...entry, payload: { a: 1 } }]).success,
            ).toBe(false)
        })

        it('checks every entry of a repeated ruml:query (DP-18)', () => {
            const queries = (second: string) =>
                RUMLSchema.safeParse(
                    singleNodeDoc(
                        [
                            { id: 'ruml:query' },
                            {
                                id: 'ruml:datapoints',
                                payload: {
                                    data: {
                                        dp_x: {
                                            name: 'X',
                                            type: 'integer',
                                            binding: { type: 'input' },
                                        },
                                    },
                                },
                            },
                        ],
                        [
                            {
                                id: 'ruml:query',
                                payload: { expression: 'dp_x > 1' },
                            },
                            {
                                id: 'ruml:query',
                                payload: { expression: second },
                            },
                        ],
                    ),
                )
            expect(queries('dp_x > 2').success).toBe(true)
            expect(queries('dp_missing > 2').success).toBe(false)
        })

        it('rejects a non-official decision capability on a node with children (CAP-07)', () => {
            const doc = singleNodeDoc(
                [{ id: 'com.acme/decides', role: 'decision' }],
                [{ id: 'com.acme/decides', payload: {} }],
            )
            const node = doc.rulemap.nodes['1']
            const withChild = (capabilities: unknown[]) =>
                RUMLSchema.safeParse({
                    ...doc,
                    rulemap: {
                        nodes: {
                            '1': {
                                ...node,
                                operator: 'AND',
                                children: ['2'],
                                capabilities,
                            },
                            '2': {
                                id: '9f1b6f2e-5d0c-4c47-9a57-2f0b1c7c3e11',
                                label: 'Child',
                            },
                        },
                    },
                })
            expect(withChild([]).success).toBe(true)
            expect(withChild(node.capabilities ?? []).success).toBe(false)
        })

        // §4.8/4.9: on a query-less leaf the status is always undefined, so an
        // onTrue/onFalse handler can never fire — a warning, not a failure.
        const action = { onTrue: { operation: 'createDocument', ref: 'svc' } }
        const onUndefinedOnly = {
            onUndefined: { operation: 'sendNotification', ref: 'svc' },
        }

        const leafWithActions = (
            withQuery: boolean,
            actionsValue: object = action,
        ) =>
            singleNodeDoc(
                [
                    { id: 'ruml:actions' },
                    ...(withQuery
                        ? [
                              { id: 'ruml:query' },
                              {
                                  id: 'ruml:datapoints',
                                  payload: {
                                      data: {
                                          dp_x: {
                                              name: 'X',
                                              type: 'integer',
                                              binding: { type: 'input' },
                                          },
                                      },
                                  },
                              },
                          ]
                        : []),
                ],
                [
                    { id: 'ruml:actions', payload: actionsValue },
                    ...(withQuery
                        ? [
                              {
                                  id: 'ruml:query',
                                  payload: { expression: 'dp_x > 1' },
                              },
                          ]
                        : []),
                ],
            )

        it('accepts a leaf node with ruml:actions and ruml:query (no warning)', () => {
            const result = RUMLSchema.safeParse(leafWithActions(true))
            expect(result.success).toBe(true)
            if (!result.success) return
            expect(collectRumlWarnings(result.data)).toEqual([])
        })

        it('warns on a query-less leaf whose onTrue/onFalse can never fire', () => {
            const result = RUMLSchema.safeParse(leafWithActions(false))
            expect(result.success).toBe(true)
            if (!result.success) return

            const warnings = collectRumlWarnings(result.data)
            expect(warnings).toHaveLength(1)
            expect(warnings[0]?.path).toEqual(['rulemap', 'nodes'])
        })

        it('does not warn for an onUndefined-only leaf without a query', () => {
            const result = RUMLSchema.safeParse(
                leafWithActions(false, onUndefinedOnly),
            )
            expect(result.success).toBe(true)
            if (!result.success) return
            expect(collectRumlWarnings(result.data)).toEqual([])
        })

        // §3.8: in a documentType 'law' file every node SHOULD mark the norm it
        // represents with a ruml:text-reference anchor (warning, not a failure).
        const textEntry = {
            title: 'Einkommensteuergesetz',
            uri: '/akn/de/act/2024-01-01/estg',
            timestamp: '2024-01-15T00:00:00Z',
            status: 'inForce',
            type: 'embedded',
            text: 'full text',
        }
        const lawDoc = {
            ...validDoc,
            metadata: { ...validDoc.metadata, documentType: 'law' },
            capabilities: [
                {
                    id: 'ruml:text-reference',
                    payload: { data: { text_estg: textEntry } },
                },
            ],
        }
        const withRepresents = (doc: typeof lawDoc) => ({
            ...doc,
            rulemap: {
                nodes: {
                    '1': {
                        ...doc.rulemap.nodes['1'],
                        capabilities: [
                            {
                                id: 'ruml:text-reference',
                                payload: {
                                    refs: [
                                        { id: 'text_estg', type: 'represents' },
                                    ],
                                },
                            },
                        ],
                    },
                },
            },
        })

        it("warns when a documentType 'law' node represents no norm", () => {
            const result = RUMLSchema.safeParse(lawDoc)
            expect(result.success).toBe(true)
            if (!result.success) return
            const warnings = collectRumlWarnings(result.data)
            expect(warnings).toHaveLength(1)
            expect(warnings[0]?.path).toEqual(['rulemap', 'nodes'])
        })

        it('does not warn when every node represents a norm', () => {
            const result = RUMLSchema.safeParse(withRepresents(lawDoc))
            expect(result.success).toBe(true)
            if (!result.success) return
            expect(collectRumlWarnings(result.data)).toEqual([])
        })

        it("does not warn about represents when documentType is not 'law'", () => {
            const result = RUMLSchema.safeParse({
                ...lawDoc,
                metadata: { ...validDoc.metadata, documentType: 'guideline' },
            })
            expect(result.success).toBe(true)
            if (!result.success) return
            expect(collectRumlWarnings(result.data)).toEqual([])
        })

        it('accepts a parent node with ruml:actions standing alone', () => {
            const result = RUMLSchema.safeParse({
                ...validDoc,
                capabilities: [{ id: 'ruml:actions' }],
                rulemap: {
                    nodes: {
                        '1': {
                            id: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
                            operator: 'AND',
                            label: 'Root',
                            children: ['2'],
                            capabilities: [
                                { id: 'ruml:actions', payload: action },
                            ],
                        },
                        '2': {
                            id: '5688f4ec-9e11-4bcc-a2d0-377987bff216',
                            label: 'Child',
                        },
                    },
                },
            })
            expect(result.success).toBe(true)
        })

        // §4.11: a node's ruml:context refs must resolve to root ruml:context data keys.
        const contextObject = {
            title: 'Kreditvergaberichtlinien',
            category: 'administrativeGuidance',
            type: 'url',
            url: 'https://intern.bank.de/richtlinien.pdf',
            timestamp: '2024-01-01T00:00:00Z',
        }
        const withContextRefs = (refs: string[]) =>
            singleNodeDoc(
                [
                    {
                        id: 'ruml:context',
                        payload: { data: { ctx_guidance: contextObject } },
                    },
                ],
                [{ id: 'ruml:context', payload: { refs } }],
            )

        it('accepts refs that resolve to root ruml:context data', () => {
            expect(
                RUMLSchema.safeParse(withContextRefs(['ctx_guidance'])).success,
            ).toBe(true)
        })

        it('rejects a refs entry that does not resolve to root data', () => {
            const result = RUMLSchema.safeParse(
                withContextRefs(['ctx_missing']),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path[0]).toBe('rulemap')
        })
    })

    describe('ruml:protocol (§4.13)', () => {
        it('accepts a root declaration with a config level', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(
                    [
                        {
                            id: 'ruml:protocol',
                            required: true,
                            payload: { config: { level: 'verbose' } },
                        },
                    ],
                    undefined,
                ),
            )
            expect(result.success).toBe(true)
        })

        it('rejects an unknown config level', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(
                    [
                        {
                            id: 'ruml:protocol',
                            payload: { config: { level: 'debug' } },
                        },
                    ],
                    undefined,
                ),
            )
            expect(result.success).toBe(false)
        })

        it('rejects ruml:protocol on a node (CAP-18)', () => {
            const result = RUMLSchema.safeParse(
                singleNodeDoc(
                    [{ id: 'ruml:protocol' }],
                    [{ id: 'ruml:protocol', payload: {} }],
                ),
            )
            expect(result.success).toBe(false)
        })
    })

    // §4.7.4 / DP-16: an object datapoint must instantiate a declared set.
    describe('ruml:datapoints sets (DP-16)', () => {
        const address = {
            name: 'Adresse',
            fields: {
                dp_street: {
                    name: 'Straße',
                    type: 'string',
                    binding: { type: 'input' },
                },
            },
        }
        const withObjectDatapoint = (set: string) =>
            singleNodeDoc(
                [
                    {
                        id: 'ruml:datapoints',
                        payload: {
                            sets: { set_address: address },
                            data: {
                                dp_home: {
                                    name: 'Wohnadresse',
                                    type: 'object',
                                    set,
                                    binding: { type: 'input' },
                                },
                            },
                        },
                    },
                ],
                undefined,
            )

        it('accepts an object datapoint whose set resolves', () => {
            expect(
                RUMLSchema.safeParse(withObjectDatapoint('set_address'))
                    .success,
            ).toBe(true)
        })

        it('rejects an object datapoint whose set does not resolve', () => {
            const result = RUMLSchema.safeParse(
                withObjectDatapoint('set_missing'),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual(['capabilities'])
        })
    })

    // §4.12: a node's ruml:text-reference refs must resolve (by id) to root ruml:text-reference data keys.
    describe('ruml:text-reference refs referential integrity (§4.12)', () => {
        const textObject = {
            title: '§ 823 BGB',
            uri: 'https://www.gesetze-im-internet.de/bgb/__823.html',
            timestamp: '2024-01-01T00:00:00Z',
            status: 'inForce',
            type: 'embedded',
            text: 'Wer vorsätzlich oder fahrlässig...',
            language: 'de',
        }
        const withTextRefs = (refs: { id: string; element?: string }[]) =>
            singleNodeDoc(
                [
                    {
                        id: 'ruml:text-reference',
                        payload: { data: { text_bgb_823: textObject } },
                    },
                ],
                [
                    {
                        id: 'ruml:text-reference',
                        payload: {
                            refs: refs.map((ref) => ({
                                ...ref,
                                type: 'refers-to',
                            })),
                        },
                    },
                ],
            )

        it('accepts refs that resolve to root ruml:text-reference data', () => {
            expect(
                RUMLSchema.safeParse(
                    withTextRefs([
                        { id: 'text_bgb_823' },
                        {
                            id: 'text_bgb_823',
                            element: '4c1f0a52-8f7e-4b4a-9d0e-2a6b3c8e1f10',
                        },
                    ]),
                ).success,
            ).toBe(true)
        })

        it('rejects a refs entry that does not resolve to root data', () => {
            const result = RUMLSchema.safeParse(
                withTextRefs([{ id: 'text_missing' }]),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path[0]).toBe('rulemap')
        })
    })

    // §4.8 (ruml:query) and §4.9 (ruml:ai-query) both extend Leaf-Nodes: a node
    // carrying either decision capability MUST NOT have non-empty children.
    describe('decision capability leaf constraint (§4.8, §4.9)', () => {
        const rootCapabilities = [
            {
                id: 'ruml:datapoints',
                payload: {
                    data: {
                        dp_age: {
                            name: 'Alter',
                            type: 'integer',
                            binding: { type: 'input' },
                        },
                    },
                },
            },
            { id: 'ruml:query' },
            { id: 'ruml:ai-query' },
        ]
        const decisionDoc = (
            nodeCapabilities: unknown[],
            nodeOverrides: Record<string, unknown>,
        ) => ({
            ...validDoc,
            capabilities: rootCapabilities,
            rulemap: {
                nodes: {
                    '1': {
                        id: '415729b7-293c-421d-adde-0bb209a9c9a9',
                        label: 'Einkommen ausreichend',
                        capabilities: nodeCapabilities,
                        ...nodeOverrides,
                    },
                },
            },
        })

        const cases = {
            'ruml:query': [
                { id: 'ruml:query', payload: { expression: 'dp_age >= 18' } },
            ],
            'ruml:ai-query': [{ id: 'ruml:ai-query', payload: { model: 'a' } }],
        }

        describe.each(Object.entries(cases))(
            '%s node',
            (_id, nodeCapabilities) => {
                it('accepts no children', () => {
                    expect(
                        RUMLSchema.safeParse(decisionDoc(nodeCapabilities, {}))
                            .success,
                    ).toBe(true)
                })

                it('rejects an empty children array', () => {
                    expect(
                        RUMLSchema.safeParse(
                            decisionDoc(nodeCapabilities, { children: [] }),
                        ).success,
                    ).toBe(false)
                })

                it('rejects a non-empty children array', () => {
                    const result = RUMLSchema.safeParse(
                        decisionDoc(nodeCapabilities, {
                            operator: 'AND',
                            children: ['2'],
                        }),
                    )
                    expect(result.success).toBe(false)
                    if (result.success) return
                    expect(result.error.issues[0]?.path).toEqual([
                        'rulemap',
                        'nodes',
                        '1',
                        'children',
                    ])
                })
            },
        )
    })

    describe('ruml:query datapoint referential integrity (DP-18)', () => {
        const income = {
            name: 'Jahreseinkommen',
            type: 'currency',
            unit: 'EUR',
            binding: { type: 'input' },
        }
        const datapoints = { dp_annual_income: income, income }

        const queryDoc = (expression: string) => ({
            ...validDoc,
            capabilities: [
                { id: 'ruml:datapoints', payload: { data: datapoints } },
                { id: 'ruml:query' },
            ],
            rulemap: {
                nodes: {
                    '1': {
                        id: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
                        operator: 'AND',
                        label: 'Root',
                        children: ['2'],
                    },
                    '2': {
                        id: '415729b7-293c-421d-adde-0bb209a9c9a9',
                        label: 'Einkommen ausreichend',
                        capabilities: [
                            { id: 'ruml:query', payload: { expression } },
                        ],
                    },
                },
            },
        })

        it('accepts a query referencing a declared datapoint', () => {
            const result = RUMLSchema.safeParse(
                queryDoc('dp_annual_income > 50000'),
            )
            expect(result.success).toBe(true)
        })

        it('accepts a backtick-quoted reference to a declared datapoint', () => {
            const result = RUMLSchema.safeParse(
                queryDoc('`dp_annual_income` > 50000'),
            )
            expect(result.success).toBe(true)
        })

        it('rejects a query referencing an undeclared datapoint', () => {
            const result = RUMLSchema.safeParse(
                queryDoc('dp_unknown_score >= 600'),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues).toMatchObject([
                {
                    path: [
                        'rulemap',
                        'nodes',
                        '2',
                        'capabilities',
                        0,
                        'payload',
                        'expression',
                    ],
                    message:
                        'the expression reads a datapoint not declared in ruml:datapoints: dp_unknown_score',
                },
            ])
        })

        it('accepts a reference to an id without the dp_ prefix', () => {
            expect(
                RUMLSchema.safeParse(queryDoc('income > 50000')).success,
            ).toBe(true)
        })

        it.each(['salary > 50000', 'Income > 1', 'dp_Mixed_Id > 1'])(
            'rejects an undeclared reference: %s',
            (expression) => {
                const result = RUMLSchema.safeParse(queryDoc(expression))
                expect(result.success).toBe(false)
                if (result.success) return
                expect(result.error.issues[0]?.path.at(-1)).toBe('expression')
            },
        )

        it.each([
            'income > 1 and "unknown" = "unknown"',
            '( $limit := 3; income > $limit )',
            'income.amount > 1',
        ])('does not take %s for an undeclared reference', (expression) => {
            expect(RUMLSchema.safeParse(queryDoc(expression)).success).toBe(
                true,
            )
        })
    })

    describe('DELEGATED nodes and combiners (§3.6.4)', () => {
        const expression = (text: string) => ({
            id: 'ruml:expression',
            payload: { expression: text, description: 'Zwei von drei' },
        })
        const custom = (payload: object = { description: 'Erstes Kind' }) => ({
            id: 'com.acme/combiner',
            payload,
        })
        const delegatedDoc = (
            nodeCapabilities: unknown[],
            node: Record<string, unknown> = {},
        ) => ({
            ...validDoc,
            capabilities: [
                {
                    id: 'ruml:datapoints',
                    payload: {
                        data: {
                            age: {
                                name: 'Alter',
                                type: 'integer',
                                binding: { type: 'input' },
                            },
                        },
                    },
                },
                { id: 'ruml:expression', required: true },
                { id: 'com.acme/combiner', role: 'combiner' },
                { id: 'com.acme/note', role: 'data' },
            ],
            rulemap: {
                nodes: {
                    '1': {
                        id: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
                        operator: 'DELEGATED',
                        label: 'Root',
                        children: ['2'],
                        capabilities: nodeCapabilities,
                        ...node,
                    },
                    '2': {
                        id: '415729b7-293c-421d-adde-0bb209a9c9a9',
                        label: 'Child',
                    },
                },
            },
        })
        const accepts = (...args: Parameters<typeof delegatedDoc>) =>
            RUMLSchema.safeParse(delegatedDoc(...args)).success
        const count = '$count($children[status = "true"]) >= 1'

        it('accepts ruml:expression as the combiner', () => {
            expect(accepts([expression(count)])).toBe(true)
        })

        it('accepts a non-official capability declared as combiner (OP-06)', () => {
            expect(accepts([custom()])).toBe(true)
        })

        it('rejects a capability of another role in place of the combiner (OP-02)', () => {
            expect(
                accepts([
                    { id: 'com.acme/note', payload: { description: 'x' } },
                ]),
            ).toBe(false)
        })

        it('rejects two combiners on one node (OP-02)', () => {
            expect(accepts([expression(count), custom()])).toBe(false)
        })

        it('rejects a combiner on a node with another operator (CAP-08)', () => {
            expect(accepts([custom()], { operator: 'AND' })).toBe(false)
        })

        it('rejects a combiner on a leaf without operator (CAP-08)', () => {
            const doc = delegatedDoc([custom()])
            const withLeaf = (capabilities: unknown[]) =>
                RUMLSchema.safeParse({
                    ...doc,
                    rulemap: {
                        nodes: {
                            ...doc.rulemap.nodes,
                            '2': { ...doc.rulemap.nodes['2'], capabilities },
                        },
                    },
                }).success
            expect(withLeaf([{ id: 'com.acme/note', payload: { a: 1 } }])).toBe(
                true,
            )
            expect(withLeaf([custom()])).toBe(false)
        })

        it.each([[{}], [{ description: '' }], [{ description: ' ' }]])(
            'rejects a non-official combiner with payload %j (OP-04)',
            (payload) => {
                expect(accepts([custom(payload)])).toBe(false)
            },
        )

        it('checks the datapoints a ruml:expression reads (DP-18)', () => {
            expect(accepts([expression(`age >= 65 or ${count}`)])).toBe(true)
            expect(accepts([expression(`height >= 65 or ${count}`)])).toBe(
                false,
            )
        })
    })

    // §4.9: every id in a node's ruml:ai-query inputs (context / dataPoints /
    // texts) must resolve to a key declared in the corresponding root capability.
    describe('ruml:ai-query input referential integrity', () => {
        const context = {
            title: 'Kreditvergaberichtlinien',
            category: 'administrativeGuidance',
            type: 'embedded',
            timestamp: '2024-01-01T00:00:00Z',
        }
        const datapoint = {
            name: 'Jahreseinkommen',
            type: 'currency',
            unit: 'EUR',
            binding: { type: 'input' },
        }
        const text = {
            title: '§ 823 BGB',
            uri: 'https://www.gesetze-im-internet.de/bgb/__823.html',
            timestamp: '2024-01-01T00:00:00Z',
            status: 'inForce',
            type: 'embedded',
            text: 'Wer vorsätzlich...',
            validFrom: '2002-01-01T00:00:00Z',
            language: 'de',
        }

        const aiQueryDoc = (inputs: Record<string, unknown>) =>
            singleNodeDoc(
                [
                    { id: 'ruml:ai-query' },
                    {
                        id: 'ruml:context',
                        payload: { data: { ctx_guidance: context } },
                    },
                    {
                        id: 'ruml:datapoints',
                        payload: { data: { dp_income: datapoint } },
                    },
                    {
                        id: 'ruml:text-reference',
                        payload: { data: { text_bgb_823: text } },
                    },
                ],
                [{ id: 'ruml:ai-query', payload: { model: 'a', inputs } }],
            )

        it('accepts inputs whose ids all resolve to root data', () => {
            const result = RUMLSchema.safeParse(
                aiQueryDoc({
                    context: [{ id: 'ctx_guidance', role: 'reference' }],
                    dataPoints: ['dp_income'],
                    texts: ['text_bgb_823'],
                }),
            )
            expect(result.success).toBe(true)
        })

        it('resolves a string-shorthand context id like the object form', () => {
            const result = RUMLSchema.safeParse(
                aiQueryDoc({ context: ['ctx_guidance'] }),
            )
            expect(result.success).toBe(true)
        })

        it('rejects an undeclared context id', () => {
            const result = RUMLSchema.safeParse(
                aiQueryDoc({ context: ['ctx_missing'] }),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual(['rulemap', 'nodes'])
        })

        it('rejects an undeclared dataPoint id', () => {
            const result = RUMLSchema.safeParse(
                aiQueryDoc({ dataPoints: ['dp_missing'] }),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual(['rulemap', 'nodes'])
        })

        it('rejects an undeclared text id', () => {
            const result = RUMLSchema.safeParse(
                aiQueryDoc({ texts: ['text_missing'] }),
            )
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual(['rulemap', 'nodes'])
        })
    })

    describe('Metadata integrity §3.3.3', () => {
        it('rejects when created is after modified', () => {
            const rumlDoc = {
                ...validDoc,
                metadata: {
                    ...validDoc.metadata,
                    created: '2024-01-03T00:00:00Z',
                    modified: '2024-01-02T00:00:00Z',
                },
            }
            const result = RUMLSchema.safeParse(rumlDoc)
            expect(result.success).toBe(false)
            expect(result.error?.issues).toHaveLength(1)
            expect(result.error?.issues[0]?.path).toEqual([
                'metadata',
                'modified',
            ])
        })

        it('rejects when validFrom is after validUntil', () => {
            const rumlDoc = {
                ...validDoc,
                metadata: {
                    ...validDoc.metadata,
                    validFrom: '2024-01-03T00:00:00Z',
                    validUntil: '2024-01-02T00:00:00Z',
                },
            }
            const result = RUMLSchema.safeParse(rumlDoc)
            expect(result.success).toBe(false)
            expect(result.error?.issues).toHaveLength(1)
            expect(result.error?.issues[0]?.path).toEqual([
                'metadata',
                'validUntil',
            ])
        })

        it('rejects when a forced document has no valid from', () => {
            const rumlDoc = {
                ...validDoc,
                metadata: {
                    ...validDoc.metadata,
                    status: 'inForce',
                },
            }
            const result = RUMLSchema.safeParse(rumlDoc)
            expect(result.success).toBe(false)
            expect(issuePaths(result.error?.issues)).toEqual([
                'metadata.validFrom',
            ])
        })

        it('rejects when an expired document has no valid until', () => {
            const rumlDoc = {
                ...validDoc,
                metadata: {
                    ...validDoc.metadata,
                    status: 'expired',
                },
            }
            const result = RUMLSchema.safeParse(rumlDoc)
            expect(result.success).toBe(false)
            expect(issuePaths(result.error?.issues)).toEqual([
                'metadata.validUntil',
            ])
        })

        it('rejects when a replaced document has no replacedBy', () => {
            const rumlDoc = {
                ...validDoc,
                metadata: {
                    ...validDoc.metadata,
                    status: 'replaced',
                },
            }
            const result = RUMLSchema.safeParse(rumlDoc)
            expect(result.success).toBe(false)
            expect(issuePaths(result.error?.issues)).toEqual([
                'metadata.replacedBy',
            ])
        })
    })
})
