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
      // A silent sync still records a failure. Most syncs here are automatic,
      // and swallowing their errors is how a phone ends up sitting there
      // sending nothing with no explanation on screen.
      if (!opts?.silent || result.error) setLastResult(result)
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

    // Whether this page is already being served by a worker. If it is, a later
    // change of controller means a NEW version has taken over and the page is
    // still running the old code.
    const hadController = !!navigator.serviceWorker.controller

    let registration: ServiceWorkerRegistration | null = null
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg
      })
      .catch(() => {
        // Not fatal — the app still works, it just will not open offline.
      })

    /**
     * Installed on a home screen, this app can be resumed from the recents list
     * for weeks without ever navigating, so a deployed fix would never reach the
     * phone. Check for a new version whenever it comes to the foreground.
     */
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {})
      }
    }
    checkForUpdate()
    document.addEventListener("visibilitychange", checkForUpdate)

    // A new worker has taken over: the code on screen is stale, so reload once
    // to pick it up. Guarded, because this also fires the first time a worker
    // ever claims the page, when there is nothing stale to replace.
    let reloading = false
    const onControllerChange = () => {
      if (!hadController || reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "sync-now") runSync({ silent: true })
    }
    navigator.serviceWorker.addEventListener("message", onMessage)

    return () => {
      document.removeEventListener("visibilitychange", checkForUpdate)
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
      navigator.serviceWorker.removeEventListener("message", onMessage)
    }
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
