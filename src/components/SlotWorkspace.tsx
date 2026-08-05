"use client";

import { upload } from "@vercel/blob/client";
import { ArrowLeft, Check, Clipboard, Copy, Download, FilePlus2, RefreshCw, Save, Share2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeBlobPath } from "@/lib/blob-path";
import { formatBytes, formatUpdatedAt } from "@/lib/format";
import type { PBFileMeta, PBSlot, SlotReadResponse, SlotWriteResponse } from "@/types/pb";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function SlotWorkspace({ id, initialSlot, maxFileBytes }: { id: number; initialSlot: PBSlot | null; maxFileBytes: number }) {
  const [slot, setSlot] = useState<PBSlot | null>(initialSlot);
  const [text, setText] = useState(initialSlot?.text ?? "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef(text);
  const pendingFileRef = useRef<File | null>(pendingFile);

  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { pendingFileRef.current = pendingFile; }, [pendingFile]);

  const existingFile = removeExistingFile ? null : slot?.file ?? null;
  const slotLabel = String(id).padStart(2, "0");
  const isDirty = state === "dirty" || pendingFile !== null || removeExistingFile || text !== (slot?.text ?? "");

  const statusLabel = useMemo(() => {
    if (state === "saving") return "저장 중";
    if (state === "saved") return "저장 완료";
    if (state === "error") return "오류";
    if (isDirty) return "저장 안 됨";
    return slot ? "보관 중" : "비어 있음";
  }, [state, isDirty, slot]);

  const markDirty = useCallback(() => { setState("dirty"); setMessage(""); }, []);

  const refresh = useCallback(async (silent = false) => {
    if (isDirty && silent) return;
    if (!silent) setIsRefreshing(true);
    try {
      const response = await fetch(`/api/slot?id=${id}`, { cache: "no-store" });
      const data = (await response.json()) as SlotReadResponse | { ok: false; error: { message: string } };
      if (!response.ok || !data.ok) throw new Error("error" in data ? data.error.message : "새로고침 실패");
      const next = data.empty ? null : data.slot;
      setSlot(next); setText(next?.text ?? ""); setPendingFile(null); setRemoveExistingFile(false); setState("idle");
      if (!silent) setMessage("최신 내용을 불러왔습니다.");
    } catch (cause) {
      if (!silent) setMessage(cause instanceof Error ? cause.message : "새로고침에 실패했습니다.");
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, [id, isDirty]);

  useEffect(() => {
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const save = useCallback(async () => {
    if (state === "saving") return;
    setState("saving"); setMessage("");
    let uploaded: PBFileMeta | null = existingFile;
    let orphanPath: string | null = null;
    try {
      const file = pendingFileRef.current;
      if (file) {
        const pathname = makeBlobPath(id, file.name);
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          clientPayload: JSON.stringify({ slotId: id, name: file.name, size: file.size, type: file.type || "application/octet-stream" }),
        });
        orphanPath = blob.pathname;
        uploaded = { url: blob.url, pathname: blob.pathname, name: file.name, size: file.size, type: file.type || "application/octet-stream", uploadedAt: Date.now() };
      }

      const response = await fetch("/api/slot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, text: textRef.current, file: uploaded }) });
      const data = (await response.json()) as SlotWriteResponse | { ok: false; error: { message: string } };
      if (!response.ok || !data.ok) throw new Error("error" in data ? data.error.message : "저장하지 못했습니다.");
      orphanPath = null;
      setSlot(data.slot); setText(data.slot.text); setPendingFile(null); setRemoveExistingFile(false); setState("saved");
      setMessage(data.evictedIds.length ? `저장했습니다. 공간 확보를 위해 오래된 슬롯 ${data.evictedIds.join(", ")}을 정리했습니다.` : "저장했습니다.");
      window.setTimeout(() => setState((current) => current === "saved" ? "idle" : current), 1400);
    } catch (cause) {
      setState("error"); setMessage(cause instanceof Error ? cause.message : "저장하지 못했습니다.");
      if (orphanPath) void fetch("/api/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotId: id, pathname: orphanPath }) });
    }
  }, [existingFile, id, state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  async function clear() {
    if (!window.confirm(`#${slotLabel} 슬롯의 내용을 완전히 비울까요?`)) return;
    setMessage("");
    const response = await fetch(`/api/slot?id=${id}`, { method: "DELETE" });
    const data = (await response.json()) as { ok: boolean; error?: { message: string } };
    if (!response.ok || !data.ok) { setState("error"); setMessage(data.error?.message ?? "비우지 못했습니다."); return; }
    setSlot(null); setText(""); setPendingFile(null); setRemoveExistingFile(false); setState("idle"); setMessage("슬롯을 비웠습니다.");
  }

  async function copyText() {
    try { await navigator.clipboard.writeText(text); setMessage("텍스트를 복사했습니다."); } catch { setMessage("클립보드에 접근하지 못했습니다."); }
  }

  async function shareLink() {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: `PB #${slotLabel}`, url }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(url); setMessage("링크를 복사했습니다."); } catch { setMessage("링크를 복사하지 못했습니다."); }
  }

  function chooseFile(file: File | null) {
    if (!file) return;
    if (file.size > maxFileBytes) { setState("error"); setMessage(`파일은 최대 ${formatBytes(maxFileBytes)}까지 올릴 수 있습니다.`); return; }
    setPendingFile(file); setRemoveExistingFile(false); markDirty();
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { chooseFile(event.target.files?.[0] ?? null); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragActive(false); chooseFile(event.dataTransfer.files?.[0] ?? null); }

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
              <button className="ghost-button" onClick={() => void refresh()} disabled={isRefreshing}><RefreshCw size={16} className={isRefreshing ? "spin" : ""} /> 새로고침</button>
              <button className="ghost-button" onClick={() => void shareLink()}><Share2 size={16} /> 링크</button>
            </div>
          </div>

          <textarea className="pb-textarea" value={text} maxLength={30_000} spellCheck={false} placeholder="여기에 붙여넣으세요. 다른 기기에서 같은 번호를 열면 그대로 보입니다."
            onChange={(event) => { setText(event.target.value); markDirty(); }} aria-label="슬롯 텍스트" />

          <div className="editor-footer">
            <span>{text.length.toLocaleString()} / 30,000</span>
            <button className="text-action" onClick={() => void copyText()} disabled={!text}><Clipboard size={15} /> 텍스트 복사</button>
          </div>
        </section>

        <aside className="side-panel">
          <div className="side-section">
            <div className="section-title-row">
              <div><p className="eyebrow">ATTACHMENT</p><h2>파일</h2></div>
              {(pendingFile || existingFile) && <button className="icon-button subtle" aria-label="첨부 제거" onClick={() => { setPendingFile(null); setRemoveExistingFile(true); markDirty(); }}><X size={17} /></button>}
            </div>

            {pendingFile ? (
              <div className="file-card pending"><div className="file-icon"><FilePlus2 size={20} /></div><div className="file-copy"><strong>{pendingFile.name}</strong><span>{formatBytes(pendingFile.size)} · 저장 대기</span></div></div>
            ) : existingFile ? (
              <div className="file-card"><div className="file-icon"><Check size={20} /></div><div className="file-copy"><strong>{existingFile.name}</strong><span>{formatBytes(existingFile.size)}</span></div><a className="icon-button" href={existingFile.url} target="_blank" rel="noreferrer" aria-label="파일 열기"><Download size={17} /></a></div>
            ) : (
              <div className={`dropzone${dragActive ? " active" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}>
                <FilePlus2 size={22} /><strong>파일 놓기</strong><span>또는 클릭해서 선택 · 최대 {formatBytes(maxFileBytes)}</span>
              </div>
            )}
            <input ref={fileInputRef} type="file" className="sr-only" onChange={onFileChange} />
          </div>

          <div className="side-section meta-section"><p className="eyebrow">RETENTION</p><div className="retention-row"><span className="infinity">∞</span><div><strong>시간 제한 없음</strong><span>공간이 부족할 때 오래된 슬롯부터 정리됩니다.</span></div></div></div>

          {slot && <div className="side-section meta-section"><p className="eyebrow">LAST SAVED</p><strong className="date-line">{formatUpdatedAt(slot.updatedAt)}</strong><span className="revision">revision {slot.revision}</span></div>}

          <div className="side-actions">
            <button className="primary-button" onClick={() => void save()} disabled={state === "saving" || (!isDirty && !!slot)}>
              {state === "saving" ? <RefreshCw size={18} className="spin" /> : state === "saved" ? <Check size={18} /> : <Save size={18} />}
              {state === "saving" ? "저장 중" : state === "saved" ? "저장됨" : "저장"}<kbd>⌘S</kbd>
            </button>
            <button className="danger-button" onClick={() => void clear()} disabled={!slot && !text && !pendingFile}><Trash2 size={17} /> 비우기</button>
          </div>

          {message && <div className={`message ${state === "error" ? "error" : ""}`}>{message}</div>}
          <p className="security-note">이 슬롯은 공개 번호입니다. 비밀번호·개인정보·민감한 문서는 저장하지 마세요.</p>
        </aside>
      </div>

      <div className="mobile-savebar">
        <button className="primary-button" onClick={() => void save()} disabled={state === "saving" || (!isDirty && !!slot)}>{state === "saving" ? <RefreshCw size={18} className="spin" /> : <Save size={18} />} 저장</button>
        <button className="icon-button" onClick={() => void shareLink()} aria-label="링크 공유"><Copy size={18} /></button>
      </div>
    </main>
  );
}
