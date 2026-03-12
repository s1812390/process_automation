"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SH_APP_SETTINGS
    op.create_table(
        "SH_APP_SETTINGS",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.String(4000), nullable=True),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
    )

    # Insert default settings
    op.execute("INSERT INTO SH_APP_SETTINGS (key, value) VALUES ('max_concurrent_workers', '2')")
    op.execute("INSERT INTO SH_APP_SETTINGS (key, value) VALUES ('default_timeout_seconds', '3600')")
    op.execute("INSERT INTO SH_APP_SETTINGS (key, value) VALUES ('default_max_retries', '0')")
    op.execute("INSERT INTO SH_APP_SETTINGS (key, value) VALUES ('default_cpu_cores', NULL)")
    op.execute("INSERT INTO SH_APP_SETTINGS (key, value) VALUES ('default_ram_limit_mb', NULL)")

    # SH_SCRIPTS
    op.create_table(
        "SH_SCRIPTS",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("script_content", sa.Text, nullable=False),
        sa.Column("requirements_content", sa.Text),
        sa.Column("cron_expression", sa.String(100)),
        sa.Column("timeout_seconds", sa.Integer),
        sa.Column("priority", sa.Integer, server_default="3"),
        sa.Column("max_retries", sa.Integer, server_default="0"),
        sa.Column("cpu_cores", sa.Integer),
        sa.Column("ram_limit_mb", sa.Integer),
        sa.Column("is_active", sa.Boolean, server_default="1"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
    )

    # SH_SCRIPT_RUNS
    op.create_table(
        "SH_SCRIPT_RUNS",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("script_id", sa.Integer, sa.ForeignKey("SH_SCRIPTS.id"), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("triggered_by", sa.String(10), server_default="manual"),
        sa.Column("started_at", sa.DateTime),
        sa.Column("finished_at", sa.DateTime),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("attempt_number", sa.Integer, server_default="1"),
        sa.Column("celery_task_id", sa.String(255)),
        sa.Column("worker_pid", sa.Integer),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
    )

    # SH_RUN_LOGS
    op.create_table(
        "SH_RUN_LOGS",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("run_id", sa.Integer, sa.ForeignKey("SH_SCRIPT_RUNS.id"), nullable=False),
        sa.Column("logged_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
        sa.Column("stream", sa.String(6), nullable=False),
        sa.Column("line_text", sa.Text, nullable=False),
    )

    # SH_ALERT_CONFIGS
    op.create_table(
        "SH_ALERT_CONFIGS",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("script_id", sa.Integer, sa.ForeignKey("SH_SCRIPTS.id", ondelete="CASCADE"), nullable=False),
        sa.Column("on_failure", sa.Boolean, server_default="1"),
        sa.Column("on_success", sa.Boolean, server_default="0"),
        sa.Column("on_timeout", sa.Boolean, server_default="1"),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("destination", sa.String(500), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("SH_ALERT_CONFIGS")
    op.drop_table("SH_RUN_LOGS")
    op.drop_table("SH_SCRIPT_RUNS")
    op.drop_table("SH_SCRIPTS")
    op.drop_table("SH_APP_SETTINGS")
