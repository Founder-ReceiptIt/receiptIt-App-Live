#!/usr/bin/env bash
set -euo pipefail

# Decrypts and validates a ReceiptIt recovery bundle. This intentionally does
# not write to any database or Storage bucket: use it first for the isolated
# restore drill described in docs/security/backup-and-restore.md.

: "${RECEIPTIT_BACKUP_PASSPHRASE:?Set the backup passphrase outside the repository.}"

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 /absolute/path/to/receiptit-YYYYMMDDTHHMMSSZ.tar.enc /absolute/isolated/restore-directory" >&2
  exit 1
fi

encrypted_bundle="$1"
restore_directory="$2"

if [[ ! -f "$encrypted_bundle" || ! -f "$encrypted_bundle.sha256" ]]; then
  echo "Both the encrypted bundle and its .sha256 sidecar are required." >&2
  exit 1
fi
if [[ -e "$restore_directory" ]]; then
  echo "Restore directory already exists; choose a new empty isolated directory." >&2
  exit 1
fi

mkdir -p "$restore_directory"
if ! (cd "$(dirname "$encrypted_bundle")" && shasum -a 256 -c "$(basename "$encrypted_bundle").sha256"); then
  rm -rf "$restore_directory"
  echo "Encrypted bundle checksum failed; refusing restore." >&2
  exit 1
fi

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 \
  -pass env:RECEIPTIT_BACKUP_PASSPHRASE \
  -in "$encrypted_bundle" \
  -out "$restore_directory/receiptit.tar"
tar -xf "$restore_directory/receiptit.tar" -C "$restore_directory"
rm -f "$restore_directory/receiptit.tar"

if [[ ! -f "$restore_directory/database.sql" || ! -f "$restore_directory/manifest.json" ]]; then
  rm -rf "$restore_directory"
  echo "Restore bundle is incomplete; refusing to continue." >&2
  exit 1
fi

(
  cd "$restore_directory"
  shasum -a 256 -c storage-object-checksums.sha256
)

echo "Bundle decrypted and integrity-checked at: $restore_directory"
echo "Next: restore only into an isolated Supabase project, following docs/security/backup-and-restore.md."
