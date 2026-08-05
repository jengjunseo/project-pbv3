import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SlotWorkspace } from "@/components/SlotWorkspace";
import { parseSlotId } from "@/lib/validation";
import { readSlot } from "@/lib/slot-store";
import { getMaxFileBytes } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `#${id.padStart(2, "0")} — PB` };
}

export default async function SlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseSlotId(rawId);
  if (id === null) notFound();
  const slot = await readSlot(id);
  return <SlotWorkspace id={id} initialSlot={slot} maxFileBytes={getMaxFileBytes()} />;
}
