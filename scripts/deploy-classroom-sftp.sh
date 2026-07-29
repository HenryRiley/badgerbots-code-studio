#!/usr/bin/env bash
set -euo pipefail

: "${SFTP_HOST:?SFTP_HOST is required}"
: "${SFTP_PORT:?SFTP_PORT is required}"
: "${SFTP_USERNAME:?SFTP_USERNAME is required}"
: "${SFTP_PRIVATE_KEY:?SFTP_PRIVATE_KEY is required}"
: "${SFTP_HOST_KEY:?SFTP_HOST_KEY is required}"
: "${SFTP_REMOTE_CLASSROOM_DIR:?SFTP_REMOTE_CLASSROOM_DIR is required}"

case "$SFTP_PORT" in
  ''|*[!0-9]*) echo "SFTP_PORT must contain only digits." >&2; exit 1 ;;
esac

case "$SFTP_HOST" in
  ''|.*|-*|*[!A-Za-z0-9.-]*)
    echo "SFTP_HOST is invalid." >&2
    exit 1
    ;;
esac

case "$SFTP_USERNAME" in
  [A-Za-z0-9]*) ;;
  *) echo "SFTP_USERNAME is invalid." >&2; exit 1 ;;
esac
case "$SFTP_USERNAME" in
  *[!A-Za-z0-9._-]*) echo "SFTP_USERNAME is invalid." >&2; exit 1 ;;
esac

case "$SFTP_REMOTE_CLASSROOM_DIR" in
  *".."*|*" "*|*\\*|*[!A-Za-z0-9_./-]*)
    echo "SFTP_REMOTE_CLASSROOM_DIR contains unsupported characters." >&2
    exit 1
    ;;
  /classroom|/*/classroom) ;;
  *)
    echo "SFTP_REMOTE_CLASSROOM_DIR must end exactly in /classroom." >&2
    exit 1
    ;;
esac

artifact_directory="${1:-installers/artifacts/classroom-web}"
case "$artifact_directory" in
  *".."*|*" "*|*\\*|*[!A-Za-z0-9_./-]*)
    echo "The local artifact path contains unsupported characters." >&2
    exit 1
    ;;
esac
test -f "$artifact_directory/index.html"
test -f "$artifact_directory/.htaccess"
test -f "$artifact_directory/deployment-manifest.json"
test -d "$artifact_directory/_next"

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
key_file="$temporary_directory/deploy_key"
known_hosts_file="$temporary_directory/known_hosts"
batch_file="$temporary_directory/deploy.batch"

printf '%s\n' "$SFTP_PRIVATE_KEY" > "$key_file"
chmod 600 "$key_file"
printf '%s\n' "$SFTP_HOST_KEY" > "$known_hosts_file"

printf -- '-mkdir %s\n' "$SFTP_REMOTE_CLASSROOM_DIR" > "$batch_file"

while IFS= read -r directory; do
  relative_path="${directory#"$artifact_directory"/}"
  printf -- '-mkdir %s/%s\n' "$SFTP_REMOTE_CLASSROOM_DIR" "$relative_path" >> "$batch_file"
done < <(find "$artifact_directory" -mindepth 1 -type d | LC_ALL=C sort)

while IFS= read -r file; do
  relative_path="${file#"$artifact_directory"/}"
  if [ "$relative_path" = "index.html" ]; then
    continue
  fi
  case "$relative_path" in
    *[!A-Za-z0-9_./-]*)
      echo "A packaged file has an unsupported deployment path: $relative_path" >&2
      exit 1
      ;;
  esac
  printf 'put %s %s/%s\n' "$file" "$SFTP_REMOTE_CLASSROOM_DIR" "$relative_path" >> "$batch_file"
done < <(find "$artifact_directory" -type f | LC_ALL=C sort)

{
  printf 'put %s/index.html %s/index.html.next\n' \
    "$artifact_directory" "$SFTP_REMOTE_CLASSROOM_DIR"
  printf -- '-rm %s/index.html\n' "$SFTP_REMOTE_CLASSROOM_DIR"
  printf 'rename %s/index.html.next %s/index.html\n' \
    "$SFTP_REMOTE_CLASSROOM_DIR" "$SFTP_REMOTE_CLASSROOM_DIR"
} >> "$batch_file"

sftp \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$known_hosts_file" \
  -i "$key_file" \
  -P "$SFTP_PORT" \
  -b "$batch_file" \
  "$SFTP_USERNAME@$SFTP_HOST"
