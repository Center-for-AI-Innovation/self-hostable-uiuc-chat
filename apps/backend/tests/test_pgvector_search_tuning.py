"""
Unit test (no live Postgres): PgVectorStore.search must apply the same
transaction-scoped pgvector tuning as the frontend's Drizzle path
(apps/frontend/src/db/vectorSearch.ts) so both search paths have identical
recall — and must use SET LOCAL so the settings never leak onto a pooled
session (transaction-mode pooler safe).
"""

from __future__ import annotations


class _FakeCursor:
    def __init__(self):
        self.executed: list[str] = []
        self.description = [("page_content",)]

    def execute(self, sql, params=None):
        self.executed.append(sql)

    def fetchall(self):
        return []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.closed = False

    def cursor(self):
        return self._cursor

    def close(self):
        self.closed = True


class _FakeEngine:
    def __init__(self, conn):
        self._conn = conn

    def raw_connection(self):
        return self._conn


def test_search_applies_transaction_local_hnsw_tuning():
    from ai_ta_backend.database.vector_store import PgVectorStore

    cur = _FakeCursor()
    conn = _FakeConn(cur)
    store = PgVectorStore(engine=_FakeEngine(conn))

    store.search(query_embedding=[0.0, 0.1, 0.2], course_name="demo")

    assert cur.executed[0] == "SET LOCAL hnsw.iterative_scan = relaxed_order"
    assert cur.executed[1] == "SET LOCAL hnsw.ef_search = 100"
    assert "SELECT" in cur.executed[2]
    assert conn.closed
