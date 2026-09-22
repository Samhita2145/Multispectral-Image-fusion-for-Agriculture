import sys
import os

# Add backend directory to sys.path so we can import from it
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database.database import SessionLocal, init_db
from models.user import User
from security import hash_password

def seed_admin(email: str, password: str, name: str = "Admin User"):
    # Ensure tables and migrations are run
    init_db()
    
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        if user:
            print(f"User {email} already exists. Updating to admin and setting password.")
            user.is_admin = True
            user.password_hash = hash_password(password)
        else:
            print(f"Creating new admin user {email}.")
            user = User(
                name=name,
                email=email.lower(),
                password_hash=hash_password(password),
                is_admin=True
            )
            db.add(user)
            
        db.commit()
        print("Admin user seeded successfully.")
    except Exception as e:
        print(f"Error seeding admin user: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python seed_admin.py <email> <password> [name]")
        sys.exit(1)
        
    email = sys.argv[1]
    password = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else "Admin User"
    
    seed_admin(email, password, name)
