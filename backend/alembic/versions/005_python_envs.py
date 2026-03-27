"""Add SH_PYTHON_ENVS, SH_ENV_PACKAGES, and python_env_id on SH_SCRIPTS

Revision ID: 005
Revises: 004
Create Date: 2026-03-27 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table: str) -> bool:
    r = conn.execute(
        sa.text("SELECT COUNT(*) FROM user_tables WHERE table_name = :t"),
        {"t": table.upper()},
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

    # --- SH_PYTHON_ENVS ---
    if not _table_exists(conn, "SH_PYTHON_ENVS"):
        op.create_table(
            "SH_PYTHON_ENVS",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.String(500)),
            sa.Column("python_version", sa.String(30)),
            sa.Column("path", sa.String(500)),
            sa.Column("created_at", sa.DateTime),
            sa.Column("updated_at", sa.DateTime),
        )
        # Unique constraint on name
        conn.execute(
            sa.text(
                "ALTER TABLE SH_PYTHON_ENVS ADD CONSTRAINT uq_pyenv_name UNIQUE (name)"
            )
        )
        # Sequence + trigger for auto-increment PK (Oracle 12c compatible)
        conn.execute(sa.text("CREATE SEQUENCE sh_python_envs_seq START WITH 1 INCREMENT BY 1"))
        conn.execute(sa.text(
            "CREATE OR REPLACE TRIGGER sh_python_envs_bir "
            "BEFORE INSERT ON SH_PYTHON_ENVS FOR EACH ROW "
            "BEGIN "
            "  IF :NEW.id IS NULL THEN "
            "    SELECT sh_python_envs_seq.NEXTVAL INTO :NEW.id FROM dual; "
            "  END IF; "
            "END;"
        ))

    # --- SH_ENV_PACKAGES ---
    if not _table_exists(conn, "SH_ENV_PACKAGES"):
        op.create_table(
            "SH_ENV_PACKAGES",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("env_id", sa.Integer, nullable=False),
            sa.Column("package_name", sa.String(200), nullable=False),
            sa.Column("version", sa.String(50)),
            sa.Column("size_kb", sa.Integer),
            sa.Column("installed_at", sa.DateTime),
            sa.Column("status", sa.String(20)),  # installing / installed / failed
        )
        conn.execute(sa.text(
            "ALTER TABLE SH_ENV_PACKAGES ADD CONSTRAINT fk_envpkg_env "
            "FOREIGN KEY (env_id) REFERENCES SH_PYTHON_ENVS(id) ON DELETE CASCADE"
        ))
        conn.execute(sa.text("CREATE SEQUENCE sh_env_packages_seq START WITH 1 INCREMENT BY 1"))
        conn.execute(sa.text(
            "CREATE OR REPLACE TRIGGER sh_env_packages_bir "
            "BEFORE INSERT ON SH_ENV_PACKAGES FOR EACH ROW "
            "BEGIN "
            "  IF :NEW.id IS NULL THEN "
            "    SELECT sh_env_packages_seq.NEXTVAL INTO :NEW.id FROM dual; "
            "  END IF; "
            "END;"
        ))

    # --- python_env_id on SH_SCRIPTS ---
    if not _col_exists(conn, "SH_SCRIPTS", "python_env_id"):
        op.add_column("SH_SCRIPTS", sa.Column("python_env_id", sa.Integer))
        conn.execute(sa.text(
            "ALTER TABLE SH_SCRIPTS ADD CONSTRAINT fk_script_pyenv "
            "FOREIGN KEY (python_env_id) REFERENCES SH_PYTHON_ENVS(id) ON DELETE SET NULL"
        ))


def downgrade() -> None:
    conn = op.get_bind()
    if _col_exists(conn, "SH_SCRIPTS", "python_env_id"):
        conn.execute(sa.text(
            "ALTER TABLE SH_SCRIPTS DROP CONSTRAINT fk_script_pyenv"
        ))
        op.drop_column("SH_SCRIPTS", "python_env_id")
    if _table_exists(conn, "SH_ENV_PACKAGES"):
        op.drop_table("SH_ENV_PACKAGES")
        conn.execute(sa.text("DROP SEQUENCE sh_env_packages_seq"))
    if _table_exists(conn, "SH_PYTHON_ENVS"):
        op.drop_table("SH_PYTHON_ENVS")
        conn.execute(sa.text("DROP SEQUENCE sh_python_envs_seq"))
