# ReceiptIt beta backup and isolated restore

## Purpose and scope

ReceiptIt's Supabase Free plan does not provide the automatic backups or point-
in-time recovery required for this beta gate. A usable recovery snapshot must
include both the PostgreSQL state and the private original files: the database
contains Storage metadata but not the receipt objects themselves.

`scripts/backup-receiptit.sh` creates one encrypted archive containing:

- `public` schema plus `public` data and the required private-Storage metadata,
  including RLS, policies, functions, triggers, user UUIDs in profiles and
  receipt metadata/child rows. Supabase-managed Auth credentials are not
  copied into a separate project;
- all private `receipts` objects under their existing `<user-id>/...` paths;
- a manifest and SHA-256 checksum for every restored original.

The archive is encrypted locally before it reaches the destination using
AES-256-CBC, a unique salt, and PBKDF2 with 600,000 iterations. The plaintext
is held only in a temporary directory and removed on exit. The passphrase is
an environment variable or OS keychain secret; it must never be put in this
repository, a Make mapping, browser environment variable, or backup folder.

## Required one-time setup

1. Create a **dedicated private Backblaze B2 bucket** for encrypted ReceiptIt
   backups. Restrict its application key to that bucket and the `backups/`
   prefix only; use read/write access, never the master key. The production
   bucket is `receiptit-encrypted-backups-20260819`, with B2 default encryption
   enabled in addition to client-side encryption.
2. Store a long, unique `RECEIPTIT_BACKUP_PASSPHRASE` in macOS Keychain (or an
   equivalent restricted secret store). Keep a second recovery copy offline.
3. Create a dedicated, database-level backup login with read-only permissions
   and RLS bypass strictly for the backup operation. Store its connection URL
   in macOS Keychain under service `receiptit-backup-production-db`, account
   `receiptit-backup`; do not reuse an application or owner credential.
4. Configure a launchd job or other local scheduler to run the backup script
   daily. Keep 14 daily bundles by default; adjust
   `RECEIPTIT_BACKUP_KEEP` only deliberately.
5. Run the first backup manually and confirm that both `.tar.enc` and its
   `.sha256` sidecar appear at the off-site destination.

Example invocation (the B2 key and passphrase are loaded from macOS Keychain
when their environment variables are omitted):

```bash
export RECEIPTIT_BACKUP_PASSPHRASE='read-from-keychain-at-runtime'
export RECEIPTIT_B2_BUCKET_ID='5a5415a43f281bb3a90b0b1c'
./scripts/backup-receiptit.sh
```

The B2 key expires after one year and must be replaced before its expiry. The
backup script enforces the default 14-bundle retention inside the dedicated
`backups/receiptit-*` prefix only. Retention never affects live receipt
originals or unrelated B2 objects.

For macOS scheduling, use
[`com.receiptit.backup.plist.example`](com.receiptit.backup.plist.example) as
the starting point. It retrieves the passphrase from the current user's macOS
Keychain service named `receiptit-backup` if the environment variable is not
provided. Change the absolute workspace and off-site destination paths before
loading it. Never place the passphrase in the plist.

## Isolated restore drill

Never restore over production.

1. Provision a separate, non-production Supabase project. It must have no
   production users or public clients attached.
2. Decrypt and validate into an empty isolated directory:

   ```bash
   export RECEIPTIT_BACKUP_PASSPHRASE='read-from-keychain-at-runtime'
   ./scripts/restore-receiptit-backup.sh \
     /Volumes/ReceiptIt-Encrypted-Backups/receiptit-YYYYMMDDTHHMMSSZ.tar.enc \
     /tmp/receiptit-isolated-restore
   ```

3. Review `manifest.json`, verify every object checksum, then restore
   `schema.sql`, `public-data.sql`, and `storage-metadata.sql` into **only**
   the isolated project's database with a temporary restore-only credential. Auth users are
   intentionally not restored; the drill validates ownership from the
   preserved profile UUID, receipt `user_id`, and unchanged Storage path.
4. Copy the extracted `receipts/` hierarchy into that isolated project's
   private `receipts` bucket without changing object paths.
5. Apply `storage-policies.sql` using a project-owner Storage-policy session.
   Supabase manages ownership of `storage.objects`; a constrained restore
   login cannot alter those policies. If the restore role cannot apply this
   file, keep the restored bucket private and fail closed, then have a project
   owner apply the same four exported owner-folder policies before attaching
   any client to the restored project.
6. Check one controlled receipt row, its `user_id`, its `storage_path`, and the
   matching restored object. With separate test users, verify owner access is
   allowed and cross-user reads/listing/deletion remain denied.
6. Record the bundle timestamp, restored receipt ID/path, RLS result, and
   operator in the incident log. Destroy the isolated project and decrypted
   folder after the drill.

## Restore acceptance criteria

The recovery control is considered complete only when an actual encrypted
bundle exists off-site and the isolated drill proves all of the following:

- database rows and schema/policy behavior recover;
- one private original recovers at its original owner-folder path;
- its restored `user_id` and `storage_path` relationship is intact;
- no cross-user Storage or database access is introduced;
- production has not been touched.

## 19 August 2026 drill record

- An encrypted B2 bundle with separate `public-data.sql` and
  `storage-metadata.sql` was created in the dedicated private bucket.
- An isolated Supabase project restored 14 receipts, 13 receipt items, 5
  payments and 152 private originals. One controlled original matched the
  archived SHA-256 byte-for-byte.
- The restored database policy test allowed the matching owner to read one
  receipt and its three children while returning zero records for another
  owner. The isolated Storage bucket remained private; unauthenticated
  original access was denied.
- Production was not queried for writes, altered, or used as a restore target.
