import type { Database } from 'bun:sqlite'

import type { StoredRoom, StoredRoomMessage, StoredRoomRole, StoredRoomTask } from './types'
import {
  addRoomMessage,
  createRoom,
  createRoomRole,
  createRoomTask,
  clearRoomSessionReferences,
  deleteRoom,
  findRoomRoleByKey,
  replaceRoomSessionReferences,
  getRoom,
  getRoomByNamespace,
  getRoomMessages,
  getRoomRoleByNamespace,
  getRoomRoles,
  getRooms,
  getRoomsByNamespace,
  getRoomTask,
  getRoomTasks,
  touchRoom,
  updateRoomMetadata,
  updateRoomRole,
  updateRoomTask,
} from './rooms'

export class RoomStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  createRoom(metadata: unknown, namespace: string): StoredRoom {
    return createRoom(this.db, metadata, namespace)
  }

  updateRoomMetadata(id: string, metadata: unknown, namespace: string): StoredRoom | null {
    return updateRoomMetadata(this.db, id, metadata, namespace)
  }

  getRoom(id: string): StoredRoom | null {
    return getRoom(this.db, id)
  }

  getRoomByNamespace(id: string, namespace: string): StoredRoom | null {
    return getRoomByNamespace(this.db, id, namespace)
  }

  getRooms(): StoredRoom[] {
    return getRooms(this.db)
  }

  getRoomsByNamespace(namespace: string): StoredRoom[] {
    return getRoomsByNamespace(this.db, namespace)
  }

  deleteRoom(id: string, namespace: string): boolean {
    return deleteRoom(this.db, id, namespace)
  }

  createRoomRole(roomId: string, namespace: string, role: Parameters<typeof createRoomRole>[3]): StoredRoomRole {
    return createRoomRole(this.db, roomId, namespace, role)
  }

  updateRoomRole(roomId: string, roleId: string, namespace: string, patch: Parameters<typeof updateRoomRole>[4]): StoredRoomRole | null {
    return updateRoomRole(this.db, roleId, roomId, namespace, patch)
  }

  getRoomRoles(roomId: string, namespace: string): StoredRoomRole[] {
    return getRoomRoles(this.db, roomId, namespace)
  }

  getRoomRoleByNamespace(id: string, namespace: string): StoredRoomRole | null {
    return getRoomRoleByNamespace(this.db, id, namespace)
  }

  findRoomRoleByKey(roomId: string, key: string, namespace: string): StoredRoomRole | null {
    return findRoomRoleByKey(this.db, roomId, key, namespace)
  }

  replaceRoomSessionReferences(oldSessionId: string, newSessionId: string, namespace: string): void {
  replaceRoomSessionReferences(this.db, oldSessionId, newSessionId, namespace)
  }

  clearRoomSessionReferences(sessionId: string, namespace: string): void {
    clearRoomSessionReferences(this.db, sessionId, namespace)
  }

  createRoomTask(roomId: string, namespace: string, task: Parameters<typeof createRoomTask>[3]): StoredRoomTask {
    return createRoomTask(this.db, roomId, namespace, task)
  }

  updateRoomTask(roomId: string, taskId: string, namespace: string, patch: Parameters<typeof updateRoomTask>[4]): StoredRoomTask | null {
    return updateRoomTask(this.db, roomId, taskId, namespace, patch)
  }

  getRoomTasks(roomId: string, namespace: string): StoredRoomTask[] {
    return getRoomTasks(this.db, roomId, namespace)
  }

  getRoomTask(roomId: string, taskId: string, namespace: string): StoredRoomTask | null {
    return getRoomTask(this.db, roomId, taskId, namespace)
  }

  addRoomMessage(roomId: string, namespace: string, payload: Parameters<typeof addRoomMessage>[3]): StoredRoomMessage {
    return addRoomMessage(this.db, roomId, namespace, payload)
  }

  getRoomMessages(roomId: string, namespace: string, limit?: number, beforeSeq?: number): StoredRoomMessage[] {
    return getRoomMessages(this.db, roomId, namespace, limit, beforeSeq)
  }

  touchRoom(roomId: string, namespace: string, updatedAt?: number): void {
    touchRoom(this.db, roomId, namespace, updatedAt)
  }
}
