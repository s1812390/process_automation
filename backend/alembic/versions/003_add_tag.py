"""Add tag column to SH_SCRIPTS

Revision ID: 003
Revises: 002
Create Date: 2024-01-01 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
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

    # SH_SCRIPTS: tag (optional category label)
    if not _col_exists(conn, "SH_SCRIPTS", "tag"):
        op.add_column("SH_SCRIPTS", sa.Column("tag", sa.String(100)))


def downgrade() -> None:
    op.drop_column("SH_SCRIPTS", "tag")
