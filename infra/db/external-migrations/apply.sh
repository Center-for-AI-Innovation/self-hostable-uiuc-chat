#!/usr/bin/env bash
#
# apply.sh — replay the external-store migrations, in order, against one
# external per-project Postgres.
#
# Every file in this directory is idempotent, so there is no bookkeeping table
# and no "current version" to track: applying the whole set brings a store up
# to date whether it is one migration behind or ten.
#
#   ./apply.sh "postgresql://user:pass@host:5432/dbname"
#   EXTERNAL_DATABASE_URI="postgresql://..." ./apply.sh
#   ./apply.sh --dry-run "postgresql://..."
#   ./apply.sh --only 0001 "postgresql://..."
#
# Use a direct or session-mode connection (e.g. Supabase port 5432), not the
# transaction pooler — these run DDL. See docs/external-connections-setup.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
	cat <<'EOF'
apply.sh — replay the external-store migrations, in order, against one
external per-project Postgres. Every file is idempotent, so applying the whole
set brings a store up to date however far behind it is.

Usage:
  ./apply.sh "postgresql://user:pass@host:5432/dbname"
  EXTERNAL_DATABASE_URI="postgresql://..." ./apply.sh

Options:
  --dry-run       List the files that would be applied, without running them.
  --only <NNNN>   Apply only the migration with that number prefix.
  -h, --help      Show this help.

Use a direct or session-mode connection (e.g. Supabase port 5432), not the
transaction pooler — these run DDL. See docs/external-connections-setup.md.
EOF
}

dry_run=false
only=""
uri="${EXTERNAL_DATABASE_URI-}"

while [[ $# -gt 0 ]]; do
	case "$1" in
	--dry-run)
		dry_run=true
		shift
		;;
	--only)
		only="${2-}"
		shift 2
		;;
	-h | --help)
		usage
		exit 0
		;;
	-*)
		echo "unknown option: $1" >&2
		usage >&2
		exit 2
		;;
	*)
		uri="$1"
		shift
		;;
	esac
done

if [[ -z ${uri} ]]; then
	echo "error: no connection URI (pass one as an argument or set EXTERNAL_DATABASE_URI)" >&2
	usage >&2
	exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
	echo "error: psql not found on PATH" >&2
	exit 1
fi

shopt -s nullglob
files=()
for candidate in "${SCRIPT_DIR}"/[0-9][0-9][0-9][0-9]_*.sql; do
	files+=("${candidate}")
done
shopt -u nullglob

if [[ ${#files[@]} -eq 0 ]]; then
	echo "error: no migration files found in ${SCRIPT_DIR}" >&2
	exit 1
fi

for file in "${files[@]}"; do
	name="$(basename "${file}")"

	if [[ -n ${only} && ${name} != "${only}"* ]]; then
		continue
	fi

	if [[ ${dry_run} == true ]]; then
		echo "would apply: ${name}"
		continue
	fi

	echo "==> applying ${name}"
	psql "${uri}" -v ON_ERROR_STOP=1 --quiet -f "${file}"
done

if [[ ${dry_run} != true ]]; then
	echo "==> done"
fi
