#!/usr/bin/env bash
set -euo pipefail

# Creates one encrypted, self-contained ReceiptIt recovery bundle. Run this
# from the linked production workspace only, with a restricted off-site folder
# already mounted at RECEIPTIT_BACKUP_DESTINATION.

: "${RECEIPTIT_BACKUP_DESTINATION:?Set an already-provisioned off-site destination directory.}"

if [[ -z "${RECEIPTIT_BACKUP_PASSPHRASE:-}" ]]; then
  RECEIPTIT_BACKUP_PASSPHRASE="$(security find-generic-password -a "$(id -un)" -s receiptit-backup -w 2>/dev/null || true)"
fi
: "${RECEIPTIT_BACKUP_PASSPHRASE:?Set a long backup passphrase outside the repository or store it in macOS Keychain as service receiptit-backup.}"
export RECEIPTIT_BACKUP_PASSPHRASE

supabase_bin="${SUPABASE_BIN:-supabase}"
backup_destination="${RECEIPTIT_BACKUP_DESTINATION%/}"
backup_keep="${RECEIPTIT_BACKUP_KEEP:-14}"

if [[ ! -d "$backup_destination" ]]; then
  echo "Backup destination does not exist: $backup_destination" >&2
  exit 1
fi
if [[ ! "$backup_keep" =~ ^[1-9][0-9]*$ ]]; then
  echo "RECEIPTIT_BACKUP_KEEP must be a positive integer." >&2
  exit 1
fi

backup_workdir="$(mktemp -d -t receiptit-backup.XXXXXX)"
backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="receiptit-${backup_timestamp}.tar.enc"
backup_bundle="$backup_destination/$backup_name"

cleanup() {
  rm -rf "$backup_workdir"
}
trap cleanup EXIT

mkdir -p "$backup_workdir/snapshot"

# This dump deliberately includes the app, Storage metadata, and Auth identity
# records so restored owner UUIDs continue to match the restored objects.
"$supabase_bin" db dump --linked --schema public,storage,auth --use-copy \
  --file "$backup_workdir/snapshot/database.sql"

# Database backups contain only Storage metadata; private originals are copied
# separately and retained under their original owner-folder paths.
"$supabase_bin" storage cp --experimental --recursive ss:///receipts \
  "$backup_workdir/snapshot/receipts"

(
  cd "$backup_workdir/snapshot"
  find receipts -type f -print0 | sort -z | xargs -0 shasum -a 256 > storage-object-checksums.sha256
  {
    printf '{\n'
    printf '  "created_at": "%s",\n' "$(date -u +%FT%TZ)"
    printf '  "database_dump": "database.sql",\n'
    printf '  "storage_root": "receipts",\n'
    printf '  "storage_checksum_manifest": "storage-object-checksums.sha256"\n'
    printf '}\n'
  } > manifest.json
  tar -cf "$backup_workdir/receiptit.tar" database.sql receipts storage-object-checksums.sha256 manifest.json
)

# AES-256 with a unique salt and PBKDF2 work factor protects the complete bundle
# before it leaves the machine. The plaintext only exists in mktemp and is
# removed by the EXIT trap.
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -md sha256 \
  -pass env:RECEIPTIT_BACKUP_PASSPHRASE \
  -in "$backup_workdir/receiptit.tar" \
  -out "$backup_bundle"

shasum -a 256 "$backup_bundle" > "$backup_bundle.sha256"

# Retention applies only to bundles created by this script in the configured
# destination; it never touches unrelated files.
while IFS= read -r old_bundle; do
  rm -f -- "$old_bundle" "$old_bundle.sha256"
done < <(
  find "$backup_destination" -maxdepth 1 -type f -name 'receiptit-*.tar.enc' -print \
    | sort -r \
    | tail -n +$((backup_keep + 1))
)

echo "Encrypted ReceiptIt backup written: $backup_bundle"
