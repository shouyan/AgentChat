import { describe, expect, it } from 'bun:test'
import { FeishuRepository } from './repository'

function createRepository(options?: {
    allowOpenIds?: string[]
    envBindings?: Record<string, string>
    defaultNamespace?: string
    storeNamespace?: string | null
}) {
    const store = {
        users: {
            getUser: () => options?.storeNamespace
                ? { namespace: options.storeNamespace }
                : null
        }
    } as any

    return new FeishuRepository(store, {
        allowOpenIds: options?.allowOpenIds ?? [],
        envBindings: options?.envBindings ?? {},
        defaultNamespace: options?.defaultNamespace ?? 'default'
    })
}

describe('FeishuRepository', () => {
    it('falls back to the default namespace when no explicit binding exists', () => {
        const repository = createRepository()

        expect(repository.resolveNamespaceForOpenId('ou_test')).toBe('default')
    })

    it('prefers env bindings over the default namespace', () => {
        const repository = createRepository({
            envBindings: {
                ou_test: 'alice'
            }
        })

        expect(repository.resolveNamespaceForOpenId('ou_test')).toBe('alice')
    })

    it('prefers stored user bindings over the default namespace', () => {
        const repository = createRepository({
            storeNamespace: 'bob'
        })

        expect(repository.resolveNamespaceForOpenId('ou_test')).toBe('bob')
    })
})
