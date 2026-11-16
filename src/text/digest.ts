// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { sha3_256 } from '@noble/hashes/sha3'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'

/** RFC 8785 (JCS): keys sorted by UTF-16 code units, ECMAScript number and string serialisation. */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    if (value !== null && typeof value === 'object')
        return `{${Object.keys(value)
            // Members without a JSON value are absent, as in JSON.stringify.
            .filter(
                (key) => (value as Record<string, unknown>)[key] !== undefined,
            )
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
            )
            .join(',')}}`
    return JSON.stringify(value)
}

export function textDigest(content: unknown): string {
    return `sha3-256:${bytesToHex(sha3_256(utf8ToBytes(canonicalJson(content))))}`
}
