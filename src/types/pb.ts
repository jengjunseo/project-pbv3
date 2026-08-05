export type PBFileMeta = {
  url: string;
  pathname: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
};

export type PBSlot = {
  id: number;
  text: string;
  file: PBFileMeta | null;
  createdAt: number;
  updatedAt: number;
  bytes: number;
  revision: number;
};

export type SlotReadResponse =
  | { ok: true; empty: true; slot: null }
  | { ok: true; empty: false; slot: PBSlot };

export type SlotWriteResponse = {
  ok: true;
  slot: PBSlot;
  evictedIds: number[];
};

export type PBErrorResponse = {
  ok: false;
  error: { code: string; message: string };
};
