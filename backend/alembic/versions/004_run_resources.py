"""Add peak_ram_mb and avg_cpu_percent to SH_SCRIPT_RUNS

Revision ID: 004
Revises: 003
Create Date: 2026-03-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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

    if not _col_exists(conn, "SH_SCRIPT_RUNS", "peak_ram_mb"):
        op.add_column("SH_SCRIPT_RUNS", sa.Column("peak_ram_mb", sa.Integer))

    if not _col_exists(conn, "SH_SCRIPT_RUNS", "avg_cpu_percent"):
        op.add_column("SH_SCRIPT_RUNS", sa.Column("avg_cpu_percent", sa.Integer))


def downgrade() -> None:
    op.drop_column("SH_SCRIPT_RUNS", "avg_cpu_percent")
    op.drop_column("SH_SCRIPT_RUNS", "peak_ram_mb")
