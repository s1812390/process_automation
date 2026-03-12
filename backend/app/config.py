from pydantic_settings import BaseSettings
from pydantic import computed_field


class Settings(BaseSettings):
    oracle_host: str = "localhost"
    oracle_port: int = 1521
    oracle_service_name: str = "FREEPDB1"
    oracle_user: str = "scheduler"
    oracle_password: str = "scheduler_pass"

    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = "change-me-in-production"
    log_level: str = "INFO"

    # Alerts
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    telegram_bot_token: str = ""

    @computed_field
    @property
    def database_url(self) -> str:
        return (
            f"oracle+oracledb_async://{self.oracle_user}:{self.oracle_password}"
            f"@{self.oracle_host}:{self.oracle_port}/"
            f"?service_name={self.oracle_service_name}"
        )

    @computed_field
    @property
    def sync_database_url(self) -> str:
        return (
            f"oracle+oracledb://{self.oracle_user}:{self.oracle_password}"
            f"@{self.oracle_host}:{self.oracle_port}/"
            f"?service_name={self.oracle_service_name}"
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
