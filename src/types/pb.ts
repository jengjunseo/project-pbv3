export type PBFileView = {
  name: string;
  size: number;
  type: string;
};

export type PBSlotView = {
  id: number;
  text: string;
  file: PBFileView | null;
  createdAt: string;
  updatedAt: string;
  bytes: number;
  revision: number;
};

export type SlotReadResponse =
  | { ok: true; empty: true; slot: null }
  | { ok: true; empty: false; slot: PBSlotView };

export type SlotWriteResponse = {
  ok: true;
  slot: PBSlotView;
  evictedIds: number[];
};

export type PrepareUploadResponse = {
  ok: true;
  capabilityId: string;
  signedUrl: string;
  expiresAt: string;
  evictedIds: number[];
};

export type DownloadResponse = {
  ok: true;
  downloadUrl: string;
};

export type CancelUploadResponse = {
  ok: true;
  cancelled: boolean;
};

export type PBErrorCode =
  | "BAD_ORIGIN"
  | "INVALID_CONTENT_TYPE"
  | "BODY_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_SLOT"
  | "INVALID_PAYLOAD"
  | "INVALID_FILE"
  | "EMPTY_SLOT"
  | "RATE_LIMITED"
  | "LOAD_FAILED"
  | "SAVE_FAILED"
  | "CLEAR_FAILED"
  | "UPLOAD_PREPARE_FAILED"
  | "UPLOAD_CANCEL_FAILED"
  | "MAINTENANCE_UNAUTHORIZED"
  | "MAINTENANCE_FAILED"
  | "CONFIG_ERROR";

export type PBErrorResponse = {
  ok: false;
  error: {
    code: PBErrorCode;
    message: string;
  };
};
