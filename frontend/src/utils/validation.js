/**
 * Password validation rules matching backend:
 * - More than 8 characters (len >= 9)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one special character
 */
export const validatePassword = (password) => {
  if (!password || password.length <= 8) {
    return { valid: false, message: 'Password must be more than 8 characters (minimum 9).' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/`~]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character.' };
  }
  return { valid: true, message: '' };
};

export const validateEmail = (email) => {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};
