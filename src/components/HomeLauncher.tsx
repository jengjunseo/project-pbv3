"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

export function HomeLauncher() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = value.trim();
    if (!/^\d{1,2}$/.test(normalized)) {
      setError("0부터 99 사이 번호를 입력하세요.");
      inputRef.current?.focus();
      return;
    }
    const id = Number(normalized);
    if (id < 0 || id > 99) {
      setError("0부터 99 사이 번호를 입력하세요.");
      return;
    }
    router.push(`/slot/${id}`);
  }

  return (
    <form className="launcher" onSubmit={submit}>
      <div className={`slot-input-wrap${error ? " has-error" : ""}`}>
        <label htmlFor="slot-number">SLOT</label>
        <input ref={inputRef} id="slot-number" inputMode="numeric" autoComplete="off" enterKeyHint="go" maxLength={2} placeholder="17" value={value}
          onChange={(event) => { setError(""); setValue(event.target.value.replace(/\D/g, "").slice(0, 2)); }} autoFocus aria-describedby={error ? "slot-error" : undefined} />
        <button type="submit" aria-label="슬롯 열기"><ArrowUpRight size={26} strokeWidth={2} /></button>
      </div>
      <div className="launcher-meta">
        <span id="slot-error" className={error ? "form-error" : "form-hint"}>{error || "두 자리 숫자만 기억하면 됩니다."}</span>
        <span>ENTER ↵</span>
      </div>
    </form>
  );
}
