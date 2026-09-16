"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { syncNow, type SyncResult } from "@/lib/sync"

interface SyncContextValue {
  online: boolean
  syncing: boolean
  /** Bumped after every sync, so screens know to re-read from IndexedDB. */
  version: number
  lastResult: SyncResult | null
  runSync: (opts?: { silent?: boolean }) => Promise<SyncResult | null>
  /** Tell every screen the local data changed. */
  bump: () => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error("useSync must be used inside AppChrome")
  return ctx
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  // Assume online until the browser says otherwise: rendering "offline" on the
  // server and correcting on hydration makes the app look broken on open.
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [version, setVersion] = useState(0)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const inFlight = useRef(false)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const runSync = useCallback(async (opts?: { silent?: boolean }) => {
    // Sync is triggered from several places at once — app open, connection
    // returning, the user tapping. Only one may run.
    if (inFlight.current) return null
    inFlight.current = true
    setSyncing(true)
    try {
      const result = await syncNow()
      if (!opts?.silent) setLastResult(result)
      setVersion((v) => v + 1)
      return result
    } finally {
      inFlight.current = false
      setSyncing(false)
    }
  }, [])

  /* Service worker: what makes the app open with no signal. */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not fatal — the app still works, it just will not open offline.
    })

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "sync-now") runSync({ silent: true })
    }
    navigator.serviceWorker.addEventListener("message", onMessage)
    return () => navigator.serviceWorker.removeEventListener("message", onMessage)
  }, [runSync])

  /* Connection state, and a sync the moment it comes back. */
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()

    const onOnline = () => {
      setOnline(true)
      runSync({ silent: true })
    }
    const onOffline = () => setOnline(false)

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [runSync])

  /* Sync on open, and whenever the app is brought back to the foreground.
   * This is the path that carries iOS, which has no Background Sync. */
  useEffect(() => {
    const trySync = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        runSync({ silent: true })
      }
    }
    trySync()
    document.addEventListener("visibilitychange", trySync)
    return () => document.removeEventListener("visibilitychange", trySync)
  }, [runSync])

  return (
    <SyncContext.Provider value={{ online, syncing, version, lastResult, runSync, bump }}>
      <div
        className="min-h-[100dvh] flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {children}
      </div>
    </SyncContext.Provider>
  )
}
