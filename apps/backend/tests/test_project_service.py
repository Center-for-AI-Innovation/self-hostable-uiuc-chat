"""
Unit tests for ProjectService.create_project / generate_json_schema and the
project-name validator (issue #91).

These tests avoid the heavy ``ProjectService.__init__`` (env-dependent Redis
connection, injected services) by allocating the instance with
``object.__new__`` and wiring mock ``sqlDb`` / ``sentry`` / ``redis_client``
fields directly, mirroring the pattern used by the other unit tests here.

Coverage:
  - is_valid_project_name: charset, length, and the Python ``$``-newline trap.
  - get_default_course_admins: parsing of DEFAULT_COURSE_ADMINS.
  - create_project: inserts the projects row with DEFAULT_SCHEMA before the
    Redis hset; duplicate names raise ProjectAlreadyExistsError; DB insert
    failure raises before any Redis write; retries skip the insert but still
    write Redis; pre-assigned-LLM-key failures do not fail the request.
  - generate_json_schema: updates (never inserts) the projects row.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from ai_ta_backend.service.project_service import (
    ProjectAlreadyExistsError,
    ProjectService,
    get_default_course_admins,
    is_valid_project_name,
)
from ai_ta_backend.utils.schema_generation import DEFAULT_SCHEMA


def make_service() -> ProjectService:
    service = object.__new__(ProjectService)
    service.sqlDb = MagicMock()
    service.posthog = MagicMock()
    service.sentry = MagicMock()
    service.redis_client = MagicMock()
    return service


# ---------------------------------------------------------------------------
# is_valid_project_name
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    ["my-bot_2", "CropWizard", "cropwizard-1.5", "trailing.", "a", "a" * 64],
)
def test_valid_project_names(name):
    assert is_valid_project_name(name)


@pytest.mark.parametrize(
    "name",
    [
        "",
        "has space",
        "héllo",
        "a/b",
        "a" * 65,
        "my-bot\n",  # Python's '$' would match before the newline; fullmatch must not
        ".hidden",  # leading dot diverges from the URL segment (stripped by buildProjectChatPath)
        ".",
        "..",
    ],
)
def test_invalid_project_names(name):
    assert not is_valid_project_name(name)


# ---------------------------------------------------------------------------
# get_default_course_admins
# ---------------------------------------------------------------------------


def test_default_course_admins_unset(monkeypatch):
    monkeypatch.delenv("DEFAULT_COURSE_ADMINS", raising=False)
    assert get_default_course_admins() == []


def test_default_course_admins_parses_and_dedupes(monkeypatch):
    monkeypatch.setenv("DEFAULT_COURSE_ADMINS", " A@x.edu, b@y.edu ,a@x.edu,, ")
    assert get_default_course_admins() == ["a@x.edu", "b@y.edu"]


# ---------------------------------------------------------------------------
# create_project
# ---------------------------------------------------------------------------


def test_create_project_inserts_row_before_redis():
    service = make_service()
    service.redis_client.hexists.return_value = False
    service.sqlDb.getProjectByName.return_value = None
    service.sqlDb.insertProject.return_value = True
    service.sqlDb.getPreAssignedAPIKeys.return_value = None

    call_order = []
    service.sqlDb.insertProject.side_effect = lambda row: call_order.append("insert") or True
    service.redis_client.hset.side_effect = lambda *a, **k: call_order.append("hset")

    service.create_project("my-bot", "a description", "owner@example.com")

    assert call_order == ["insert", "hset"]
    inserted_row = service.sqlDb.insertProject.call_args.args[0]
    assert inserted_row["course_name"] == "my-bot"
    assert inserted_row["description"] == "a description"
    assert inserted_row["metadata_schema"] == DEFAULT_SCHEMA
    assert service.redis_client.hset.call_args.kwargs["key"] == "my-bot"


def test_create_project_duplicate_raises_409_error():
    service = make_service()
    service.redis_client.hexists.return_value = True

    with pytest.raises(ProjectAlreadyExistsError):
        service.create_project("my-bot", None, "owner@example.com")

    service.sqlDb.insertProject.assert_not_called()
    service.redis_client.hset.assert_not_called()


def test_create_project_db_failure_raises_before_redis():
    service = make_service()
    service.redis_client.hexists.return_value = False
    service.sqlDb.getProjectByName.return_value = None
    service.sqlDb.insertProject.return_value = False

    with pytest.raises(RuntimeError):
        service.create_project("my-bot", None, "owner@example.com")

    service.redis_client.hset.assert_not_called()
    service.sentry.capture_exception.assert_called_once()


def test_create_project_retry_skips_insert_but_writes_redis():
    service = make_service()
    service.redis_client.hexists.return_value = False
    service.sqlDb.getProjectByName.return_value = {"course_name": "my-bot"}
    service.sqlDb.getPreAssignedAPIKeys.return_value = None

    service.create_project("my-bot", None, "owner@example.com")

    service.sqlDb.insertProject.assert_not_called()
    service.redis_client.hset.assert_called_once()


def test_create_project_llm_keys_failure_is_non_fatal():
    service = make_service()
    service.redis_client.hexists.return_value = False
    service.sqlDb.getProjectByName.return_value = None
    service.sqlDb.insertProject.return_value = True
    service.sqlDb.getPreAssignedAPIKeys.side_effect = RuntimeError("optional write blew up")

    # Must not raise: the project is already live once hset completes.
    service.create_project("my-bot", None, "owner@example.com")

    service.redis_client.hset.assert_called_once()
    service.sentry.capture_exception.assert_called_once()


def test_create_project_uses_default_course_admins(monkeypatch):
    import json

    monkeypatch.setenv("DEFAULT_COURSE_ADMINS", "admin@x.edu")
    service = make_service()
    service.redis_client.hexists.return_value = False
    service.sqlDb.getProjectByName.return_value = None
    service.sqlDb.insertProject.return_value = True
    service.sqlDb.getPreAssignedAPIKeys.return_value = None

    service.create_project("my-bot", None, "owner@example.com")

    metadata = json.loads(service.redis_client.hset.call_args.kwargs["value"])
    assert metadata["course_admins"] == ["admin@x.edu"]
    assert metadata["course_owner"] == "owner@example.com"


# ---------------------------------------------------------------------------
# generate_json_schema
# ---------------------------------------------------------------------------


def test_generate_json_schema_updates_not_inserts():
    service = make_service()
    generated = {"field": {"type": "string"}}

    with patch(
        "ai_ta_backend.service.project_service.generate_schema_from_project_description",
        return_value=generated,
    ):
        service.generate_json_schema("my-bot", "a description")

    service.sqlDb.updateProjects.assert_called_once_with("my-bot", {"metadata_schema": generated})
    service.sqlDb.insertProject.assert_not_called()


def test_generate_json_schema_reports_failures():
    service = make_service()

    with patch(
        "ai_ta_backend.service.project_service.generate_schema_from_project_description",
        side_effect=RuntimeError("ollama down"),
    ):
        # Must not raise: the route discards the Future, so this logs + reports.
        service.generate_json_schema("my-bot", "a description")

    service.sentry.capture_exception.assert_called_once()
    service.sqlDb.updateProjects.assert_not_called()
