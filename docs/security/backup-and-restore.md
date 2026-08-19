# ReceiptIt beta backup and isolated restore

## Purpose and scope

ReceiptIt's Supabase Free plan does not provide the automatic backups or point-
in-time recovery required for this beta gate. A usable recovery snapshot must
include both the PostgreSQL state and the private original files: the database
contains Storage metadata but not the receipt objects themselves.

`scripts/backup-receiptit.sh` creates one encrypted archive containing:

- `public`, `storage`, and `auth` database schemas/data, including RLS,
  policies, functions, triggers, user UUIDs, receipt metadata, and child rows;
- all private `receipts` objects under their existing `<user-id>/...` paths;
- a manifest and SHA-256 checksum for every restored original.

The archive is encrypted locally before it reaches the destination using
AES-256-CBC, a unique salt, and PBKDF2 with 600,000 iterations. The plaintext
is held only in a temporary directory and removed on exit. The passphrase is
an environment variable or OS keychain secret; it must never be put in this
repository, a Make mapping, browser environment variable, or backup folder.

## Required one-time setup

1. Create a **dedicated private off-site destination** available as a mounted
   local folder. It must not be the production Supabase project or this Git
   repository. Grant access only to the founder/backup operator.
2. Store a long, unique `RECEIPTIT_BACKUP_PASSPHRASE` in macOS Keychain (or an
   equivalent restricted secret store). Keep a second recovery copy offline.
3. Configure a launchd job or other local scheduler to run the backup script
   daily. Keep 14 daily bundles by default; adjust
   `RECEIPTIT_BACKUP_KEEP` only deliberately.
4. Run the first backup manually and confirm that both `.tar.enc` and its
   `.sha256` sidecar appear at the off-site destination.

Example invocation (the destination must already be an off-site mounted
folder):

```bash
export RECEIPTIT_BACKUP_PASSPHRASE='read-from-keychain-at-runtime'
export RECEIPTIT_BACKUP_DESTINATION='/Volumes/ReceiptIt-Encrypted-Backups'
./scripts/backup-receiptit.sh
```

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
   `database.sql` into **only** the isolated project's database with a
   restricted database credential.
4. Copy the extracted `receipts/` hierarchy into that isolated project's
   private `receipts` bucket without changing object paths.
5. Check one controlled receipt row, its `user_id`, its `storage_path`, and the
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
