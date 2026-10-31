import re

def validate_password(password: str) -> tuple[bool, str]:
    """
    Strict password requirement:
    - MORE THAN 8 characters long (len >= 9)
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 special character
    """
    if not password or len(password) <= 8:
        return False, "Password must be more than 8 characters in length (minimum 9 characters)."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_+=\[\]\\/`~]", password):
        return False, "Password must contain at least one special character."
    return True, ""

def validate_email(email: str) -> bool:
    if not email:
        return False
    email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
    return bool(re.match(email_regex, email))
