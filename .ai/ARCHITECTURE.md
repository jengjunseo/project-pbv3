# PBV3.1 Architecture

## Trust boundary

The browser owns only user input: slot number, text, and a selected file. Same-origin Vercel APIs own validation and fingerprinting. PostgreSQL owns mutation state, timestamps, byte counts, reservations, revisions, and eviction.

No browser component contains a Supabase key or direct Data/Storage API URL.

## Read path

`GET /api/slots/:id` reads one row through the server-only Supabase client and returns text plus file metadata. It does not sign a file URL. `GET /api/slots/:id/download` creates a 60-second signed URL only on demand.

## Write path

Upload preparation validates extension/MIME, signs one server-generated path, then creates a DB reservation. Commit verifies the capability and reads actual `storage.objects.metadata.size` inside the transaction. The old object remains referenced until commit succeeds. Cleanup is asynchronous and durable.

## Capacity

Committed slot bytes are `octet_length(text) + file_bytes`. Pending capabilities reserve 10 MiB each. Under pressure, RPCs evict oldest-updated slots while excluding the active slot.

## Races

Client request epochs prevent stale loads/saves from mutating the current slot UI. Capability rows are locked for cancel/commit races. One advisory transaction lock serializes PB storage accounting and eviction across server instances.

## Replay and cleanup

Supabase signed-upload URLs can outlive the short DB capability. Capability-created objects are therefore not deleted until the signing replay window has elapsed. Cleanup jobs use leasing, eight bounded attempts, exponential backoff, stale-lease recovery, and a dead state.
