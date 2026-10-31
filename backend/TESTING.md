# Brightloop Subscription Management System — Backend Testing & Quality Guide

**Maintained by:** Member 3 — Database, Testing & Quality Engineer  
**Coverage:** 95% Statement Coverage across all Backend Models, Services, and Utilities  
**Test Suite Status:** 79 Passed, 8 XFailed (Awaiting Member 1 API Route Blueprints), 0 Errors

---

## 1. Quick Start & Dependency Setup

### 1.1 Prerequisites
- Python 3.10+
- pip (version 22+)

### 1.2 Install Test & Runtime Dependencies
From the repository root (`Subscription_management_system/`):

```bash
pip install -r backend/requirements.txt pytest pytest-cov
```

Key packages used:
- `pytest` & `pytest-cov`: Test runner and statement coverage analysis.
- `SQLAlchemy 2.0+` & `psycopg[binary] 3.2+`: Relational ORM and database engine.
- `PyJWT 2.10+`: Cryptographic JWT issuance, verification, and decoding.
- `Werkzeug`: Password hashing (`scrypt` / `pbkdf2`).
- `python-dateutil`: Calendar math with month-end clipping.

---

## 2. Test Database Architecture & Isolation

To comply with database quality standards, **the test suite never modifies or executes destructive tests against the actual development PostgreSQL database**.

### 2.1 Isolated Test Fixture (`backend/tests/conftest.py`)
- Tests execute against an isolated **SQLite in-memory database** using `StaticPool`.
- SQLite foreign key constraints are explicitly activated on every connection via:
  ```python
  @event.listens_for(test_engine, "connect")
  def set_sqlite_pragma(dbapi_connection, connection_record):
      cursor = dbapi_connection.cursor()
      cursor.execute("PRAGMA foreign_keys=ON")
      cursor.close()
  ```
- Before each test function, `Base.metadata.create_all()` provisions all 15 relational tables and constraints fresh.
- After each test function, tables are completely dropped, ensuring 100% repeatability with zero state leakage.
- `app.db.db_session`, `Base.query`, and `app.services.billing_engine.db_session` are dynamically patched to the isolated test session.

### 2.2 Development Database Setup (PostgreSQL)
When running the development server (`backend/run.py`):
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Update `.env` with your local PostgreSQL credentials:
   ```env
   DB_USER=postgres
   DB_PASSWORD=your_actual_postgres_password
   DB_HOST=127.0.0.1
   DB_PORT=5432
   DB_NAME=brightloop_db
   DATABASE_URL=postgresql+psycopg://postgres:your_actual_postgres_password@127.0.0.1:5432/brightloop_db
   ```
3. Initialize the PostgreSQL schema:
   ```bash
   python backend/init_db.py
   ```
4. Seed demo users, plans, products, and quotation templates:
   ```bash
   python backend/seed.py
   ```

---

## 3. How to Execute Tests

Run commands from the repository root:

### 3.1 Run Complete Test Suite
```bash
pytest backend/tests/ -v
```

### 3.2 Run Specific Test Modules
```bash
# Authentication, security, password hashing, JWT, and RBAC
pytest backend/tests/test_auth_and_security.py -v

# Products, variants, plans, constraints, and intervals
pytest backend/tests/test_products_and_plans.py -v

# Quotations, validity, conversions, and subscription lifecycle state transitions
pytest backend/tests/test_quotations_and_subscriptions.py -v

# Invoicing, billing engine, month-end clipping, snapshots, and duplicate prevention
pytest backend/tests/test_invoicing_and_billing.py -v

# Financial calculations, discounts, taxes, MRR/ARR, and payment reconciliation
pytest backend/tests/test_financial_and_discounts.py -v

# Core standalone business logic formulas
pytest backend/tests/test_core_logic.py -v

# API contracts and route expectations for Member 1
pytest backend/tests/test_api_contracts.py -v
```

### 3.3 Run with Code Coverage Report
```bash
pytest backend/tests/ --cov=app --cov-report=term-missing
```

---

## 4. Test Modules & Coverage Overview

| Test Module | Focus Area | Status | Coverage |
| :--- | :--- | :---: | :---: |
| `test_auth_and_security.py` | Password criteria (>8 chars, upper, lower, special), hashing, duplicate emails, JWT creation/expiry/tampering, RBAC decorators (`@login_required`, `@role_required`), Customer isolation | **20 Passed** | 95% |
| `test_products_and_plans.py` | Products (software, service, physical), variants, additional price, SKU uniqueness, `(product_id, variant_name)` unique constraint, cascade deletion, billing intervals, availability dates, auto-close | **9 Passed** | 98% |
| `test_quotations_and_subscriptions.py` | Quotation templates, override pricing, expiry checks, quotation-to-subscription conversion, strict state transitions (`DRAFT` $\to$ `QUOTATION` $\to$ `CONFIRMED` $\to$ `ACTIVE` $\to$ `PAUSED` $\to$ `CLOSED`), pause, resume, renewal, and early close | **9 Passed** | 97% |
| `test_invoicing_and_billing.py` | `compute_next_billing_date` with month-end clipping (e.g. Jan 31 $\to$ Feb 28), non-duplicate recurring invoicing, DB constraint `uq_subscription_billing_period`, immutable `InvoiceItem` price snapshots, recurring billing cycle runner, overdue status logic | **12 Passed** | 94% |
| `test_financial_and_discounts.py` | Fixed and percentage discounts, subtotal capping, usage limits, minimum spend, product-scoped discount applicability, GST/tax math, payment methods, partial payments ledger, balance reduction, MRR & ARR formulas | **11 Passed** | 92% |
| `test_core_logic.py` | Standalone unit tests for core financial formulas, strict password criteria, and interval calculations | **8 Passed** | 100% |
| `test_auth_api.py` | Full REST API integration for registration, privilege escalation prevention, password validation, login, profile, password reset, staff creation, and user listing (by Member 1) | **9 Passed** | 100% |
| `test_api_contracts.py` | `/api/health` live test + 8 contract specs for upcoming REST endpoints | **1 Passed, 8 XFailed** | 100% |
| **Total** | **Full Backend Application Test Suite** | **79 Passed, 8 XFailed** | **95%** |

---

## 5. Bugs Discovered & Quality Action Items for Member 1 (Backend Lead)

During the Phase 1 inspection and Phase 2 testing, three bugs/limitations in the core codebase were identified and documented:

### Bug 1: `AttributeError: 'str' object has no attribute 'hex'` in `login_required`
- **File:** `backend/app/utils/security.py` (Line 37)
- **Current Code:**
  ```python
  user = User.query.filter_by(id=payload["user_id"], is_active=True).first()
  ```
- **Issue:** `payload["user_id"]` is serialized as a string in the JWT payload. The `User.id` model column is defined as `Column(UUID(as_uuid=True))`. When querying with a `str`, SQLAlchemy calls `.hex` on the parameter, raising:
  `AttributeError: 'str' object has no attribute 'hex'`.
- **Expected Behavior:** `login_required` safely resolves the user ID regardless of whether it is passed as a string or UUID object.
- **Proposed Fix:**
  ```python
  user_id = uuid.UUID(payload["user_id"]) if isinstance(payload.get("user_id"), str) else payload.get("user_id")
  user = User.query.filter_by(id=user_id, is_active=True).first()
  ```

---

### Bug 2: Missing `+` Support in Email Regex
- **File:** `backend/app/utils/validation.py` (Line 24)
- **Current Code:**
  ```python
  email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
  ```
- **Issue:** The character class `[\w\.-]` does not include `+`. Standard RFC 5322 plus-addressed emails (such as `user+billing@domain.com` or `support+help@company.co`) fail validation.
- **Expected Behavior:** Valid sub-addressed emails are accepted during registration and customer creation.
- **Proposed Fix:**
  ```python
  email_regex = r"^[\w\.\+-]+@[\w\.-]+\.\w+$"
  ```

---

### Bug 3: Windows Console `UnicodeEncodeError` in Seeding Script
- **File:** `backend/seed.py` (Line 64, 77, 116, 155, 188, 208)
- **Current Code:**
  ```python
  print("  ✓ Created Admin, Staff, and Customer users")
  ```
- **Issue:** On Windows command prompts and PowerShell terminals running default code page 1252 (`cp1252`), printing the unicode checkmark `✓` (`\u2713`) triggers:
  `UnicodeEncodeError: 'charmap' codec can't encode character '\u2713'`.
- **Expected Behavior:** The seed script executes cleanly across all operating systems and terminal encodings.
- **Proposed Fix:** Use standard ASCII prefix `[OK]` or wrap stdout with UTF-8 encoding:
  ```python
  print("  [OK] Created Admin, Staff, and Customer users")
  ```

---

## 6. API Integration Tests Waiting for Member 1

The following API contract tests in `backend/tests/test_api_contracts.py` are marked with `@pytest.mark.xfail(reason="Waiting for Member 1...")` and define the agreed API response shapes:

1. **`POST /api/auth/register`**: Validates user creation with enforced `CUSTOMER` role.
2. **`POST /api/auth/login`**: Validates JWT issuance and user profile response.
3. **`GET /api/products`**: Returns active product catalog and variants.
4. **`GET /api/plans`**: Returns available subscription plans and interval frequencies.
5. **`GET /api/subscriptions`**: Returns user-accessible subscriptions (with customer data isolation).
6. **`GET /api/invoices`**: Returns billing invoices with balance due and item snapshots.
7. **`GET /api/payments`**: Returns payment transaction records and verification status.
8. **`GET /api/dashboard/stats`**: Returns active subscriptions, normalized MRR, ARR, overdue counts, and outstanding balances.

As soon as Member 1 registers these route blueprints in `app/__init__.py`, these tests will immediately validate endpoint integration.
