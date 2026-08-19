#!/usr/bin/env bash
set -euo pipefail

# Creates one encrypted, self-contained ReceiptIt recovery bundle. Run this
# from the linked production workspace only. It uploads to the restricted B2
# bucket when RECEIPTIT_B2_BUCKET_ID is set; a mounted off-site folder remains
# supported for recovery testing.

if [[ -z "${RECEIPTIT_BACKUP_PASSPHRASE:-}" ]]; then
  RECEIPTIT_BACKUP_PASSPHRASE="$(security find-generic-password -a "$(id -un)" -s receiptit-backup -w 2>/dev/null || true)"
fi
: "${RECEIPTIT_BACKUP_PASSPHRASE:?Set a long backup passphrase outside the repository or store it in macOS Keychain as service receiptit-backup.}"
export RECEIPTIT_BACKUP_PASSPHRASE

pg_dump_bin="${PG_DUMP_BIN:-pg_dump}"
psql_bin="${PSQL_BIN:-psql}"
supabase_bin="${SUPABASE_BIN:-supabase}"
backup_destination="${RECEIPTIT_BACKUP_DESTINATION:-}"
backup_keep="${RECEIPTIT_BACKUP_KEEP:-14}"
b2_bucket_id="${RECEIPTIT_B2_BUCKET_ID:-}"

# A direct, least-privileged database login avoids Docker and is intentionally
# kept outside the repository. The production PostgreSQL password is never
# changed by this script.
if [[ -z "${RECEIPTIT_PRODUCTION_DATABASE_URL:-}" ]]; then
  RECEIPTIT_PRODUCTION_DATABASE_URL="$(security find-generic-password -a receiptit-backup -s receiptit-backup-production-db -w 2>/dev/null || true)"
fi
: "${RECEIPTIT_PRODUCTION_DATABASE_URL:?Store the production backup database URL in macOS Keychain as service receiptit-backup-production-db, account receiptit-backup.}"

if ! command -v "$pg_dump_bin" >/dev/null 2>&1; then
  if [[ -x /opt/homebrew/opt/libpq/bin/pg_dump ]]; then
    pg_dump_bin=/opt/homebrew/opt/libpq/bin/pg_dump
  else
    echo "pg_dump is required for an encrypted database backup." >&2
    exit 1
  fi
fi
if ! command -v "$psql_bin" >/dev/null 2>&1; then
  if [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then
    psql_bin=/opt/homebrew/opt/libpq/bin/psql
  else
    echo "psql is required for Storage-policy backup." >&2
    exit 1
  fi
fi

if [[ -z "$b2_bucket_id" && -z "$backup_destination" ]]; then
  echo "Set RECEIPTIT_B2_BUCKET_ID or RECEIPTIT_BACKUP_DESTINATION." >&2
  exit 1
fi
if [[ -n "$backup_destination" && ! -d "$backup_destination" ]]; then
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
backup_bundle="$backup_workdir/$backup_name"

cleanup() {
  rm -rf "$backup_workdir"
}
trap cleanup EXIT

mkdir -p "$backup_workdir/snapshot"

# Preserve application schema, functions, policies, and triggers separately
# from data. Supabase-managed Auth schema definitions and credentials are not
# copied into a different project; public profile UUIDs retain the owner links
# needed by receipt rows, while Storage metadata and private object paths are
# retained intact.
"$pg_dump_bin" --format=plain --no-owner --no-privileges --schema=public \
  --schema-only --file "$backup_workdir/snapshot/schema.sql" \
  "$RECEIPTIT_PRODUCTION_DATABASE_URL"
"$pg_dump_bin" --format=plain --no-owner --no-privileges --data-only \
  --schema=public --file "$backup_workdir/snapshot/public-data.sql" \
  "$RECEIPTIT_PRODUCTION_DATABASE_URL"
"$pg_dump_bin" --format=plain --no-owner --no-privileges --data-only \
  --table=storage.buckets --table=storage.objects \
  --file "$backup_workdir/snapshot/storage-metadata.sql" \
  "$RECEIPTIT_PRODUCTION_DATABASE_URL"

# Storage's schema is managed by Supabase, but ReceiptIt's owner-folder RLS
# policies are project-specific and must accompany the metadata/data restore.
{
  printf 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;\n'
  "$psql_bin" "$RECEIPTIT_PRODUCTION_DATABASE_URL" -Atqc "
    SELECT format(
      'DROP POLICY IF EXISTS %I ON %I.%I; CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
      policyname, schemaname, tablename, policyname, schemaname, tablename,
      permissive, cmd, array_to_string(roles, ', '),
      CASE WHEN qual IS NULL THEN '' ELSE ' USING (' || qual || ')' END,
      CASE WHEN with_check IS NULL THEN '' ELSE ' WITH CHECK (' || with_check || ')' END
    )
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname;
  "
} > "$backup_workdir/snapshot/storage-policies.sql"

# Database backups contain only Storage metadata; private originals are copied
# separately and retained under their original owner-folder paths. Supabase CLI
# authenticates with its existing local profile and never writes the service
# role credential to the archive or this repository.
"$supabase_bin" storage cp --experimental --recursive --linked ss:///receipts \
  "$backup_workdir/snapshot/receipts"

(
  cd "$backup_workdir/snapshot"
  find receipts -type f -print0 | sort -z | xargs -0 shasum -a 256 > storage-object-checksums.sha256
  {
    printf '{\n'
    printf '  "created_at": "%s",\n' "$(date -u +%FT%TZ)"
    printf '  "schema_dump": "schema.sql",\n'
    printf '  "public_data_dump": "public-data.sql",\n'
    printf '  "storage_metadata_dump": "storage-metadata.sql",\n'
    printf '  "storage_root": "receipts",\n'
    printf '  "storage_checksum_manifest": "storage-object-checksums.sha256"\n'
    printf '}\n'
  } > manifest.json
  tar -cf "$backup_workdir/receiptit.tar" schema.sql public-data.sql storage-metadata.sql storage-policies.sql receipts storage-object-checksums.sha256 manifest.json
)

# AES-256 with a unique salt and PBKDF2 work factor protects the complete bundle
# before it leaves the machine. The plaintext only exists in mktemp and is
# removed by the EXIT trap.
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -md sha256 \
  -pass env:RECEIPTIT_BACKUP_PASSPHRASE \
  -in "$backup_workdir/receiptit.tar" \
  -out "$backup_bundle"

(
  cd "$backup_workdir"
  shasum -a 256 "$backup_name" > "$backup_name.sha256"
)

if [[ -n "$b2_bucket_id" ]]; then
  if [[ -z "${RECEIPTIT_B2_APPLICATION_KEY_ID:-}" ]]; then
    RECEIPTIT_B2_APPLICATION_KEY_ID="$(security find-generic-password -a receiptit-backup-b2 -s receiptit-backup-b2-application-key-id -w 2>/dev/null || true)"
  fi
  if [[ -z "${RECEIPTIT_B2_APPLICATION_KEY:-}" ]]; then
    RECEIPTIT_B2_APPLICATION_KEY="$(security find-generic-password -a receiptit-backup-b2 -s receiptit-backup-b2-application-key -w 2>/dev/null || true)"
  fi
  : "${RECEIPTIT_B2_APPLICATION_KEY_ID:?Set the restricted B2 key ID in Keychain or environment.}"
  : "${RECEIPTIT_B2_APPLICATION_KEY:?Set the restricted B2 key in Keychain or environment.}"

  # Keep all B2 credentials/tokens out of process arguments. The temporary
  # curl config is inside the 0700 workdir and is removed by the EXIT trap.
  umask 077
  b2_basic_config="$backup_workdir/b2-basic.curl"
  printf 'user = "%s:%s"\n' "$RECEIPTIT_B2_APPLICATION_KEY_ID" "$RECEIPTIT_B2_APPLICATION_KEY" > "$b2_basic_config"
  b2_authorization="$(curl --config "$b2_basic_config" --fail --silent --show-error https://api.backblazeb2.com/b2api/v4/b2_authorize_account)"
  b2_api_url="$(printf '%s' "$b2_authorization" | jq -r '.apiInfo.storageApi.apiUrl // .apiUrl')"
  b2_auth_token="$(printf '%s' "$b2_authorization" | jq -r '.authorizationToken')"
  b2_auth_config="$backup_workdir/b2-auth.curl"
  printf 'header = "Authorization: %s"\n' "$b2_auth_token" > "$b2_auth_config"
  b2_upload_info="$(curl --config "$b2_auth_config" --fail --silent --show-error "$b2_api_url/b2api/v4/b2_get_upload_url?bucketId=$b2_bucket_id")"
  b2_upload_url="$(printf '%s' "$b2_upload_info" | jq -r '.uploadUrl')"
  b2_upload_token="$(printf '%s' "$b2_upload_info" | jq -r '.authorizationToken')"
  b2_upload_config="$backup_workdir/b2-upload.curl"
  printf 'header = "Authorization: %s"\n' "$b2_upload_token" > "$b2_upload_config"

  for backup_file in "$backup_bundle" "$backup_bundle.sha256"; do
    b2_remote_name="backups/$(basename "$backup_file")"
    b2_encoded_name="$(printf '%s' "$b2_remote_name" | jq -sRr '@uri')"
    b2_sha1="$(shasum -a 1 "$backup_file" | awk '{print $1}')"
    b2_size="$(wc -c < "$backup_file" | tr -d ' ')"
    curl --config "$b2_upload_config" --fail --silent --show-error --request POST "$b2_upload_url" \
      -H "X-Bz-File-Name: $b2_encoded_name" \
      -H 'Content-Type: application/octet-stream' \
      -H "Content-Length: $b2_size" \
      -H "X-Bz-Content-Sha1: $b2_sha1" \
      --data-binary "@$backup_file" >/dev/null
  done

  # Retention is enforced on the dedicated B2 prefix only. Names contain a
  # sortable UTC timestamp, so keeping the newest archive names also keeps
  # their matching checksum sidecars. Nothing outside backups/receiptit-* is
  # considered, and live receipt originals are in a different bucket.
  b2_list_request="$backup_workdir/b2-list.json"
  jq -n --arg bucketId "$b2_bucket_id" --arg prefix 'backups/receiptit-' \
    '{bucketId: $bucketId, prefix: $prefix, maxFileCount: 1000}' > "$b2_list_request"
  b2_files="$(curl --config "$b2_auth_config" --fail --silent --show-error \
    -H 'Content-Type: application/json' --data @"$b2_list_request" \
    "$b2_api_url/b2api/v4/b2_list_file_names")"
  while IFS=$'\t' read -r stale_name stale_id; do
    [[ -z "$stale_name" || -z "$stale_id" ]] && continue
    b2_delete_request="$backup_workdir/b2-delete.json"
    jq -n --arg fileName "$stale_name" --arg fileId "$stale_id" \
      '{fileName: $fileName, fileId: $fileId}' > "$b2_delete_request"
    curl --config "$b2_auth_config" --fail --silent --show-error \
      -H 'Content-Type: application/json' --data @"$b2_delete_request" \
      "$b2_api_url/b2api/v4/b2_delete_file_version" >/dev/null
  done < <(
    printf '%s' "$b2_files" | jq -r '.files[] | select(.fileName | endswith(".tar.enc")) | [.fileName, .fileId] | @tsv' \
      | sort -r \
      | tail -n +$((backup_keep + 1))
  )
  echo "Encrypted ReceiptIt backup uploaded to Backblaze B2: backups/$backup_name"
fi

if [[ -n "$backup_destination" ]]; then
  cp "$backup_bundle" "$backup_bundle.sha256" "$backup_destination/"
  # Retention applies only to bundles created by this script in the configured
  # destination; it never touches unrelated files.
  while IFS= read -r old_bundle; do
    rm -f -- "$old_bundle" "$old_bundle.sha256"
  done < <(
    find "$backup_destination" -maxdepth 1 -type f -name 'receiptit-*.tar.enc' -print \
      | sort -r \
      | tail -n +$((backup_keep + 1))
  )
  echo "Encrypted ReceiptIt backup written: $backup_destination/$backup_name"
fi
