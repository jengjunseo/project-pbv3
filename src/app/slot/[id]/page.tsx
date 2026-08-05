import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PBWorkspace } from "@/components/PBWorkspace";
import { MAX_FILE_BYTES } from "@/lib/constants";
import { formatSlotId, parseSlotId } from "@/lib/validation";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ id: string }> {
  return Array.from({ length: 100 }, (_, id) => ({ id: formatSlotId(id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `#${id} — PB`,
    robots: { index: false, follow: false },
  };
}

export default async function SlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseSlotId(rawId);
  if (id === null || rawId !== formatSlotId(id)) notFound();
  return <PBWorkspace key={id} id={id} maxFileBytes={MAX_FILE_BYTES} />;
}
