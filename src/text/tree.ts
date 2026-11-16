// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import type { RumlTextNode } from '../generated/ruml.types'

type Tree = Pick<RumlTextNode, 'type' | 'attrs' | 'content'>

/** Stable per owner and role, e.g. an element's `num` (UUID v8). */
export function derivedGuid(owner: string, role: string): string {
    const bytes = sha256(utf8ToBytes(`${owner}/${role}`)).slice(0, 16)
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
    const hex = bytesToHex(bytes)
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function textOf(node: Tree): string {
    return (node.content ?? [])
        .map((child) => (typeof child === 'string' ? child : textOf(child)))
        .join('')
}
