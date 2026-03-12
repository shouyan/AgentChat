import type { Database } from 'bun:sqlite'

import { safeJsonParse } from './json'
import type {
    StoredBuiltinTemplateOverride,
    StoredSavedTemplate,
    TemplateKind,
} from './types'

type DbSavedTemplateRow = {
    id: string
    namespace: string
    kind: TemplateKind
    key: string
    payload: string
    created_at: number
    updated_at: number
}

type DbBuiltinTemplateOverrideRow = {
    id: string
    namespace: string
    kind: TemplateKind
    key: string
    hidden: number
    deleted: number
    updated_at: number
}

function toStoredSavedTemplate(row: DbSavedTemplateRow): StoredSavedTemplate {
    return {
        id: row.id,
        namespace: row.namespace,
        kind: row.kind,
        key: row.key,
        payload: safeJsonParse(row.payload),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function toStoredBuiltinTemplateOverride(row: DbBuiltinTemplateOverrideRow): StoredBuiltinTemplateOverride {
    return {
        id: row.id,
        namespace: row.namespace,
        kind: row.kind,
        key: row.key,
        hidden: row.hidden === 1,
        deleted: row.deleted === 1,
        updatedAt: row.updated_at,
    }
}

function buildSavedTemplateId(namespace: string, kind: TemplateKind, key: string): string {
    return `${namespace}:${kind}:${key}`
}

function buildBuiltinOverrideId(namespace: string, kind: TemplateKind, key: string): string {
    return `${namespace}:${kind}:${key}`
}

export function getSavedTemplates(
    db: Database,
    namespace: string,
    kind: TemplateKind
): StoredSavedTemplate[] {
    const rows = db.prepare(`
        SELECT * FROM saved_templates
        WHERE namespace = ? AND kind = ?
        ORDER BY updated_at DESC, created_at DESC
    `).all(namespace, kind) as DbSavedTemplateRow[]
    return rows.map(toStoredSavedTemplate)
}

export function saveTemplate(
    db: Database,
    namespace: string,
    kind: TemplateKind,
    key: string,
    payload: unknown
): StoredSavedTemplate {
    const now = Date.now()
    const id = buildSavedTemplateId(namespace, kind, key)
    db.prepare(`
        INSERT INTO saved_templates (
            id, namespace, kind, key, payload, created_at, updated_at
        ) VALUES (
            @id, @namespace, @kind, @key, @payload, @created_at, @updated_at
        )
        ON CONFLICT(namespace, kind, key) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
    `).run({
        id,
        namespace,
        kind,
        key,
        payload: JSON.stringify(payload),
        created_at: now,
        updated_at: now,
    })

    const row = db.prepare(`
        SELECT * FROM saved_templates
        WHERE namespace = ? AND kind = ? AND key = ?
        LIMIT 1
    `).get(namespace, kind, key) as DbSavedTemplateRow | undefined
    if (!row) {
        throw new Error('Failed to save template')
    }
    return toStoredSavedTemplate(row)
}

export function deleteTemplate(
    db: Database,
    namespace: string,
    kind: TemplateKind,
    key: string
): boolean {
    const result = db.prepare(`
        DELETE FROM saved_templates
        WHERE namespace = ? AND kind = ? AND key = ?
    `).run(namespace, kind, key)
    return result.changes > 0
}

export function getBuiltinTemplateOverrides(
    db: Database,
    namespace: string,
    kind: TemplateKind
): StoredBuiltinTemplateOverride[] {
    const rows = db.prepare(`
        SELECT * FROM builtin_template_overrides
        WHERE namespace = ? AND kind = ?
        ORDER BY updated_at DESC
    `).all(namespace, kind) as DbBuiltinTemplateOverrideRow[]
    return rows.map(toStoredBuiltinTemplateOverride)
}

export function saveBuiltinTemplateOverride(
    db: Database,
    namespace: string,
    kind: TemplateKind,
    key: string,
    options: {
        hidden: boolean
        deleted: boolean
    }
): StoredBuiltinTemplateOverride | null {
    if (!options.hidden && !options.deleted) {
        db.prepare(`
            DELETE FROM builtin_template_overrides
            WHERE namespace = ? AND kind = ? AND key = ?
        `).run(namespace, kind, key)
        return null
    }

    const now = Date.now()
    const id = buildBuiltinOverrideId(namespace, kind, key)
    db.prepare(`
        INSERT INTO builtin_template_overrides (
            id, namespace, kind, key, hidden, deleted, updated_at
        ) VALUES (
            @id, @namespace, @kind, @key, @hidden, @deleted, @updated_at
        )
        ON CONFLICT(namespace, kind, key) DO UPDATE SET
            hidden = excluded.hidden,
            deleted = excluded.deleted,
            updated_at = excluded.updated_at
    `).run({
        id,
        namespace,
        kind,
        key,
        hidden: options.hidden ? 1 : 0,
        deleted: options.deleted ? 1 : 0,
        updated_at: now,
    })

    const row = db.prepare(`
        SELECT * FROM builtin_template_overrides
        WHERE namespace = ? AND kind = ? AND key = ?
        LIMIT 1
    `).get(namespace, kind, key) as DbBuiltinTemplateOverrideRow | undefined
    if (!row) {
        throw new Error('Failed to save builtin template override')
    }
    return toStoredBuiltinTemplateOverride(row)
}
