import type { Database } from 'bun:sqlite'

import type {
    StoredBuiltinTemplateOverride,
    StoredSavedTemplate,
    TemplateKind,
} from './types'
import {
    deleteTemplate,
    getBuiltinTemplateOverrides,
    getSavedTemplates,
    saveBuiltinTemplateOverride,
    saveTemplate,
} from './templates'

export class TemplateStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    getSavedTemplates(namespace: string, kind: TemplateKind): StoredSavedTemplate[] {
        return getSavedTemplates(this.db, namespace, kind)
    }

    saveTemplate(namespace: string, kind: TemplateKind, key: string, payload: unknown): StoredSavedTemplate {
        return saveTemplate(this.db, namespace, kind, key, payload)
    }

    deleteTemplate(namespace: string, kind: TemplateKind, key: string): boolean {
        return deleteTemplate(this.db, namespace, kind, key)
    }

    getBuiltinTemplateOverrides(namespace: string, kind: TemplateKind): StoredBuiltinTemplateOverride[] {
        return getBuiltinTemplateOverrides(this.db, namespace, kind)
    }

    saveBuiltinTemplateOverride(
        namespace: string,
        kind: TemplateKind,
        key: string,
        options: {
            hidden: boolean
            deleted: boolean
        }
    ): StoredBuiltinTemplateOverride | null {
        return saveBuiltinTemplateOverride(this.db, namespace, kind, key, options)
    }
}
