#!/usr/bin/env python3
"""
external_connections_cli.py — CLI for the frontend's project-external-
connections CRUD endpoints (populates the HOST database).

Talks to the Next.js routes wrapped by `withSuperAdminOnly`:

  GET    /api/UIUC-api/projectConnections?project_name=<name>
  POST   /api/UIUC-api/projectConnections           (upsert one kind)
  DELETE /api/UIUC-api/projectConnections?project_name=<name>&kind=<kind>
  PATCH  /api/UIUC-api/projectConnections/active    (toggle is_active)
  POST   /api/UIUC-api/projectConnections/test      (probe without persisting)

Configuration lives in `.external.env` next to this script (gitignored) —
copy `.external.env.template` and fill in real values. Nothing sensitive is
hard-coded here; already-exported environment variables take precedence over
the file.

Auth: the frontend `withAuth` middleware reads the JWT from the
`access_token` cookie and validates it against Keycloak's JWKS. The caller's
email must additionally be in the super-admin allowlist
(`src/utils/superAdmins.ts` + `SUPER_ADMIN_EMAILS` env). Grab a token from
your browser (DevTools → Application → Cookies → `access_token`) and set
ACCESS_TOKEN in `.external.env`, or pass --token.

Usage:
  python3 external_connections_cli.py get [project_name]
  python3 external_connections_cli.py upsert <kind> [env|<json>|@file.json] [--project <name>]
  python3 external_connections_cli.py delete [project_name] [--kind s3|database|qdrant|embedding]
  python3 external_connections_cli.py set-active [project_name] --active true|false
  python3 external_connections_cli.py test <kind> [env|<json>|@file.json]

Positional project names fall back to EXT_PROJECT_NAME from `.external.env`.

`kind` is one of: s3 | database | qdrant | embedding.
The config argument defaults to `env`, which builds the config block for that
kind from the EXT_* variables in `.external.env` (see the template). It can
also be a literal JSON object, or `@path/to/file.json` to read one from disk.

The frontend handles encryption server-side; this script never touches the
ENCRYPTION_MASTER_KEY.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    raise SystemExit(
        "[error] python-dotenv is required. Install with:\n"
        "  pip install -r requirements.txt"
    )

SCRIPT_DIR = Path(__file__).resolve().parent
ENV_FILE = Path(os.environ.get("EXTERNAL_ENV_FILE", SCRIPT_DIR / ".external.env"))

# Exported environment variables take precedence over the file (dotenv does
# not override existing keys by default).
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
else:
    print(
        f"[warn] {ENV_FILE} not found. Copy .external.env.template to "
        ".external.env and fill in real values, or export the variables "
        "yourself. Continuing with process env only.",
        file=sys.stderr,
    )

BASE_URL = os.environ.get("EXT_CONN_BASE_URL", "http://localhost:3000")
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "")
PROJECT_NAME = os.environ.get("EXT_PROJECT_NAME", "")

ENDPOINT = "/api/UIUC-api/projectConnections"
ENDPOINT_ACTIVE = "/api/UIUC-api/projectConnections/active"
ENDPOINT_TEST = "/api/UIUC-api/projectConnections/test"

ALL_KINDS = ("s3", "database", "qdrant", "embedding")

# ---------------------------------------------------------------------------
# Config blocks built from .external.env. Field shapes match:
#   - apps/frontend/src/utils/projectConnections/validation.ts
#   - apps/frontend/src/utils/connectionManager.ts
#   - apps/backend/docs/developers/external-connections-config.md
# Optional keys are included only when the corresponding variable is set.
# ---------------------------------------------------------------------------


def _env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


_TRUE_WORDS = ("1", "true", "yes", "on")
_FALSE_WORDS = ("0", "false", "no", "off")


def _parse_bool(value: str, label: str) -> bool:
    """Strict boolean parse. Anything outside the two word lists is an error.

    A loose `value in TRUE_WORDS` check silently turns typos (`ture`, `flase`,
    `None`) into False, which for knobs like `parallel` / `use_filter` is
    the less-restrictive direction — fail closed instead.
    """
    lowered = value.strip().lower()
    if lowered in _TRUE_WORDS:
        return True
    if lowered in _FALSE_WORDS:
        return False
    raise SystemExit(
        f"[error] {label} must be one of {'/'.join(_TRUE_WORDS)} or "
        f"{'/'.join(_FALSE_WORDS)}, got {value!r}."
    )


def _env_bool(var: str) -> bool | None:
    value = _env(var)
    return None if value is None else _parse_bool(value, var)


def _env_int(var: str, *, positive: bool = True) -> int | None:
    value = _env(var)
    if value is None:
        return None
    try:
        parsed = int(value)
    except ValueError:
        raise SystemExit(f"[error] {var} must be an integer, got {value!r}.")
    if positive and parsed <= 0:
        raise SystemExit(f"[error] {var} must be a positive integer, got {parsed}.")
    return parsed


# Mirrors RESULT_PROCESSORS in apps/backend/ai_ta_backend/database/vector.py.
# The backend silently ignores an unknown processor key and the server-side
# schema accepts any string, so this is the only place a typo gets caught.
KNOWN_PROCESSORS = ("pubmed", "patents", "ncbi_books", "clinical_trials")
# Mirrors qdrantCollectionEntrySchema in validation.ts. `z.object()` strips
# unknown keys on upsert, so a misspelled key would vanish without a trace.
COLLECTION_ENTRY_KEYS = ("name", "top_n", "use_filter", "processor")


def _validate_collection_entry(entry: dict, index: int) -> dict:
    """Type-check one EXT_QDRANT_COLLECTIONS JSON entry against the schema."""
    where = f"EXT_QDRANT_COLLECTIONS[{index}]"

    unknown = sorted(set(entry) - set(COLLECTION_ENTRY_KEYS))
    if unknown:
        raise SystemExit(
            f"[error] {where} has unknown key(s) {unknown}; allowed: "
            f"{list(COLLECTION_ENTRY_KEYS)}. The server drops unknown keys silently."
        )

    name = entry.get("name")
    if not isinstance(name, str) or not name.strip():
        raise SystemExit(f'[error] {where} needs a non-empty string "name".')
    entry["name"] = name.strip()

    if "top_n" in entry:
        top_n = entry["top_n"]
        # bool is an int subclass — `true` must not pass as 1.
        if isinstance(top_n, bool) or not isinstance(top_n, int) or top_n <= 0:
            raise SystemExit(
                f"[error] {where}.top_n must be a positive integer, got {top_n!r}."
            )

    if "use_filter" in entry and not isinstance(entry["use_filter"], bool):
        raise SystemExit(
            f"[error] {where}.use_filter must be JSON true/false, "
            f"got {entry['use_filter']!r}."
        )

    if "processor" in entry:
        processor = entry["processor"]
        if not isinstance(processor, str) or processor not in KNOWN_PROCESSORS:
            raise SystemExit(
                f"[error] {where}.processor must be one of "
                f"{'|'.join(KNOWN_PROCESSORS)}, got {processor!r}."
            )

    return entry


def _reject_duplicate_names(entries: list[dict]) -> None:
    seen: set[str] = set()
    for entry in entries:
        if entry["name"] in seen:
            raise SystemExit(
                f"[error] EXT_QDRANT_COLLECTIONS lists {entry['name']!r} more than once."
            )
        seen.add(entry["name"])


def _parse_qdrant_collections(raw: str) -> list[dict]:
    """Parse EXT_QDRANT_COLLECTIONS into `qdrant_config.collections` entries.

    Accepts either:
      - a comma-separated list of names: `pubmed-articles,us-patents`
      - a JSON array of entry objects for per-collection configs:
        `[{"name": "pubmed-articles", "top_n": 50, "use_filter": false,
           "processor": "pubmed"}]`

    The server-side schema requires each entry to be an object with a `name`
    (bare strings are rejected), so the comma form is expanded here.
    """
    raw = raw.strip()
    if raw.startswith("["):
        try:
            entries = json.loads(raw)
        except json.JSONDecodeError as e:
            raise SystemExit(f"[error] EXT_QDRANT_COLLECTIONS is not valid JSON: {e}")
        if not isinstance(entries, list) or not all(
            isinstance(entry, dict) for entry in entries
        ):
            raise SystemExit(
                "[error] EXT_QDRANT_COLLECTIONS JSON must be an array of objects, "
                'e.g. [{"name": "pubmed-articles", "top_n": 50}]'
            )
        entries = [_validate_collection_entry(e, i) for i, e in enumerate(entries)]
        _reject_duplicate_names(entries)
        return entries
    entries = [{"name": name.strip()} for name in raw.split(",") if name.strip()]
    _reject_duplicate_names(entries)
    return entries


def _build_config_from_env(kind: str) -> dict:
    def require(field: str, var: str) -> str:
        value = _env(var)
        if value is None:
            raise SystemExit(
                f"[error] {kind} config requires {var} — set it in {ENV_FILE} "
                "(see .external.env.template)."
            )
        return value

    if kind == "s3":
        # For MinIO set EXT_S3_ENDPOINT_URL; the frontend sets forcePathStyle.
        config: dict[str, Any] = {
            "aws_access_key_id": require("aws_access_key_id", "EXT_S3_ACCESS_KEY_ID"),
            "aws_secret_access_key": require(
                "aws_secret_access_key", "EXT_S3_SECRET_ACCESS_KEY"
            ),
        }
        for field, var in (
            ("bucket_name", "EXT_S3_BUCKET_NAME"),
            ("endpoint_url", "EXT_S3_ENDPOINT_URL"),
            ("region", "EXT_S3_REGION"),
        ):
            if _env(var) is not None:
                config[field] = _env(var)
        return config

    if kind == "database":
        # When set with no qdrant config, the same external Postgres also
        # stores embeddings via pgvector — provision it first with
        # infra/db/provision_external_pgvector_store.sql.
        return {"connection_uri": require("connection_uri", "EXT_DATABASE_CONNECTION_URI")}

    if kind == "qdrant":
        # The URL's scheme picks http vs https. `default_collection` is the
        # project's primary collection — all ingest writes go there.
        config = {
            "url": require("url", "EXT_QDRANT_URL"),
            "api_key": require("api_key", "EXT_QDRANT_API_KEY"),
        }
        port = _env_int("EXT_QDRANT_PORT")
        if port is not None:
            config["port"] = port
        if _env("EXT_QDRANT_DEFAULT_COLLECTION") is not None:
            config["default_collection"] = _env("EXT_QDRANT_DEFAULT_COLLECTION")
        # Optional read-side fan-out across additional collections. Ingest
        # writes still go only to default_collection.
        if _env("EXT_QDRANT_COLLECTIONS") is not None:
            collections = _parse_qdrant_collections(_env("EXT_QDRANT_COLLECTIONS"))
            if collections:
                config["collections"] = collections
        # apply_course_filter: when false, search omits the course_name
        # payload constraint (shared corpora like pubmed). Backend defaults
        # to true when omitted.
        for field, var in (
            ("parallel", "EXT_QDRANT_PARALLEL"),
            ("sort_combined", "EXT_QDRANT_SORT_COMBINED"),
            ("apply_course_filter", "EXT_QDRANT_APPLY_COURSE_FILTER"),
        ):
            flag = _env_bool(var)
            if flag is not None:
                config[field] = flag
        return config

    if kind == "embedding":
        # provider must be in the server's allow-list (default: openai, ollama).
        # For ollama, EXT_EMBEDDING_BASE_URL is required by server-side validation.
        config = {
            "provider": require("provider", "EXT_EMBEDDING_PROVIDER"),
            "model": require("model", "EXT_EMBEDDING_MODEL"),
        }
        for field, var in (
            ("api_key", "EXT_EMBEDDING_API_KEY"),
            ("api_base", "EXT_EMBEDDING_API_BASE"),
            ("base_url", "EXT_EMBEDDING_BASE_URL"),
            ("query_instruction", "EXT_EMBEDDING_QUERY_INSTRUCTION"),
        ):
            if _env(var) is not None:
                config[field] = _env(var)
        return config

    raise SystemExit(f"unknown kind: {kind}. Allowed: {ALL_KINDS}")


# --- HTTP --------------------------------------------------------------------


def _request(method: str, path: str, *, params=None, body=None, token=None):
    """Tiny stdlib HTTP client — no extra runtime deps beyond dotenv."""
    import urllib.error
    import urllib.request

    url = BASE_URL.rstrip("/") + path
    if params:
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})

    headers = {
        "Content-Type": "application/json",
        "Cookie": f"access_token={token or ACCESS_TOKEN}",
    }
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            payload = resp.read().decode("utf-8")
            return resp.status, _maybe_json(payload)
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="replace")
        return e.code, _maybe_json(payload)
    except urllib.error.URLError as e:
        raise SystemExit(
            f"[error] could not reach {url}: {e.reason}. "
            "Is the Next.js dev server running (npm run local)?"
        )


def _maybe_json(s: str) -> Any:
    if not s:
        return None
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return s


def _print_result(status: int, body: Any) -> int:
    # Surface server advisories (e.g. "Supabase session-mode URI — use the
    # transaction pooler on port 6543") prominently on stderr in addition to
    # the raw JSON body.
    if isinstance(body, dict) and body.get("warning"):
        print(f"WARNING: {body['warning']}", file=sys.stderr)
    print(json.dumps({"status": status, "body": body}, indent=2, default=str))
    return 0 if 200 <= status < 300 else 1


def _load_config_arg(raw: str, kind: str | None = None) -> dict:
    """Resolve the `config` CLI arg into a dict.

    Accepts:
      - `env` (literal)      — build the block for <kind> from .external.env.
      - `@path/to/file.json` — read JSON from disk.
      - otherwise            — parse as a JSON literal.
    """
    if raw == "env":
        if kind is None or kind not in ALL_KINDS:
            raise SystemExit(f"`env` keyword requires kind to be one of {ALL_KINDS}")
        return _build_config_from_env(kind)
    if raw.startswith("@"):
        with open(raw[1:], "r") as f:
            obj = json.load(f)
    else:
        obj = json.loads(raw)
    if not isinstance(obj, dict):
        raise SystemExit("config must be a JSON object")
    return obj


# --- Commands ----------------------------------------------------------------


def _require_project(name: str) -> str:
    if not name:
        raise SystemExit(
            "[error] no project name given — pass it on the command line or "
            f"set EXT_PROJECT_NAME in {ENV_FILE}."
        )
    return name


def cmd_get(args) -> int:
    project = _require_project(args.project_name)
    status, body = _request("GET", ENDPOINT, params={"project_name": project})
    return _print_result(status, body)


def cmd_upsert(args) -> int:
    project = _require_project(args.project or PROJECT_NAME)
    config = _load_config_arg(args.config, args.kind)
    status, body = _request(
        "POST",
        ENDPOINT,
        body={"project_name": project, "kind": args.kind, "config": config},
    )
    return _print_result(status, body)


def cmd_delete(args) -> int:
    project = _require_project(args.project_name)
    params = {"project_name": project}
    if args.kind is not None:
        params["kind"] = args.kind
    status, body = _request("DELETE", ENDPOINT, params=params)
    return _print_result(status, body)


def cmd_set_active(args) -> int:
    project = _require_project(args.project_name)
    is_active = _parse_bool(args.active, "--active")
    status, body = _request(
        "PATCH",
        ENDPOINT_ACTIVE,
        body={"project_name": project, "is_active": is_active},
    )
    return _print_result(status, body)


def cmd_test(args) -> int:
    if args.stored:
        # Probe the config already saved for the project (decrypted
        # server-side) instead of building one from env/args.
        project = _require_project(args.project or PROJECT_NAME)
        status, body = _request(
            "POST",
            ENDPOINT_TEST,
            body={"kind": args.kind, "project_name": project},
        )
        return _print_result(status, body)
    config = _load_config_arg(args.config, args.kind)
    status, body = _request(
        "POST",
        ENDPOINT_TEST,
        body={"kind": args.kind, "config": config},
    )
    return _print_result(status, body)


# --- main --------------------------------------------------------------------


def main() -> int:
    global ACCESS_TOKEN, BASE_URL

    p = argparse.ArgumentParser(prog="external_connections_cli")
    p.add_argument(
        "--token",
        default=None,
        help="Override access_token cookie value (else ACCESS_TOKEN from .external.env).",
    )
    p.add_argument(
        "--base-url",
        default=None,
        help=f"Override Next.js base URL (default {BASE_URL}).",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("get", help="GET a project's connections (masked secrets)")
    g.add_argument("project_name", nargs="?", default=PROJECT_NAME)

    u = sub.add_parser("upsert", help="POST upsert one connection kind")
    u.add_argument("kind", choices=ALL_KINDS)
    u.add_argument(
        "--project",
        default=None,
        help="Project (course) name; defaults to EXT_PROJECT_NAME from .external.env.",
    )
    u.add_argument(
        "config",
        nargs="?",
        default="env",
        help="`env` (default, built from .external.env), "
        "a JSON object literal, or @path/to/file.json",
    )

    d = sub.add_parser("delete", help="DELETE a row, or NULL one kind")
    d.add_argument("project_name", nargs="?", default=PROJECT_NAME)
    d.add_argument(
        "--kind",
        choices=ALL_KINDS,
        default=None,
        help="If omitted, the entire row is deleted.",
    )

    a = sub.add_parser("set-active", help="PATCH /active — toggle is_active")
    a.add_argument("project_name", nargs="?", default=PROJECT_NAME)
    a.add_argument(
        "--active",
        required=True,
        help="true|false|1|0|yes|no|on|off — sets project_external_connections.is_active.",
    )

    t = sub.add_parser("test", help="POST /test — probe without persisting")
    t.add_argument("kind", choices=ALL_KINDS)
    t.add_argument(
        "config",
        nargs="?",
        default="env",
        help="`env` (default, built from .external.env), "
        "a JSON object literal, or @path/to/file.json. Ignored with --stored.",
    )
    t.add_argument(
        "--stored",
        action="store_true",
        help="Probe the config already saved for the project instead of a "
        "supplied one (uses --project / EXT_PROJECT_NAME).",
    )
    t.add_argument(
        "--project",
        default=None,
        help="Project name for --stored; defaults to EXT_PROJECT_NAME from .external.env.",
    )

    args = p.parse_args()

    # Late overrides from top-level flags so subcommand handlers see them.
    if args.token:
        ACCESS_TOKEN = args.token
    if args.base_url:
        BASE_URL = args.base_url

    if not ACCESS_TOKEN:
        print(
            "[warn] ACCESS_TOKEN unset. Grab it from your browser cookies "
            "(DevTools → Application → Cookies → access_token) and set it in "
            f"{ENV_FILE} or pass --token. Requests will 401.",
            file=sys.stderr,
        )

    dispatch = {
        "get": cmd_get,
        "upsert": cmd_upsert,
        "delete": cmd_delete,
        "set-active": cmd_set_active,
        "test": cmd_test,
    }
    return dispatch[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
