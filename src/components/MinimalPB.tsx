"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { MAX_FILE_BYTES } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { formatSlotId } from "@/lib/validation";
import type {
  DownloadResponse,
  PBErrorResponse,
  PBFileView,
  PrepareUploadResponse,
  SlotReadResponse,
  SlotWriteResponse,
} from "@/types/pb";

type Phase = "idle" | "loading" | "dirty" | "saving" | "error";

type State = {
  slotInput: string;
  activeSlot: number;
  hydrated: boolean;
  text: string;
  savedText: string;
  file: PBFileView | null;
  pendingFile: File | null;
  removeFile: boolean;
  phase: Phase;
  message: string;
};

type Action =
  | { type: "slot-input"; value: string }
  | { type: "load-start" }
  | { type: "load-success"; slot: number; text: string; file: PBFileView | null }
  | { type: "edit"; text: string }
  | { type: "file-select"; file: File }
  | { type: "file-cancel" }
  | { type: "file-remove" }
  | { type: "file-restore" }
  | { type: "save-start" }
  | { type: "save-success"; slot: number; text: string; file: PBFileView | null; message: string }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };

const initialState: State = {
  slotInput: "00",
  activeSlot: 0,
  hydrated: false,
  text: "",
  savedText: "",
  file: null,
  pendingFile: null,
  removeFile: false,
  phase: "idle",
  message: "",
};

function draftPhase(state: State, text = state.text): Phase {
  return text !== state.savedText || state.pendingFile !== null || state.removeFile ? "dirty" : "idle";
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "slot-input":
      {
        const slot = parseSlot(action.value);
        if (slot === null || slot === state.activeSlot) {
          return { ...state, slotInput: action.value, message: "" };
        }
        return {
          ...state,
          slotInput: action.value,
          activeSlot: slot,
          hydrated: false,
          text: "",
          savedText: "",
          file: null,
          pendingFile: null,
          removeFile: false,
          phase: "idle",
          message: "",
        };
      }
    case "load-start":
      return { ...state, phase: "loading", message: "" };
    case "load-success":
      return {
        ...state,
        activeSlot: action.slot,
        hydrated: true,
        slotInput: formatSlotId(action.slot),
        text: action.text,
        savedText: action.text,
        file: action.file,
        pendingFile: null,
        removeFile: false,
        phase: "idle",
        message: "",
      };
    case "edit":
      return { ...state, text: action.text, phase: draftPhase(state, action.text), message: "" };
    case "file-select":
      return { ...state, pendingFile: action.file, removeFile: false, phase: "dirty", message: "" };
    case "file-cancel": {
      const next = { ...state, pendingFile: null, removeFile: false, message: "" };
      return { ...next, phase: draftPhase(next) };
    }
    case "file-remove":
      return { ...state, pendingFile: null, removeFile: true, phase: "dirty", message: "" };
    case "file-restore": {
      const next = { ...state, removeFile: false, message: "" };
      return { ...next, phase: draftPhase(next) };
    }
    case "save-start":
      return { ...state, phase: "saving", message: "" };
    case "save-success":
      return {
        ...state,
        activeSlot: action.slot,
        hydrated: true,
        slotInput: formatSlotId(action.slot),
        text: action.text,
        savedText: action.text,
        file: action.file,
        pendingFile: null,
        removeFile: false,
        phase: "idle",
        message: action.message,
      };
    case "notice":
      return { ...state, message: action.message };
    case "error":
      return { ...state, phase: "error", message: action.message };
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
  const slotInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceSlotOnNextDigit = useRef(false);
  const loadEpoch = useRef(0);
  const saveEpoch = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const saveAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(async (requested?: number) => {
    const current = stateRef.current;
    const slot = requested ?? parseSlot(current.slotInput);
    if (slot === null) {
      dispatch({ type: "error", message: "0부터 99 사이의 슬롯 번호를 입력하세요." });
      return;
    }
    if (requested === undefined && current.phase === "dirty" && !window.confirm("저장하지 않은 변경을 버리고 다른 슬롯을 불러올까요?")) {
      return;
    }

    loadAbort.current?.abort();
    saveAbort.current?.abort();
    saveEpoch.current += 1;
    const controller = new AbortController();
    loadAbort.current = controller;
    const epoch = ++loadEpoch.current;
    dispatch({ type: "load-start" });

    try {
      const response = await fetch(`/api/slots/${formatSlotId(slot)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await parseApiResponse<SlotReadResponse>(response);
      if (controller.signal.aborted || epoch !== loadEpoch.current) return;

      const text = data.empty ? "" : data.slot.text;
      const file = data.empty ? null : data.slot.file;
      dispatch({ type: "load-success", slot, text, file });
      window.history.replaceState(null, "", `/?slot=${formatSlotId(slot)}`);
    } catch (cause) {
      if (!controller.signal.aborted && epoch === loadEpoch.current) {
        dispatch({ type: "error", message: messageFrom(cause, "슬롯을 불러오지 못했습니다.") });
      }
    }
  }, []);

  const save = useCallback(async () => {
    const current = stateRef.current;
    const slot = parseSlot(current.slotInput);
    if (slot === null) {
      dispatch({ type: "error", message: "0부터 99 사이의 슬롯 번호를 입력하세요." });
      return;
    }
    if (current.phase === "loading" || current.phase === "saving") return;

    saveAbort.current?.abort();
    loadAbort.current?.abort();
    loadEpoch.current += 1;
    const controller = new AbortController();
    saveAbort.current = controller;
    const epoch = ++saveEpoch.current;
    let capabilityId: string | null = null;
    let committed = false;
    const evictedIds = new Set<number>();
    dispatch({ type: "save-start" });

    try {
      const keepsExistingFile = current.hydrated && current.file !== null && !current.removeFile;
      const hasFinalFile = current.pendingFile !== null || keepsExistingFile;

      if (!current.text.trim() && !hasFinalFile) {
        const response = await fetch(`/api/slots/${formatSlotId(slot)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: controller.signal,
        });
        await parseApiResponse<{ ok: true; cleared: boolean }>(response);
        if (controller.signal.aborted || epoch !== saveEpoch.current) return;
        dispatch({ type: "save-success", slot, text: "", file: null, message: "슬롯을 비웠습니다." });
      } else {
        let fileAction: "keep" | "remove" | "replace" = current.removeFile || !current.hydrated ? "remove" : "keep";

        if (current.pendingFile) {
          const prepared = await prepareFileUpload(slot, current.pendingFile, controller.signal);
          capabilityId = prepared.capabilityId;
          prepared.evictedIds.forEach((id) => evictedIds.add(id));
          await uploadToSignedUrl(prepared.signedUrl, current.pendingFile, controller.signal);
          fileAction = "replace";
        }

        const response = await fetch(`/api/slots/${formatSlotId(slot)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: current.text, fileAction, capabilityId }),
          signal: controller.signal,
        });
        const data = await parseApiResponse<SlotWriteResponse>(response);
        committed = true;
        data.evictedIds.forEach((id) => evictedIds.add(id));
        if (controller.signal.aborted || epoch !== saveEpoch.current) return;

        const evictionNotice = evictedIds.size > 0
          ? ` 저장 공간 확보를 위해 슬롯 ${[...evictedIds].map(formatSlotId).join(", ")}을 정리했습니다.`
          : "";
        dispatch({ type: "save-success", slot, text: data.slot.text, file: data.slot.file, message: `저장했습니다.${evictionNotice}` });
      }
      window.history.replaceState(null, "", `/?slot=${formatSlotId(slot)}`);
    } catch (cause) {
      if (!controller.signal.aborted && epoch === saveEpoch.current) {
        dispatch({ type: "error", message: messageFrom(cause, "저장하지 못했습니다.") });
      }
    } finally {
      if (capabilityId && !committed) await cancelCapability(capabilityId);
    }
  }, []);

  const download = useCallback(async () => {
    const current = stateRef.current;
    if (!current.file || current.removeFile || current.pendingFile) return;

    try {
      dispatch({ type: "notice", message: "다운로드 링크를 만드는 중입니다." });
      const response = await fetch(`/api/slots/${formatSlotId(current.activeSlot)}/download`, { cache: "no-store" });
      const data = await parseApiResponse<DownloadResponse>(response);
      window.location.assign(data.downloadUrl);
      dispatch({ type: "notice", message: "다운로드를 시작했습니다." });
    } catch (cause) {
      dispatch({ type: "error", message: messageFrom(cause, "파일을 열지 못했습니다.") });
    }
  }, []);

  const copyText = useCallback(async () => {
    const current = stateRef.current;
    if (!current.text) {
      dispatch({ type: "notice", message: "복사할 텍스트가 없습니다." });
      return;
    }

    try {
      await navigator.clipboard.writeText(current.text);
      dispatch({ type: "notice", message: "전체 텍스트를 복사했습니다." });
    } catch {
      const editor = editorRef.current;
      if (!editor) {
        dispatch({ type: "error", message: "클립보드에 복사하지 못했습니다." });
        return;
      }
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.focus();
      editor.select();
      const copied = document.execCommand("copy");
      editor.setSelectionRange(start, end);
      dispatch({
        type: copied ? "notice" : "error",
        message: copied ? "전체 텍스트를 복사했습니다." : "클립보드에 복사하지 못했습니다.",
      });
    }
  }, []);

  const changeSlotInput = useCallback((rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, 2);
    const nextSlot = parseSlot(digits);
    const current = stateRef.current;
    if (
      nextSlot !== null
      && nextSlot !== current.activeSlot
      && current.phase === "dirty"
      && !window.confirm("저장하지 않은 내용을 버리고 다른 슬롯으로 이동할까요?")
    ) {
      requestAnimationFrame(() => slotInputRef.current?.select());
      return;
    }
    dispatch({ type: "slot-input", value: digits });
  }, []);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("slot") ?? "00";
    const slot = parseSlot(raw);
    dispatch({ type: "slot-input", value: formatSlotId(slot ?? 0) });

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
  const visibleFile = state.pendingFile ?? (state.removeFile ? null : state.file);

  return (
    <main className={`pb-screen phase-${state.phase}`}>
      <div className="pb-aurora" aria-hidden="true" />
      <section className="pb-glass-card">
        <header className="pb-brand">
          <span>Project PB</span>
          <small>instant pocket · 00—99</small>
        </header>

        <input
          ref={slotInputRef}
          className="pb-slot-number"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="off"
          aria-label="slot number"
          value={state.slotInput}
          disabled={disabled}
          onFocus={(event) => {
            replaceSlotOnNextDigit.current = true;
            event.currentTarget.select();
          }}
          onClick={(event) => {
            replaceSlotOnNextDigit.current = true;
            event.currentTarget.select();
          }}
          onChange={(event) => {
            replaceSlotOnNextDigit.current = false;
            changeSlotInput(event.target.value);
          }}
          onBlur={() => {
            const slot = parseSlot(stateRef.current.slotInput);
            if (slot !== null) dispatch({ type: "slot-input", value: formatSlotId(slot) });
          }}
          onKeyDown={(event) => {
            if (/^\d$/.test(event.key) && replaceSlotOnNextDigit.current) {
              event.preventDefault();
              replaceSlotOnNextDigit.current = false;
              changeSlotInput(event.key);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              void load();
            }
          }}
        />

        <div className="pb-editor-wrap">
          <textarea
            ref={editorRef}
            className="pb-editor"
            value={state.text}
            maxLength={30_000}
            spellCheck={false}
            disabled={disabled}
            aria-label="공유할 텍스트"
            placeholder="이 슬롯에 보낼 텍스트를 입력하세요…"
            onChange={(event) => dispatch({ type: "edit", text: event.target.value })}
          />
          <button
            className="pb-copy-button"
            type="button"
            aria-label="전체 텍스트 복사"
            title="전체 텍스트 복사"
            disabled={disabled || state.text.length === 0}
            onClick={() => void copyText()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="11" height="11" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
          </button>
          <span className="pb-character-count">{state.text.length.toLocaleString()} / 30,000</span>
        </div>

        <div className="pb-filebar">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              if (!file) return;
              if (file.size > MAX_FILE_BYTES) {
                dispatch({ type: "error", message: `파일은 최대 ${formatBytes(MAX_FILE_BYTES)}까지 업로드할 수 있습니다.` });
                return;
              }
              dispatch({ type: "file-select", file });
            }}
          />
          <span className="pb-file-name">
            {state.removeFile
              ? "저장하면 기존 파일이 삭제됩니다"
              : visibleFile
                ? `${visibleFile.name} · ${formatBytes(visibleFile.size)}`
                : `첨부 파일 없음 · 최대 ${formatBytes(MAX_FILE_BYTES)}`}
          </span>
          <div className="pb-file-actions">
            {state.pendingFile ? (
              <button type="button" onClick={() => dispatch({ type: "file-cancel" })} disabled={disabled}>CANCEL</button>
            ) : state.removeFile ? (
              <button type="button" onClick={() => dispatch({ type: "file-restore" })} disabled={disabled}>UNDO</button>
            ) : state.file ? (
              <>
                <button type="button" onClick={() => void download()} disabled={disabled}>DOWNLOAD</button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}>REPLACE</button>
                <button type="button" onClick={() => dispatch({ type: "file-remove" })} disabled={disabled}>REMOVE</button>
              </>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}>ATTACH</button>
            )}
          </div>
        </div>

        <div className="pb-actions">
          <button type="button" onClick={() => void load()} disabled={disabled}>LOAD</button>
          <button type="button" onClick={() => void save()} disabled={disabled}>SAVE</button>
        </div>

        <div className="pb-flow-hint">
          <span className="pb-flow-label">보내기</span>
          <span>번호 선택 → 내용 작성 또는 파일 첨부 → SAVE</span>
          <span className="pb-flow-label">받기</span>
          <span>같은 번호 입력 → LOAD → 복사 또는 다운로드</span>
        </div>

        <span className={`pb-message${state.phase === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
          {state.message || (state.phase === "loading" ? "loading" : state.phase === "saving" ? "saving" : "")}
        </span>
      </section>
    </main>
  );
}

async function prepareFileUpload(slotId: number, file: File, signal: AbortSignal): Promise<PrepareUploadResponse> {
  const response = await fetch("/api/uploads/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slotId,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    }),
    signal,
  });
  return parseApiResponse<PrepareUploadResponse>(response);
}

async function uploadToSignedUrl(signedUrl: string, file: File, signal: AbortSignal): Promise<void> {
  const formData = new FormData();
  const opaqueFile = file.slice(0, file.size, "application/octet-stream");
  formData.append("cacheControl", "3600");
  formData.append("", opaqueFile, "attachment");

  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "x-upsert": "false",
    },
    body: formData,
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`파일 업로드에 실패했습니다. (${response.status})${detail ? ` ${detail}` : ""}`);
  }
}

async function cancelCapability(capabilityId: string): Promise<void> {
  try {
    await fetch("/api/uploads/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilityId }),
      keepalive: true,
    });
  } catch {
    // The database expiry reaper remains the durable fallback.
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as T | PBErrorResponse | null;
  if (!response.ok || !data || (typeof data === "object" && "ok" in data && data.ok === false)) {
    const message = data && typeof data === "object" && "error" in data
      ? (data as PBErrorResponse).error.message
      : `PB request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
