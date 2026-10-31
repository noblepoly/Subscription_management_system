import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.db import engine, Base
import app.models # Registers all SQLAlchemy models

def initialize_database():
    print(f"Connecting to database via SQLAlchemy...")
    try:
        # Create all tables
        Base.metadata.create_all(bind=engine)
        print("Successfully created / verified all PostgreSQL database tables:")
        for table_name in Base.metadata.tables.keys():
            print(f"  - {table_name}")
        return True
    except Exception as e:
        print(f"Database initialization error: {e}")
        return False

if __name__ == "__main__":
    success = initialize_database()
    if not success:
        sys.exit(1)
