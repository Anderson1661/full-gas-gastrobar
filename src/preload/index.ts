import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel } from '@shared/types/ipc'

type Listener = (...args: unknown[]) => void
// Maps original listener → ipcRenderer wrapper so off() can remove the correct function
const listenerMap = new Map<Listener, Listener>()

const api = {
  invoke: <T = unknown>(channel: IpcChannel, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: Listener) => {
    const wrapper: Listener = (_, ...args) => listener(...args)
    listenerMap.set(listener, wrapper)
    ipcRenderer.on(channel, wrapper as Parameters<typeof ipcRenderer.on>[1])
  },
  off: (channel: string, listener: Listener) => {
    const wrapper = listenerMap.get(listener)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper as Parameters<typeof ipcRenderer.removeListener>[1])
      listenerMap.delete(listener)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
