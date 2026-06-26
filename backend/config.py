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


settings = Settings()
