"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { formatSlotId } from "@/lib/validation";
import type { PBErrorResponse, SlotReadResponse, SlotWriteResponse } from "@/types/pb";

type Phase = "idle" | "loading" | "dirty" | "saving" | "error";

type State = {
  slotInput: string;
  activeSlot: number;
  text: string;
  savedText: string;
  hasFile: boolean;
  phase: Phase;
};

type Action =
  | { type: "slot-input"; value: string }
  | { type: "load-start"; slot: number }
  | { type: "load-success"; slot: number; text: string; hasFile: boolean }
  | { type: "edit"; text: string }
  | { type: "save-start" }
  | { type: "save-success"; slot: number; text: string; hasFile: boolean }
  | { type: "error" };

const initialState: State = {
  slotInput: "00",
  activeSlot: 0,
  text: "",
  savedText: "",
  hasFile: false,
  phase: "idle",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "slot-input":
      return { ...state, slotInput: action.value };
    case "load-start":
      return { ...state, activeSlot: action.slot, phase: "loading" };
    case "load-success":
      return {
        ...state,
        activeSlot: action.slot,
        slotInput: formatSlotId(action.slot),
        text: action.text,
        savedText: action.text,
        hasFile: action.hasFile,
        phase: "idle",
      };
    case "edit":
      return { ...state, text: action.text, phase: action.text === state.savedText ? "idle" : "dirty" };
    case "save-start":
      return { ...state, phase: "saving" };
    case "save-success":
      return {
        ...state,
        activeSlot: action.slot,
        slotInput: formatSlotId(action.slot),
        text: action.text,
        savedText: action.text,
        hasFile: action.hasFile,
        phase: "idle",
      };
    case "error":
      return { ...state, phase: "error" };
  }
}

function parseSlot(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const slot = Number(value);
  return slot >= 0 && slot <= 99 ? slot : null;
}

export function MinimalPB() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const loadEpoch = useRef(0);
  const saveEpoch = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const saveAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(async (requested?: number) => {
    const slot = requested ?? parseSlot(stateRef.current.slotInput);
    if (slot === null) {
      dispatch({ type: "error" });
      return;
    }

    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    const epoch = ++loadEpoch.current;
    dispatch({ type: "load-start", slot });

    try {
      const response = await fetch(`/api/slots/${formatSlotId(slot)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await parseApiResponse<SlotReadResponse>(response);
      if (controller.signal.aborted || epoch !== loadEpoch.current) return;

      const text = data.empty ? "" : data.slot.text;
      const hasFile = data.empty ? false : data.slot.file !== null;
      dispatch({ type: "load-success", slot, text, hasFile });
      window.history.replaceState(null, "", `/?slot=${formatSlotId(slot)}`);
    } catch {
      if (!controller.signal.aborted && epoch === loadEpoch.current) dispatch({ type: "error" });
    }
  }, []);

  const save = useCallback(async () => {
    const current = stateRef.current;
    const slot = parseSlot(current.slotInput);
    if (slot === null || current.phase === "saving") {
      dispatch({ type: "error" });
      return;
    }

    saveAbort.current?.abort();
    const controller = new AbortController();
    saveAbort.current = controller;
    const epoch = ++saveEpoch.current;
    dispatch({ type: "save-start" });

    try {
      if (current.text.length === 0 && !current.hasFile) {
        const response = await fetch(`/api/slots/${formatSlotId(slot)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: controller.signal,
        });
        await parseApiResponse<{ ok: true; cleared: boolean }>(response);
        if (controller.signal.aborted || epoch !== saveEpoch.current) return;
        dispatch({ type: "save-success", slot, text: "", hasFile: false });
      } else {
        const response = await fetch(`/api/slots/${formatSlotId(slot)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: current.text, fileAction: "keep", capabilityId: null }),
          signal: controller.signal,
        });
        const data = await parseApiResponse<SlotWriteResponse>(response);
        if (controller.signal.aborted || epoch !== saveEpoch.current) return;
        dispatch({ type: "save-success", slot, text: data.slot.text, hasFile: data.slot.file !== null });
      }
      window.history.replaceState(null, "", `/?slot=${formatSlotId(slot)}`);
    } catch {
      if (!controller.signal.aborted && epoch === saveEpoch.current) dispatch({ type: "error" });
    }
  }, []);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("slot") ?? "00";
    const slot = parseSlot(raw);
    void load(slot ?? 0);

    return () => {
      loadAbort.current?.abort();
      saveAbort.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const disabled = state.phase === "loading" || state.phase === "saving";

  return (
    <main className={`pb-screen phase-${state.phase}`}>
      <div className="pb-aurora" aria-hidden="true" />
      <section className="pb-glass-card">
        <header className="pb-brand">Project<br />PB</header>

        <input
          className="pb-slot-number"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="off"
          aria-label="slot number"
          value={state.slotInput}
          disabled={disabled}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(-2);
            dispatch({ type: "slot-input", value: digits });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void load();
          }}
        />

        <textarea
          className="pb-editor"
          value={state.text}
          maxLength={30_000}
          spellCheck={false}
          disabled={disabled}
          aria-label="text"
          onChange={(event) => dispatch({ type: "edit", text: event.target.value })}
        />

        <div className="pb-actions">
          <button type="button" onClick={() => void load()} disabled={disabled}>LOAD</button>
          <button type="button" onClick={() => void save()} disabled={disabled}>SAVE</button>
        </div>

        <span className="sr-only" role="status" aria-live="polite">
          {state.phase === "loading" ? "loading" : state.phase === "saving" ? "saving" : state.phase === "error" ? "error" : "ready"}
        </span>
      </section>
    </main>
  );
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as T | PBErrorResponse | null;
  if (!response.ok || !data || (typeof data === "object" && "ok" in data && data.ok === false)) {
    throw new Error("PB request failed");
  }
  return data as T;
}
