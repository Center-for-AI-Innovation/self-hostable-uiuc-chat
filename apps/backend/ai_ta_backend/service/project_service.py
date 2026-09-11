import json
import os
import re

import redis
from injector import inject

from ai_ta_backend.database.sql import SQLDatabase
from ai_ta_backend.service.posthog_service import PosthogService
from ai_ta_backend.service.sentry_service import SentryService
from ai_ta_backend.utils.crypto import encrypt_if_needed
from ai_ta_backend.utils.schema_generation import (
    DEFAULT_SCHEMA, generate_schema_from_project_description)

# Project names double as URL path segments and exact-match keys in Redis and
# Postgres, so new names are restricted to URL-safe characters. Keep in sync
# with PROJECT_NAME_PATTERN in apps/frontend/src/utils/projectName.ts.
# fullmatch (not match with '$') — Python's '$' also matches before a trailing
# newline, which would let names like "my-bot\n" through.
# Dots are allowed except as the first character: the frontend's
# buildProjectChatPath strips leading dots, so a leading-dot name would
# diverge from its URL segment.
PROJECT_NAME_PATTERN = re.compile(r'[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,63}')


def is_valid_project_name(project_name: str) -> bool:
    return bool(PROJECT_NAME_PATTERN.fullmatch(project_name))


def get_default_course_admins() -> list:
    """Parse DEFAULT_COURSE_ADMINS (comma-separated emails) into a deduped list."""
    raw = os.getenv('DEFAULT_COURSE_ADMINS', '')
    admins = []
    for part in raw.split(','):
        email = part.strip().lower()
        if email and email not in admins:
            admins.append(email)
    return admins


class ProjectAlreadyExistsError(Exception):
    """Raised when a project with the given name already exists."""


class ProjectService:
    """
      This class contains all methods related to project management.
      """

    @inject
    def __init__(self, sql_db: SQLDatabase, posthog_service: PosthogService, sentry_service: SentryService):
        self.sqlDb = sql_db
        self.posthog = posthog_service
        self.sentry = sentry_service

        print("Connecting to Redis... with url: ", os.environ['REDIS_URL'])
        self.redis_client = redis.Redis.from_url(os.environ['REDIS_URL'], db=0)

    def generate_json_schema(self, project_name: str, project_description: str | None) -> None:
        """
        Background task: the `projects` row already exists (inserted by
        create_project with the default schema); this only updates the
        metadata schema once LLM generation finishes. The caller discards
        the Future, so failures must be reported here.
        """
        try:
            json_schema = generate_schema_from_project_description(project_name, project_description)
            self.sqlDb.updateProjects(project_name, {"metadata_schema": json_schema})
        except Exception as e:
            print(f"Error in generate_json_schema for '{project_name}': ", e)
            self.sentry.capture_exception(e)

    def create_project(self, project_name: str, project_description: str | None, project_owner_email: str,
                       is_private: bool = False, allow_logged_in_users: bool = False) -> None:
        """
            Create a project:
            1. Insert the `projects` row synchronously with the default metadata
               schema (the background LLM task only updates the schema later).
            2. Write course metadata to Redis — the write that makes the project
               "live" for the frontend, done last so a live project can never
               lack its database row.
            Raises ProjectAlreadyExistsError for duplicates, and any underlying
            exception on failure (mapped to HTTP statuses by the route).
            """
        if self.redis_client.hexists('course_metadatas', project_name):
            raise ProjectAlreadyExistsError(f"A project named '{project_name}' already exists.")

        try:
            # A retry after a partial failure may find the row already inserted.
            if not self.sqlDb.getProjectByName(project_name):
                sql_row = {
                    "course_name": project_name,
                    "description": project_description if project_description else None,
                    "metadata_schema": DEFAULT_SCHEMA,
                }
                if not self.sqlDb.insertProject(sql_row):
                    raise RuntimeError(f"Database insert failed for project '{project_name}'")

            value = {
                "is_private": is_private,
                "course_owner": project_owner_email,
                "course_admins": get_default_course_admins(),
                "approved_emails_list": None,
                "example_questions": None,
                "banner_image_s3": None,
                "course_intro_message": None,
                "openai_api_key": None,
                "system_prompt": None,
                "disabled_models": None,
                "project_description": project_description if project_description else None,
                "allow_logged_in_users": allow_logged_in_users if allow_logged_in_users else None,
            }

            # Set course_metadatas
            print("Setting course_metadatas. value: ", value)
            self.redis_client.hset('course_metadatas', key=project_name, value=json.dumps(value))
        except Exception as e:
            print("Error in create_project: ", e)
            self.sentry.capture_exception(e)
            raise

        # Optional convenience write; the project is already live, so failures
        # here must not fail the request (a retry would 409 on the own project).
        try:
            # check if the project owner has pre-assigned API keys
            if project_owner_email:
                pre_assigned_response = self.sqlDb.getPreAssignedAPIKeys(project_owner_email)
                if pre_assigned_response and hasattr(pre_assigned_response, 'data') and pre_assigned_response.data:
                    redis_key = project_name + "-llms"
                    llm_val = {
                        "defaultModel": None,
                        "defaultTemp": None,
                    }
                    # pre-assigned key exists
                    for row in pre_assigned_response.data:
                        # encrypt JUST the API keys field, which is row['providerBodyNoModels']['apiKey]
                        row['providerBodyNoModels']['apiKey'] = encrypt_if_needed(row['providerBodyNoModels']['apiKey'])
                        llm_val[row['providerName']] = row['providerBodyNoModels']

                    print(f"Setting -llms default values. Key: `{redis_key}`, value: `{llm_val}`")
                    self.redis_client.set(redis_key, json.dumps(llm_val))
        except Exception as e:
            print("Error setting pre-assigned LLM keys in create_project: ", e)
            self.sentry.capture_exception(e)
