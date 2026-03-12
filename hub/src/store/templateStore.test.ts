import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('TemplateStore', () => {
    it('isolates saved templates by namespace', () => {
        const store = new Store(':memory:')

        store.templates.saveTemplate('alpha', 'room', 'alpha_room', { key: 'alpha_room', label: 'Alpha Room', slots: [] })
        store.templates.saveTemplate('beta', 'room', 'beta_room', { key: 'beta_room', label: 'Beta Room', slots: [] })

        const alphaTemplates = store.templates.getSavedTemplates('alpha', 'room')
        const betaTemplates = store.templates.getSavedTemplates('beta', 'room')

        expect(alphaTemplates).toHaveLength(1)
        expect(alphaTemplates[0]?.key).toBe('alpha_room')
        expect(betaTemplates).toHaveLength(1)
        expect(betaTemplates[0]?.key).toBe('beta_room')
    })

    it('stores and clears builtin template overrides', () => {
        const store = new Store(':memory:')

        store.templates.saveBuiltinTemplateOverride('alpha', 'role_slot', 'planner', {
            hidden: true,
            deleted: false,
        })

        const saved = store.templates.getBuiltinTemplateOverrides('alpha', 'role_slot')
        expect(saved).toHaveLength(1)
        expect(saved[0]?.key).toBe('planner')
        expect(saved[0]?.hidden).toBe(true)
        expect(saved[0]?.deleted).toBe(false)

        store.templates.saveBuiltinTemplateOverride('alpha', 'role_slot', 'planner', {
            hidden: false,
            deleted: false,
        })

        expect(store.templates.getBuiltinTemplateOverrides('alpha', 'role_slot')).toHaveLength(0)
    })
})
