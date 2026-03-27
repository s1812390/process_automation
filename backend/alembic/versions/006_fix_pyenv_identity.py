"""Recreate SH_PYTHON_ENVS and SH_ENV_PACKAGES with IDENTITY PKs
(consistent with all other SH_* tables)

Revision ID: 006
Revises: 005
Create Date: 2026-03-27
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table: str) -> bool:
    r = conn.execute(
        sa.text("SELECT COUNT(*) FROM user_tables WHERE table_name = :t"),
        {"t": table.upper()},
    )
    return r.scalar() > 0


def _seq_exists(conn, seq: str) -> bool:
    r = conn.execute(
        sa.text("SELECT COUNT(*) FROM user_sequences WHERE sequence_name = :s"),
        {"s": seq.upper()},
    )
    return r.scalar() > 0


def _constraint_exists(conn, constraint: str) -> bool:
    r = conn.execute(
        sa.text("SELECT COUNT(*) FROM user_constraints WHERE constraint_name = :c"),
        {"c": constraint.upper()},
    )
    return r.scalar() > 0


def upgrade() -> None:
    conn = op.get_bind()

    # Drop FK on SH_SCRIPTS.python_env_id so we can drop SH_PYTHON_ENVS
    if _constraint_exists(conn, "fk_script_pyenv"):
        conn.execute(sa.text("ALTER TABLE SH_SCRIPTS DROP CONSTRAINT fk_script_pyenv"))

    # Drop child table first
    if _table_exists(conn, "SH_ENV_PACKAGES"):
        # Drop trigger + sequence from old approach (if they exist)
        conn.execute(sa.text(
            "BEGIN EXECUTE IMMEDIATE 'DROP TRIGGER sh_env_packages_bir'; "
            "EXCEPTION WHEN OTHERS THEN NULL; END;"
        ))
        op.drop_table("SH_ENV_PACKAGES")

    if _seq_exists(conn, "sh_env_packages_seq"):
        conn.execute(sa.text("DROP SEQUENCE sh_env_packages_seq"))

    # Drop parent table
    if _table_exists(conn, "SH_PYTHON_ENVS"):
        conn.execute(sa.text(
            "BEGIN EXECUTE IMMEDIATE 'DROP TRIGGER sh_python_envs_bir'; "
            "EXCEPTION WHEN OTHERS THEN NULL; END;"
        ))
        op.drop_table("SH_PYTHON_ENVS")

    if _seq_exists(conn, "sh_python_envs_seq"):
        conn.execute(sa.text("DROP SEQUENCE sh_python_envs_seq"))

    # Recreate SH_PYTHON_ENVS with IDENTITY PK — same pattern as SH_SCRIPTS
    op.create_table(
        "SH_PYTHON_ENVS",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("python_version", sa.String(30)),
        sa.Column("path", sa.String(500)),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )
    conn.execute(
        sa.text("ALTER TABLE SH_PYTHON_ENVS ADD CONSTRAINT uq_pyenv_name UNIQUE (name)")
    )

    # Recreate SH_ENV_PACKAGES with IDENTITY PK
    op.create_table(
        "SH_ENV_PACKAGES",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("env_id", sa.Integer, nullable=False),
        sa.Column("package_name", sa.String(200), nullable=False),
        sa.Column("version", sa.String(50)),
        sa.Column("size_kb", sa.Integer),
        sa.Column("installed_at", sa.DateTime),
        sa.Column("status", sa.String(20)),
    )
    conn.execute(sa.text(
        "ALTER TABLE SH_ENV_PACKAGES ADD CONSTRAINT fk_envpkg_env "
        "FOREIGN KEY (env_id) REFERENCES SH_PYTHON_ENVS(id) ON DELETE CASCADE"
    ))

    # Re-add FK on SH_SCRIPTS
    conn.execute(sa.text(
        "ALTER TABLE SH_SCRIPTS ADD CONSTRAINT fk_script_pyenv "
        "FOREIGN KEY (python_env_id) REFERENCES SH_PYTHON_ENVS(id) ON DELETE SET NULL"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    if _constraint_exists(conn, "fk_script_pyenv"):
        conn.execute(sa.text("ALTER TABLE SH_SCRIPTS DROP CONSTRAINT fk_script_pyenv"))
    if _table_exists(conn, "SH_ENV_PACKAGES"):
        op.drop_table("SH_ENV_PACKAGES")
    if _table_exists(conn, "SH_PYTHON_ENVS"):
        op.drop_table("SH_PYTHON_ENVS")
