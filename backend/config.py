import json
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SHEET_ID: str = os.getenv("SHEET_ID", "")
    GOOGLE_SHEETS_CREDENTIALS_JSON: str = os.getenv(
        "GOOGLE_SHEETS_CREDENTIALS_JSON", "./google-credentials.json"
    )
    ADMIN_SECRET_KEY: str = os.getenv("ADMIN_SECRET_KEY", "")
    SHEET_TAB_NAME: str = os.getenv("SHEET_TAB_NAME", "Sheet1")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")
    GEOCODIO_API_KEY: str = os.getenv("GEOCODIO_API_KEY", "")

    def google_credentials_dict(self) -> dict:
        """
        Return Google service account credentials as a dict.

        Accepts two formats for GOOGLE_SHEETS_CREDENTIALS_JSON:
          - A file path (starts with "./" or "/"):  reads and parses the JSON file.
          - An inline JSON string (starts with "{"):  parses it directly.

        This allows the credentials to be stored as either a local file (dev)
        or a raw JSON env var on Render (production).
        """
        raw = self.GOOGLE_SHEETS_CREDENTIALS_JSON.strip()
        if raw.startswith("{"):
            return json.loads(raw)
        with open(raw) as f:
            return json.load(f)


settings = Settings()
