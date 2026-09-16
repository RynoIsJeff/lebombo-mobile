"use client"

import { useMemo, useState } from "react"
import { Search, Check, X, ChevronDown, AlertTriangle } from "lucide-react"
import type { CachedClient } from "@/lib/types"

/**
 * Pick the store from the list the phone cached, or type one that is not on it.
 *
 * Picking from the list is what lets the office raise the invoice without
 * matching anything up by hand, so it is the default path. Typing is still
 * allowed — a new store should never be a reason a technician cannot log the
 * job they just did.
 */
export function StorePicker({
  clients,
  clientId,
  storeName,
  onChange,
}: {
  clients: CachedClient[]
  clientId: string | null
  storeName: string
  onChange: (next: { clientId: string | null; storeName: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients.slice(0, 60)
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || (c.groupName ?? "").toLowerCase().includes(q)
      )
      .slice(0, 60)
  }, [clients, query])

  const select = (client: CachedClient) => {
    onChange({ clientId: client.id, storeName: client.name })
    setOpen(false)
    setQuery("")
  }

  const useTyped = () => {
    const typed = query.trim()
    if (!typed) return
    onChange({ clientId: null, storeName: typed })
    setOpen(false)
    setQuery("")
  }

  if (open) {
    return (
      <div className="fixed inset-0 z-50 bg-paper flex flex-col">
        <div
          className="px-4 pb-3 border-b border-hairline bg-white"
          style={{ paddingTop: "max(14px, env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A8A8A]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stores…"
                className="w-full h-12 pl-9 pr-3 rounded-xl border border-hairline bg-white focus:outline-none focus:border-industrial-blue"
                enterKeyHint="search"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setQuery("")
              }}
              className="h-12 w-12 -mr-2 rounded-xl flex items-center justify-center text-steel-grey active:bg-[#F1EFEA]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {query.trim() && (
            <button
              type="button"
              onClick={useTyped}
              className="w-full flex items-center gap-3 px-5 py-4 border-b border-[#F1EFEA] bg-[#FEF6E0] active:bg-[#FBEFD3] text-left"
            >
              <AlertTriangle className="h-4 w-4 text-[#B45309] shrink-0" />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-charcoal truncate">
                  Use &ldquo;{query.trim()}&rdquo;
                </span>
                <span className="block text-[12.5px] text-[#8A5A08]">
                  Not on the list — the office will link it up
                </span>
              </span>
            </button>
          )}

          {matches.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => select(client)}
              className="w-full flex items-center gap-3 px-5 py-4 border-b border-[#F1EFEA] active:bg-[#FAF9F6] text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-charcoal truncate">{client.name}</span>
                {client.groupName && (
                  <span className="block text-[12.5px] text-steel-grey truncate">
                    {client.groupName}
                  </span>
                )}
              </span>
              {clientId === client.id && (
                <Check className="h-4 w-4 text-industrial-blue shrink-0" />
              )}
            </button>
          ))}

          {matches.length === 0 && !query.trim() && (
            <p className="px-5 py-8 text-center text-[13.5px] text-steel-grey">
              No stores cached yet. Sync where there is signal, or type the name.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="field-label">Customer</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-h-12 px-3.5 py-3 rounded-xl border border-hairline bg-white flex items-center gap-2 text-left active:bg-[#FAF9F6]"
      >
        <span className="min-w-0 flex-1">
          {storeName ? (
            <>
              <span className="block text-[16px] text-charcoal truncate">{storeName}</span>
              {!clientId && (
                <span className="block text-[12px] text-[#B45309]">Not on the store list</span>
              )}
            </>
          ) : (
            <span className="text-[16px] text-[#B4B0A8]">Choose a store</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-steel-grey shrink-0" />
      </button>
    </div>
  )
}
