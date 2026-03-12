"""Add webhook token, parameters schema, global vars

Revision ID: 002
Revises: 001
Create Date: 2024-01-01 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, name: str) -> bool:
    r = conn.execute(
        sa.text("SELECT COUNT(*) FROM user_tables WHERE table_name = :n"),
        {"n": name.upper()},
    )
    return r.scalar() > 0


def _col_exists(conn, table: str, col: str) -> bool:
    r = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM user_tab_columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table.upper(), "c": col.upper()},
    )
    return r.scalar() > 0


def upgrade() -> None:
    conn = op.get_bind()

    # SH_SCRIPTS: webhook_token
    if not _col_exists(conn, "SH_SCRIPTS", "webhook_token"):
        op.add_column("SH_SCRIPTS", sa.Column("webhook_token", sa.String(64)))

    # SH_SCRIPTS: parameters_schema (JSON array)
    if not _col_exists(conn, "SH_SCRIPTS", "parameters_schema"):
        op.add_column("SH_SCRIPTS", sa.Column("parameters_schema", sa.Text))

    # SH_SCRIPT_RUNS: parameters (JSON object used for this run)
    if not _col_exists(conn, "SH_SCRIPT_RUNS", "parameters"):
        op.add_column("SH_SCRIPT_RUNS", sa.Column("parameters", sa.Text))

    # SH_GLOBAL_VARS
    if not _table_exists(conn, "SH_GLOBAL_VARS"):
        op.create_table(
            "SH_GLOBAL_VARS",
            sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
            sa.Column("key", sa.String(200), nullable=False),
            sa.Column("value", sa.Text, nullable=False),
            sa.Column("description", sa.String(500)),
            sa.Column("created_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
            sa.Column("updated_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
        )
        op.create_index("idx_sh_gv_key", "SH_GLOBAL_VARS", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_sh_gv_key", "SH_GLOBAL_VARS")
    op.drop_table("SH_GLOBAL_VARS")
    op.drop_column("SH_SCRIPT_RUNS", "parameters")
    op.drop_column("SH_SCRIPTS", "parameters_schema")
    op.drop_column("SH_SCRIPTS", "webhook_token")
