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
    # app_settings
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.String(4000), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
    )

    # Insert default settings
    op.execute("INSERT INTO app_settings (key, value) VALUES ('max_concurrent_workers', '2')")
    op.execute("INSERT INTO app_settings (key, value) VALUES ('default_timeout_seconds', '3600')")
    op.execute("INSERT INTO app_settings (key, value) VALUES ('default_max_retries', '0')")
    op.execute("INSERT INTO app_settings (key, value) VALUES ('default_cpu_cores', '')")
    op.execute("INSERT INTO app_settings (key, value) VALUES ('default_ram_limit_mb', '')")

    # scripts
    op.create_table(
        "scripts",
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

    # script_runs
    op.create_table(
        "script_runs",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("script_id", sa.Integer, sa.ForeignKey("scripts.id"), nullable=False),
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

    # run_logs
    op.create_table(
        "run_logs",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("run_id", sa.Integer, sa.ForeignKey("script_runs.id"), nullable=False),
        sa.Column("logged_at", sa.DateTime, server_default=sa.text("SYSTIMESTAMP")),
        sa.Column("stream", sa.String(6), nullable=False),
        sa.Column("line_text", sa.Text, nullable=False),
    )

    # alert_configs
    op.create_table(
        "alert_configs",
        sa.Column("id", sa.Integer, sa.Identity(always=True), primary_key=True),
        sa.Column("script_id", sa.Integer, sa.ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("on_failure", sa.Boolean, server_default="1"),
        sa.Column("on_success", sa.Boolean, server_default="0"),
        sa.Column("on_timeout", sa.Boolean, server_default="1"),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("destination", sa.String(500), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("alert_configs")
    op.drop_table("run_logs")
    op.drop_table("script_runs")
    op.drop_table("scripts")
    op.drop_table("app_settings")
