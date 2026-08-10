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
        if _env("EXT_QDRANT_PORT") is not None:
            config["port"] = int(_env("EXT_QDRANT_PORT"))  # type: ignore[arg-type]
        if _env("EXT_QDRANT_DEFAULT_COLLECTION") is not None:
            config["default_collection"] = _env("EXT_QDRANT_DEFAULT_COLLECTION")
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
    is_active = args.active.lower() in ("1", "true", "yes", "on")
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
        help="true|false|1|0|yes|no — sets project_external_connections.is_active.",
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
