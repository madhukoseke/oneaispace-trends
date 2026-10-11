import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";

const SavesContext = createContext(null);

// Saves are per user and private (row-level security scopes them to the creator).
// Toggling is optimistic and rolls back if the write fails.
export function SavesProvider({ children }) {
  const [saves, setSaves] = useState(new Map());
  const [pending, setPending] = useState(() => new Set());
  const [signedIn, setSignedIn] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await base44.auth.me();
        if (!user) {
          if (!cancelled) setSignedIn(false);
          return;
        }
        if (!cancelled) setSignedIn(true);
        const page = await base44.entities.Save.filter({}, { limit: 500, sort: "-created_date" });
        if (cancelled) return;
        setSaves(new Map((page.items || []).map((save) => [save.item_id, save])));
      } catch (error) {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async (item) => {
    if (!signedIn) return { requiresAuth: true };
    const existing = saves.get(item.id);

    setPending((previous) => new Set(previous).add(item.id));
    setSaves((previous) => {
      const next = new Map(previous);
      if (existing) next.delete(item.id);
      else next.set(item.id, { item_id: item.id });
      return next;
    });

    try {
      if (existing) {
        await base44.entities.Save.delete(existing.id);
      } else {
        const created = await base44.entities.Save.create({
          item_id: item.id,
          item_title: item.title,
          item_url: item.canonical_url,
          item_source: item.source,
          item_format: item.format,
          item_thumbnail_url: item.thumbnail_url || "",
        });
        setSaves((previous) => new Map(previous).set(item.id, created));
      }
      return { ok: true };
    } catch (error) {
      setSaves((previous) => {
        const next = new Map(previous);
        if (existing) next.set(item.id, existing);
        else next.delete(item.id);
        return next;
      });
      return { ok: false, error: String((error && error.message) || error) };
    } finally {
      setPending((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
    }
  }, [saves, signedIn]);

  const value = useMemo(() => ({
    saves,
    signedIn,
    isSaved: (itemId) => saves.has(itemId),
    isPending: (itemId) => pending.has(itemId),
    toggle,
  }), [saves, pending, signedIn, toggle]);

  return <SavesContext.Provider value={value}>{children}</SavesContext.Provider>;
}

export function useSaves() {
  const context = useContext(SavesContext);
  if (!context) throw new Error("useSaves must be used inside SavesProvider");
  return context;
}