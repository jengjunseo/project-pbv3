"use client";

import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { formatSlotId } from "@/lib/validation";

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
    router.push(`/slot/${formatSlotId(id)}`);
  }

  return (
    <form className="launcher" onSubmit={submit}>
      <div className={`slot-input-wrap${error ? " has-error" : ""}`}>
        <label htmlFor="slot-number">SLOT</label>
        <input
          ref={inputRef}
          id="slot-number"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={2}
          placeholder="00"
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setError("");
            const digits = event.target.value.replace(/\D/g, "").slice(-2);
            setValue(digits);
          }}
          autoFocus
          aria-describedby={error ? "slot-error" : undefined}
        />
        <button type="submit" aria-label="슬롯 열기"><ArrowUpRight size={26} strokeWidth={2} /></button>
      </div>
      <div className="launcher-meta">
        <span id="slot-error" className={error ? "form-error" : "form-hint"}>
          {error || (value ? `${value} → ${formatSlotId(Number(value))}` : "00에서 숫자를 입력하면 두 자리 슬롯으로 열립니다.")}
        </span>
        <span>ENTER ↵</span>
      </div>
    </form>
  );
}
