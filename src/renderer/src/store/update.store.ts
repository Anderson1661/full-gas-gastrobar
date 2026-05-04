import { create } from 'zustand'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateInfo {
  version:      string
  releaseNotes: string | null
  releaseDate:  string
}

export interface ProgressInfo {
  percent:        number
  bytesPerSecond: number
  transferred:    number
  total:          number
}

interface UpdateState {
  status:     UpdateStatus
  updateInfo: UpdateInfo | null
  progress:   ProgressInfo | null
  error:      string | null
  setStatus:     (status: UpdateStatus)    => void
  setUpdateInfo: (info: UpdateInfo)        => void
  setProgress:   (progress: ProgressInfo) => void
  setError:      (error: string)           => void
  reset:         ()                        => void
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status:     'idle',
  updateInfo: null,
  progress:   null,
  error:      null,
  setStatus:     (status)     => set({ status }),
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setProgress:   (progress)   => set({ progress }),
  setError:      (error)      => set({ error, status: 'error' }),
  reset:         ()           => set({ status: 'idle', updateInfo: null, progress: null, error: null }),
}))
