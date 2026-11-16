// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
export const FORMAT = 'RUML' as const
export const RESULT_FORMAT = 'RUML-Result' as const
export const SPEC_VERSION = '1.0' as const
// §4.12 — legislative lifecycle statuses of a ruml:text-reference entry.
export const LEGISLATIVE_STATUSES = [
    'draft',
    'proposed',
    'enacted',
    'inForce',
    'amended',
    'repealed',
] as const
export type LegislativeStatus = (typeof LEGISLATIVE_STATUSES)[number]
export const EVALUATION_MODE = ['optimized', 'complete'] as const
export const NODE_STATUS = ['true', 'false', 'undefined', 'ignored'] as const
export const IGNORED_REASON = [
    'shortCircuit',
    'manualSkip',
    'conditionalDeactivation',
] as const
export const UNDEFINED_REASON = ['error', 'default'] as const
