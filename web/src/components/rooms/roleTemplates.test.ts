import { describe, expect, it } from 'vitest'
import {
  ensureUniqueTemplateKey,
  getAvailableRoleSlotTemplates,
  getBuiltinRoleTemplateState,
  getBuiltinRoomTemplateState,
  getRoomTemplatesForRoomCreator,
  type TemplateCatalog,
} from './roleTemplates'

describe('room template helpers', () => {
  it('generates a unique template key when the base key already exists', () => {
    const key = ensureUniqueTemplateKey('Quick Duo', ['quick_duo', 'quick_duo_2'])
    expect(key).toBe('quick_duo_3')
  })

  it('filters hidden and deleted built-in role templates from available list', () => {
    const catalog: TemplateCatalog = {
      customRoleTemplates: [],
      customRoomTemplates: [],
      builtinRoleTemplateOverrides: [
        { key: 'planner', hidden: true, deleted: false },
        { key: 'coder', hidden: false, deleted: true },
      ],
      builtinRoomTemplateOverrides: [],
    }

    const available = getAvailableRoleSlotTemplates(catalog)
    expect(available.find((template) => template.key === 'planner')).toBeUndefined()
    expect(available.find((template) => template.key === 'coder')).toBeUndefined()
    expect(available.find((template) => template.key === 'reviewer')).toBeDefined()
  })

  it('filters room templates for the room creator using overrides and custom visibility', () => {
    const catalog: TemplateCatalog = {
      customRoleTemplates: [],
      customRoomTemplates: [
        {
          key: 'hidden_custom',
          label: 'Hidden Custom',
          visibleInRoomCreator: false,
          slots: [],
        },
        {
          key: 'shown_custom',
          label: 'Shown Custom',
          visibleInRoomCreator: true,
          slots: [],
        },
      ],
      builtinRoleTemplateOverrides: [],
      builtinRoomTemplateOverrides: [
        { key: 'research_duo', hidden: true, deleted: false },
      ],
    }

    const visibleTemplates = getRoomTemplatesForRoomCreator(catalog)
    expect(visibleTemplates.find((template) => template.key === 'research_duo')).toBeUndefined()
    expect(visibleTemplates.find((template) => template.key === 'hidden_custom')).toBeUndefined()
    expect(visibleTemplates.find((template) => template.key === 'shown_custom')).toBeDefined()
  })

  it('returns default override state when no builtin override exists', () => {
    const catalog: TemplateCatalog = {
      customRoleTemplates: [],
      customRoomTemplates: [],
      builtinRoleTemplateOverrides: [],
      builtinRoomTemplateOverrides: [],
    }

    expect(getBuiltinRoleTemplateState(catalog, 'planner')).toEqual({
      key: 'planner',
      hidden: false,
      deleted: false,
    })
    expect(getBuiltinRoomTemplateState(catalog, 'quick_duo')).toEqual({
      key: 'quick_duo',
      hidden: false,
      deleted: false,
    })
  })
})
