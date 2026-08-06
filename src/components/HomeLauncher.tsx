"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { formatSlotId } from "@/lib/validation";

export function HomeLauncher() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = value.trim();
    if (!/^\d{1,2}$/.test(normalized)) {
      inputRef.current?.focus();
      return;
    }
    const id = Number(normalized);
    if (id < 0 || id > 99) return;
    router.push(`/slot/${formatSlotId(id)}`);
  }

  return (
    <form className="launcher minimal-launcher" onSubmit={submit}>
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
        onChange={(event) => setValue(event.target.value.replace(/\D/g, "").slice(-2))}
        autoFocus
        aria-label="slot number"
      />
      <button type="submit">LOAD</button>
    </form>
  );
}
