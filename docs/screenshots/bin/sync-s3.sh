#!/usr/bin/env bash
#
# Pushes the PNGs in out/stacks/ to s3://<bucket>/docs-images/stacks/, and
# those in out/raven/ to s3://<bucket>/docs-images/raven/, or pulls them back.
#
#   bin/sync-s3.sh push [aws s3 sync options]
#   bin/sync-s3.sh pull [aws s3 sync options]
#
# DOCS_IMAGES_AWS_PROFILE and DOCS_IMAGES_S3_BUCKET come from the
# environment first, then from .env. Extra arguments go to `aws s3 sync`,
# for example `--dryrun`.
#
# Neither direction deletes anything: published image names are permanent,
# and a pull must not remove shots that have not been pushed yet.

set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PACKAGE_DIR/.env"
OUT_DIR="$PACKAGE_DIR/out"

# Reads NAME from .env without sourcing it, so the file cannot override
# variables already set in the environment or run commands. Parses values like
# dotenv does for src/env.ts: a quoted value is taken as is, and an unquoted
# value ends at the first #.
read_dotenv() {
  local name="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  sed -nE "s/^[[:space:]]*(export[[:space:]]+)?${name}[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" |
    tail -n 1 |
    sed -E -e 's/^"([^"]*)".*/\1/' -e t -e "s/^'([^']*)'.*/\1/" -e t \
      -e 's/#.*//' -e 's/[[:space:]]+$//'
}

required() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "$value" ]] || value="$(read_dotenv "$name")"
  if [[ -z "$value" ]]; then
    echo "$name is not set. Set it in the environment or in docs/screenshots/.env (see .env.template)." >&2
    exit 1
  fi
  printf '%s' "$value"
}

direction="${1:-}"
if [[ "$direction" != "push" && "$direction" != "pull" ]]; then
  echo "Usage: $0 push|pull [aws s3 sync options]" >&2
  exit 2
fi
shift

if ! command -v aws >/dev/null 2>&1; then
  echo "The AWS CLI (aws) is not installed. See https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
  exit 1
fi

profile="$(required DOCS_IMAGES_AWS_PROFILE)"
bucket="$(required DOCS_IMAGES_S3_BUCKET)"
mkdir -p "$OUT_DIR/stacks" "$OUT_DIR/raven"

# sync_dir LOCAL_DIR S3_PREFIX [aws s3 sync options]
sync_dir() {
  local local_dir="$1/" remote="s3://$bucket/$2/"
  shift 2
  local src="$local_dir" dest="$remote"
  if [[ "$direction" == "pull" ]]; then
    src="$remote" dest="$local_dir"
  fi
  local args=(s3 sync "$src" "$dest" --profile "$profile" --exclude "*" --include "*.png" "$@")
  echo "aws ${args[*]}"
  aws "${args[@]}"
}

sync_dir "$OUT_DIR/stacks" docs-images/stacks "$@"
sync_dir "$OUT_DIR/raven" docs-images/raven "$@"
