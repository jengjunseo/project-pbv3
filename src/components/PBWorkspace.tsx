"use client";

import {
  ArrowLeft,
  Check,
  Clipboard,
  Copy,
  Download,
  FilePlus2,
  RefreshCw,
  Save,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RequestEpoch } from "@/lib/client-request-guard";
import { formatBytes, formatUpdatedAt } from "@/lib/format";
import { formatSlotId } from "@/lib/validation";
import type {
  DownloadResponse,
  PBErrorResponse,
  PBSlotView,
  PrepareUploadResponse,
  SlotReadResponse,
  SlotWriteResponse,
} from "@/types/pb";

type WorkspaceState =
  | "loading"
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "load-error"
  | "save-error"
  | "upload-error";

class UploadPhaseError extends Error {}

export function PBWorkspace({ id, maxFileBytes }: { id: number; maxFileBytes: number }) {
  const [slot, setSlot] = useState<PBSlotView | null>(null);
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [state, setState] = useState<WorkspaceState>("loading");
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef(id);
  const textRef = useRef(text);
  const pendingFileRef = useRef<File | null>(pendingFile);
  const removeFileRef = useRef(removeExistingFile);
  const dirtyRef = useRef(false);
  const loadEpochRef = useRef(new RequestEpoch());
  const saveEpochRef = useRef(new RequestEpoch());
  const activeSaveAbortRef = useRef<AbortController | null>(null);
  const saveHandlerRef = useRef<() => void>(() => undefined);

  const existingFile = removeExistingFile ? null : slot?.file ?? null;
  const slotLabel = formatSlotId(id);
  const isDirty = pendingFile !== null || removeExistingFile || text !== (slot?.text ?? "");
  const hasPayload = text.trim().length > 0 || pendingFile !== null || existingFile !== null;
  const canSave = isDirty && hasPayload && state !== "loading" && state !== "saving";

  useEffect(() => { activeIdRef.current = id; }, [id]);
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { pendingFileRef.current = pendingFile; }, [pendingFile]);
  useEffect(() => { removeFileRef.current = removeExistingFile; }, [removeExistingFile]);
  useEffect(() => { dirtyRef.current = isDirty; }, [isDirty]);

  const statusLabel = useMemo(() => {
    if (state === "loading") return "불러오는 중";
    if (state === "saving") return "저장 중";
    if (state === "saved") return "저장 완료";
    if (state === "load-error") return "LOAD ERR";
    if (state === "save-error") return "SAVE ERR";
    if (state === "upload-error") return "UPLOAD ERR";
    if (isDirty) return "저장 안 됨";
    return slot ? "보관 중" : "비어 있음";
  }, [isDirty, slot, state]);

  const loadSlot = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent ?? false;
    const force = options?.force ?? false;
    if (dirtyRef.current && !force) return;

    const requestId = activeIdRef.current;
    const epoch = loadEpochRef.current.begin();
    const controller = new AbortController();
    if (!silent) setIsRefreshing(true);

    try {
      const response = await fetch(`/api/slots/${formatSlotId(requestId)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await parseApiResponse<SlotReadResponse>(response);
      if (!loadEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;

      const next = data.empty ? null : data.slot;
      setSlot(next);
      setText(next?.text ?? "");
      setPendingFile(null);
      setRemoveExistingFile(false);
      setState("idle");
      setMessage(silent ? "" : "최신 내용을 불러왔습니다.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (!loadEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;
      setState("load-error");
      setMessage(messageFrom(cause, "슬롯을 불러오지 못했습니다."));
    } finally {
      if (loadEpochRef.current.isCurrent(epoch) && activeIdRef.current === requestId && !silent) {
        setIsRefreshing(false);
      }
    }

  }, []);

  useEffect(() => {
    activeIdRef.current = id;
    loadEpochRef.current.invalidate();
    saveEpochRef.current.invalidate();
    activeSaveAbortRef.current?.abort();
    setSlot(null);
    setText("");
    setPendingFile(null);
    setRemoveExistingFile(false);
    setMessage("");
    setState("loading");

    const controller = new AbortController();
    const epoch = loadEpochRef.current.begin();
    const requestId = id;

    void (async () => {
      try {
        const response = await fetch(`/api/slots/${formatSlotId(requestId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await parseApiResponse<SlotReadResponse>(response);
        if (!loadEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;
        const next = data.empty ? null : data.slot;
        setSlot(next);
        setText(next?.text ?? "");
        setState("idle");
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (!loadEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;
        setState("load-error");
        setMessage(messageFrom(cause, "슬롯을 불러오지 못했습니다."));
      }
    })();

    return () => {
      controller.abort();
      loadEpochRef.current.invalidate();
      saveEpochRef.current.invalidate();
      activeSaveAbortRef.current?.abort();
    };
  }, [id]);

  useEffect(() => {
    const onFocus = () => {
      if (!dirtyRef.current) void loadSlot({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadSlot]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const save = useCallback(async () => {
    if (state === "saving" || !dirtyRef.current) return;

    const requestId = id;
    const epoch = saveEpochRef.current.begin();
    const controller = new AbortController();
    activeSaveAbortRef.current?.abort();
    activeSaveAbortRef.current = controller;
    setState("saving");
    setMessage("");

    let capabilityId: string | null = null;
    let reservationEvictedIds: number[] = [];

    try {
      const file = pendingFileRef.current;
      let fileAction: "keep" | "remove" | "replace" = removeFileRef.current ? "remove" : "keep";

      if (file) {
        fileAction = "replace";
        const prepared = await apiPost<PrepareUploadResponse>(
          "/api/uploads/prepare",
          { slotId: requestId, name: file.name, size: file.size, type: file.type || "application/octet-stream" },
          controller.signal,
        );
        capabilityId = prepared.capabilityId;
        reservationEvictedIds = prepared.evictedIds;

        if (!saveEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) {
          void cancelCapability(capabilityId);
          return;
        }

        const form = new FormData();
        form.append("cacheControl", "3600");
        form.append("", file);
        const uploadResponse = await fetch(prepared.signedUrl, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: form,
          signal: controller.signal,
        });
        if (!uploadResponse.ok) {
          const detail = await uploadResponse.text().catch(() => "");
          throw new UploadPhaseError(detail || `upload failed (${uploadResponse.status})`);
        }
      }

      const saved = await apiPost<SlotWriteResponse>(
        `/api/slots/${formatSlotId(requestId)}`,
        { text: textRef.current, fileAction, capabilityId },
        controller.signal,
      );
      capabilityId = null;

      if (!saveEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;
      setSlot(saved.slot);
      setText(saved.slot.text);
      setPendingFile(null);
      setRemoveExistingFile(false);
      setState("saved");
      const evictedIds = Array.from(new Set([...reservationEvictedIds, ...saved.evictedIds]));
      setMessage(evictedIds.length
        ? `저장했습니다. 공간 확보를 위해 오래된 슬롯 ${evictedIds.map(formatSlotId).join(", ")}을 정리했습니다.`
        : "저장했습니다.");
      window.setTimeout(() => {
        if (saveEpochRef.current.isCurrent(epoch)) setState("idle");
      }, 1400);
    } catch (cause) {
      if (capabilityId) void cancelCapability(capabilityId);
      if (controller.signal.aborted) return;
      if (!saveEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;
      setState(cause instanceof UploadPhaseError ? "upload-error" : "save-error");
      const baseMessage = messageFrom(cause, cause instanceof UploadPhaseError ? "파일 업로드에 실패했습니다." : "저장하지 못했습니다.");
      setMessage(reservationEvictedIds.length
        ? `${baseMessage} 공간 예약 과정에서 오래된 슬롯 ${reservationEvictedIds.map(formatSlotId).join(", ")}이 정리되었습니다.`
        : baseMessage);
    } finally {
      if (activeSaveAbortRef.current === controller) activeSaveAbortRef.current = null;
    }
  }, [id, state]);

  saveHandlerRef.current = () => { void save(); };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveHandlerRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function clear() {
    if (!window.confirm(`#${slotLabel} 슬롯의 내용을 완전히 비울까요?`)) return;
    const requestId = id;
    const epoch = saveEpochRef.current.begin();
    setState("saving");
    setMessage("");

    try {
      const response = await fetch(`/api/slots/${slotLabel}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await parseApiResponse<{ ok: true; cleared: boolean }>(response);
      if (!saveEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;
      setSlot(null);
      setText("");
      setPendingFile(null);
      setRemoveExistingFile(false);
      setState("idle");
      setMessage("슬롯을 비웠습니다.");
    } catch (cause) {
      if (!saveEpochRef.current.isCurrent(epoch) || activeIdRef.current !== requestId) return;
      setState("save-error");
      setMessage(messageFrom(cause, "슬롯을 비우지 못했습니다."));
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("텍스트를 복사했습니다.");
    } catch {
      setMessage("클립보드에 접근하지 못했습니다.");
    }
  }

  async function shareLink() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `PB #${slotLabel}`, url });
        return;
      } catch {
        // User cancellation falls back to copying only when possible.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("링크를 복사했습니다.");
    } catch {
      setMessage("링크를 복사하지 못했습니다.");
    }
  }

  async function openFile() {
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      const response = await fetch(`/api/slots/${slotLabel}/download`, { cache: "no-store" });
      const data = await parseApiResponse<DownloadResponse>(response);
      if (popup) popup.location.href = data.downloadUrl;
      else window.location.href = data.downloadUrl;
    } catch (cause) {
      popup?.close();
      setState("load-error");
      setMessage(messageFrom(cause, "파일 링크를 만들지 못했습니다."));
    }
  }

  function chooseFile(file: File | null) {
    if (!file) return;
    if (file.size <= 0 || file.size > maxFileBytes) {
      setState("upload-error");
      setMessage(`파일은 1바이트 이상 ${formatBytes(maxFileBytes)} 이하여야 합니다.`);
      return;
    }
    setPendingFile(file);
    setRemoveExistingFile(false);
    setState("dirty");
    setMessage("");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  const disabled = state === "loading" || state === "saving";

  return (
    <main className="slot-shell">
      <header className="slot-topbar">
        <Link href="/" className="icon-link" aria-label="홈으로"><ArrowLeft size={20} /></Link>
        <div className="slot-brand">PB<span>.</span></div>
        <div className={`save-status state-${state}`}><span className="status-dot" />{statusLabel}</div>
      </header>

      <div className="workspace-grid">
        <section className="editor-panel">
          <div className="slot-heading">
            <div><p className="eyebrow">PUBLIC SLOT</p><h1>#{slotLabel}</h1></div>
            <div className="heading-actions">
              <button className="ghost-button" onClick={() => {
                if (dirtyRef.current && !window.confirm("저장하지 않은 변경을 버리고 새로고침할까요?")) return;
                void loadSlot({ force: true });
              }} disabled={isRefreshing || disabled}>
                <RefreshCw size={16} className={isRefreshing ? "spin" : ""} /> 새로고침
              </button>
              <button className="ghost-button" onClick={() => void shareLink()}><Share2 size={16} /> 링크</button>
            </div>
          </div>

          <textarea
            className="pb-textarea"
            value={text}
            maxLength={30_000}
            spellCheck={false}
            disabled={disabled}
            placeholder={state === "loading" ? "불러오는 중…" : "여기에 붙여넣으세요. 다른 기기에서 같은 번호를 열면 그대로 보입니다."}
            onChange={(event) => { setText(event.target.value); setState("dirty"); setMessage(""); }}
            aria-label="슬롯 텍스트"
          />

          <div className="editor-footer">
            <span>{text.length.toLocaleString()} / 30,000</span>
            <button className="text-action" onClick={() => void copyText()} disabled={!text}><Clipboard size={15} /> 텍스트 복사</button>
          </div>
        </section>

        <aside className="side-panel">
          <div className="side-section">
            <div className="section-title-row">
              <div><p className="eyebrow">ATTACHMENT</p><h2>파일</h2></div>
              {(pendingFile || existingFile) && (
                <button className="icon-button subtle" aria-label="첨부 제거" onClick={() => {
                  setPendingFile(null);
                  setRemoveExistingFile(true);
                  setState("dirty");
                  setMessage("");
                }}><X size={17} /></button>
              )}
            </div>

            {pendingFile ? (
              <div className="file-card pending">
                <div className="file-icon"><FilePlus2 size={20} /></div>
                <div className="file-copy"><strong>{pendingFile.name}</strong><span>{formatBytes(pendingFile.size)} · 저장 대기</span></div>
              </div>
            ) : existingFile ? (
              <div className="file-card">
                <div className="file-icon"><Check size={20} /></div>
                <div className="file-copy"><strong>{existingFile.name}</strong><span>{formatBytes(existingFile.size)}</span></div>
                <button className="icon-button" onClick={() => void openFile()} aria-label="파일 열기"><Download size={17} /></button>
              </div>
            ) : (
              <div
                className={`dropzone${dragActive ? " active" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
                }}
              >
                <FilePlus2 size={22} />
                <strong>파일 놓기</strong>
                <span>또는 클릭해서 선택 · 최대 {formatBytes(maxFileBytes)}</span>
              </div>
            )}
            <input ref={fileInputRef} type="file" className="sr-only" onChange={onFileChange} />
          </div>

          <div className="side-section meta-section">
            <p className="eyebrow">RETENTION</p>
            <div className="retention-row"><span className="infinity">∞</span><div><strong>시간 제한 없음</strong><span>공간이 부족할 때 오래된 슬롯부터 정리됩니다.</span></div></div>
          </div>

          {slot && (
            <div className="side-section meta-section">
              <p className="eyebrow">LAST SAVED</p>
              <strong className="date-line">{formatUpdatedAt(slot.updatedAt)}</strong>
              <span className="revision">revision {slot.revision}</span>
            </div>
          )}

          <div className="side-actions">
            <button className="primary-button" onClick={() => void save()} disabled={!canSave}>
              {state === "saving" ? <RefreshCw size={18} className="spin" /> : state === "saved" ? <Check size={18} /> : <Save size={18} />}
              {state === "saving" ? "저장 중" : state === "saved" ? "저장됨" : "저장"}<kbd>⌘S</kbd>
            </button>
            <button className="danger-button" onClick={() => void clear()} disabled={disabled || (!slot && !text && !pendingFile)}>
              <Trash2 size={17} /> 비우기
            </button>
          </div>

          {message && <div className={`message ${state.endsWith("error") ? "error" : ""}`}>{message}</div>}
          <p className="security-note">이 슬롯은 공개 번호입니다. 비밀번호·개인정보·민감한 문서는 저장하지 마세요.</p>
        </aside>
      </div>

      <div className="mobile-savebar">
        <button className="primary-button" onClick={() => void save()} disabled={!canSave}>
          {state === "saving" ? <RefreshCw size={18} className="spin" /> : <Save size={18} />} 저장
        </button>
        <button className="icon-button" onClick={() => void shareLink()} aria-label="링크 공유"><Copy size={18} /></button>
      </div>
    </main>
  );
}

async function apiPost<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return parseApiResponse<T>(response);
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
    // The durable expiration reaper is the final orphan cleanup fallback.
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  let body: T | PBErrorResponse;
  try {
    body = await response.json() as T | PBErrorResponse;
  } catch {
    throw new Error(`서버 응답을 읽지 못했습니다. (${response.status})`);
  }

  if (!response.ok || (typeof body === "object" && body !== null && "ok" in body && body.ok === false)) {
    const errorBody = body as PBErrorResponse;
    throw new Error(errorBody.error?.message || `요청에 실패했습니다. (${response.status})`);
  }
  return body as T;
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
