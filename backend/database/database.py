import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'app.db')}")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db() -> None:
    """Creates all tables if they don't already exist. Safe to call on
    every startup."""
    # Import models so they're registered on Base.metadata before create_all.
    from models import user, prediction, report  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _run_light_migrations()


def _run_light_migrations() -> None:
    """create_all() only creates tables that don't exist yet -- it never
    alters an existing table's columns. So on an existing app.db from
    before the Google-login feature, the new `users.auth_provider` /
    `users.google_id` columns need to be added explicitly, additively,
    without touching any existing rows. No-ops (and is safe to run every
    startup) once those columns already exist -- including on a brand-new
    database, where create_all() already created them from the current
    model definition."""
    if not DATABASE_URL.startswith("sqlite"):
        # Only implemented for the default SQLite backend used by this
        # project; for other databases, use a real migration tool (e.g.
        # Alembic) if you add columns to existing tables.
        return

    with engine.connect() as conn:
        existing_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}

        if "auth_provider" not in existing_cols:
            conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'local'"
            )
        if "google_id" not in existing_cols:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN google_id VARCHAR(255)")
            # Unique index added separately -- SQLite's ADD COLUMN can't
            # declare UNIQUE directly. NULLs are exempt from uniqueness in
            # that don't have a google_id yet.
            conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users(google_id)")

        if "is_admin" not in existing_cols:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0")

        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
