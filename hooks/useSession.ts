"use client";
import { useState, useCallback, useRef } from "react";
import type { DefaultsConfig, ReviewRow, Session } from "@/lib/types";

type Target = "movies" | "series";

interface SessionState {
  target: Target;
  defaults: DefaultsConfig;
  rawInput: string;
  rows: ReviewRow[];
}

interface SessionActions {
  setTarget: (t: Target) => void;
  setDefaults: (d: Partial<DefaultsConfig>) => void;
  setRawInput: (s: string) => void;
  setRows: (rows: ReviewRow[]) => void;
  updateRow: (id: string, patch: Partial<ReviewRow>) => void;
  clearSession: () => void;
}

const DEFAULT_DEFAULTS: DefaultsConfig = {
  qualityProfileId: 0,
  rootFolderPath: "",
  monitored: true,
  minimumAvailability: "released",
  searchOnAdd: true,
  seriesType: "standard",
  seasonFolder: true,
  monitorOption: "all",
};

function localKey(target: Target) {
  return `bulkarr:session:${target}`;
}

function loadLocal(target: Target): Partial<SessionState> {
  try {
    const raw = localStorage.getItem(localKey(target));
    if (raw) return JSON.parse(raw) as Partial<SessionState>;
  } catch {}
  return {};
}

export function useSession(
  serverSession: Session | null | undefined,
  target: Target,
): SessionState & SessionActions {
  const [state, setState] = useState<SessionState>(() => {
    const local = loadLocal(target);
    return {
      target,
      defaults: {
        ...DEFAULT_DEFAULTS,
        ...(serverSession?.defaults ?? {}),
        ...(local.defaults ?? {}),
      },
      rawInput: local.rawInput ?? serverSession?.rawInput ?? "",
      rows: serverSession?.rows ?? [],
    };
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((s: SessionState) => {
    localStorage.setItem(
      localKey(s.target),
      JSON.stringify({ defaults: s.defaults, rawInput: s.rawInput }),
    );
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const session: Session = {
        target: s.target,
        defaults: s.defaults,
        rawInput: s.rawInput,
        rows: s.rows,
        updatedAt: Date.now(),
      };
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, target: s.target }),
      }).catch(() => {});
    }, 800);
  }, []);

  const update = useCallback(
    (patch: Partial<SessionState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setTarget = useCallback((t: Target) => update({ target: t }), [update]);
  const setDefaults = useCallback(
    (d: Partial<DefaultsConfig>) =>
      setState((prev) => {
        const next = { ...prev, defaults: { ...prev.defaults, ...d } };
        persist(next);
        return next;
      }),
    [persist],
  );
  const setRawInput = useCallback(
    (s: string) => update({ rawInput: s }),
    [update],
  );
  const setRows = useCallback(
    (rows: ReviewRow[]) => update({ rows }),
    [update],
  );
  const updateRow = useCallback(
    (id: string, patch: Partial<ReviewRow>) =>
      setState((prev) => {
        const next = {
          ...prev,
          rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        };
        persist(next);
        return next;
      }),
    [persist],
  );
  const clearSession = useCallback(
    () =>
      setState((prev) => {
        const next = { ...prev, rawInput: "", rows: [] };
        persist(next);
        return next;
      }),
    [persist],
  );

  return {
    ...state,
    setTarget,
    setDefaults,
    setRawInput,
    setRows,
    updateRow,
    clearSession,
  };
}
