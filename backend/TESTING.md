# Brightloop Subscription Management System — Backend Testing & Quality Guide

**Maintained by:** QA, Backend & Testing Engineers (Branch: `feat/backend-final-workflow`)  
**Test Suite Status:** **139 Passed**, **0 Failed**, **0 XFailed**, **0 Errors**  
**Database Verification:** 15 PostgreSQL Relational Tables, Composite Constraints, Indexes, and Cascade Rules Verified

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

## 2. Database Architecture & PostgreSQL Verification

### 2.1 Schema & Table Verification
All **15 database tables** have been verified against the PostgreSQL dialect (`sqlalchemy.dialects.postgresql`):

| Table Name | Primary Key | Foreign Keys & Actions | Unique Constraints & Indexes |
| :--- | :--- | :--- | :--- |
| `users` | `id` (UUID) | None | Unique: `email`, Indexes: `email`, `role` |
| `password_reset_tokens` | `id` (UUID) | `user_id -> users.id` (`CASCADE`) | Unique index: `token_hash` |
| `products` | `id` (UUID) | None | Non-negative sales & cost prices |
| `product_variants` | `id` (UUID) | `product_id -> products.id` (`CASCADE`) | Constraint: `uq_product_variant (product_id, variant_name)`, Index: `product_id` |
| `subscription_plans` | `id` (UUID) | None | Intervals: `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` |
| `tax_rates` | `id` (UUID) | None | `rate_percentage` Decimal(6, 3) |
| `discount_products` | `(discount_id, product_id)` | Both `CASCADE` | Junction table for product-scoped discounts |
| `discounts` | `id` (UUID) | None | Unique index: `code` |
| `quotation_templates` | `id` (UUID) | `plan_id` (`SET NULL`), `created_by` (`SET NULL`) | Reusable SaaS proposal templates |
| `quotation_template_items` | `id` (UUID) | `template_id` (`CASCADE`), `product_id` (`CASCADE`), `variant_id` (`SET NULL`) | Index: `template_id` |
| `subscriptions` | `id` (UUID) | `customer_id` (`RESTRICT`), `plan_id` (`RESTRICT`), `template_id` (`SET NULL`), `discount_id` (`SET NULL`), `tax_rate_id` (`SET NULL`), `created_by` (`SET NULL`) | Unique: `subscription_number`, Indexes: `customer_id`, `status`, `next_billing_date` |
| `subscription_items` | `id` (UUID) | `subscription_id` (`CASCADE`), `product_id` (`RESTRICT`), `variant_id` (`SET NULL`) | Index: `subscription_id` |
| `invoices` | `id` (UUID) | `customer_id` (`RESTRICT`), `subscription_id` (`RESTRICT`) | Unique: `invoice_number`, Constraint: `uq_subscription_billing_period`, Indexes: `due_date`, `status`, `customer_id` |
| `invoice_items` | `id` (UUID) | `invoice_id` (`CASCADE`) | Index: `invoice_id`, Immutable pricing snapshots |
| `payments` | `id` (UUID) | `invoice_id` (`RESTRICT`), `customer_id` (`RESTRICT`), `recorded_by` (`SET NULL`) | Unique: `payment_number`, Indexes: `invoice_id`, `customer_id` |

### 2.2 PostgreSQL vs SQLite Nuances
1. **Case-Insensitive Search (`ILIKE`)**: PostgreSQL supports native `ILIKE` operators used in `product_routes.py`, `discount_routes.py`, and `user_routes.py`.
2. **Foreign Key Enforcement**: PostgreSQL enforces constraints continuously; SQLite requires explicit `PRAGMA foreign_keys=ON` per connection, which is configured in `conftest.py`.
3. **Timezone Handling**: PostgreSQL persists `TIMESTAMP WITH TIME ZONE`. SQLite returns naive datetimes, requiring `.replace(tzinfo=timezone.utc)` for cross-platform comparisons.
4. **UUID Data Types**: Native PostgreSQL `UUID` columns require `uuid.UUID` objects for strict parameter binding.

---

## 3. How to Execute Tests

Run commands from the repository root:

### 3.1 Run Complete Test Suite
```bash
pytest backend/tests/ -v
```

### 3.2 Run Specific QA Test Modules
```bash
# PostgreSQL Schema & Foreign Key Verification
pytest backend/tests/test_database_integrity_pg.py -v

# API Robustness, Boundary Conditions & QA Permissions
pytest backend/tests/test_api_robustness_qa.py -v

# Quotation Multi-Item Calculation & Subscription Engine
pytest backend/tests/test_quotation_and_subscription_engine.py -v

# Authentication & Security
pytest backend/tests/test_auth_and_security.py -v

# Catalog & Pricing APIs
pytest backend/tests/test_catalog_pricing_api.py -v

# Invoicing & Recurring Billing
pytest backend/tests/test_invoicing_and_billing.py -v

# Financial Formulas & Discounts
pytest backend/tests/test_financial_and_discounts.py -v
```

---

## 4. Test Modules & Coverage Overview

| Test Module | Focus Area | Status |
| :--- | :--- | :---: |
| `test_database_integrity_pg.py` | PostgreSQL DDL compilation, 15 tables PK/FK verification, composite unique constraints, indexes, RESTRICT/CASCADE cascade actions | **9 Passed** |
| `test_api_robustness_qa.py` | Product/Variant boundary inputs, plan interval validation, duplicate code rejections, `/api/discounts/validate` cart logic, RBAC security QA | **18 Passed** |
| `test_quotation_and_subscription_engine.py` | Multi-item quotation calculations, quotation-to-subscription conversion, lifecycle edge cases, concurrent duplicate billing prevention, offline payment verification workflow | **7 Passed** |
| `test_auth_and_security.py` | Password criteria (>8 chars, upper, lower, special), hashing, duplicate emails, JWT creation/expiry/tampering, RBAC decorators, customer data isolation | **20 Passed** |
| `test_auth_api.py` | REST API integration for registration, privilege escalation prevention, password validation, login, profile, password reset, staff creation (Member 1) | **9 Passed** |
| `test_catalog_pricing_api.py` | REST API integration for Products, Variants, Plans, Taxes, and Discounts CRUD (Member 1) | **7 Passed** |
| `test_products_and_plans.py` | Products, variants, plans, intervals, availability ranges, auto-close | **9 Passed** |
| `test_quotations_and_subscriptions.py` | Quotation templates, state machine transitions (`DRAFT` $\to$ `QUOTATION` $\to$ `CONFIRMED` $\to$ `ACTIVE` $\to$ `PAUSED` $\to$ `CLOSED`), cancellation, pause/resume | **9 Passed** |
| `test_invoicing_and_billing.py` | Billing date calculations (month-end clipping), duplicate billing prevention, immutable historical pricing snapshots on `InvoiceItem`, overdue status transitions | **12 Passed** |
| `test_financial_and_discounts.py` | Fixed/percentage discounts, subtotal capping, usage limits, minimum spend, product-scoped discount applicability, GST/tax math, payment methods, partial payment ledger | **11 Passed** |
| `test_core_logic.py` | Standalone unit tests for core financial formulas, strict password criteria, and interval calculations | **8 Passed** |
| `test_api_contracts.py` | Live tests for `/api/health`, `/api/auth/*`, `/api/products`, `/api/plans`, `/api/taxes`, `/api/discounts`, `/api/subscriptions`, `/api/invoices`, `/api/payments`, `/api/dashboard/stats` | **11 Passed** |
| `test_final_workflows.py` | End-to-end REST tests for subscriptions lifecycle, customer data isolation, invoice scoping, automated run-billing, offline payment verification, online mock payments, and dashboard analytics | **9 Passed** |
| **Total** | **Full Regression & Quality Test Suite** | **139 Passed, 0 XFailed, 0 Errors** |

---

## 5. QA Fixes Completed

1. **Email Sub-Addressing Support**:
   - File: `backend/app/utils/validation.py`
   - Documented in test suite; standard email validation aligned.

2. **Windows Unicode Console Encoding in `seed.py`**:
   - File: `backend/seed.py` (Lines 64, 77, 116, 155, 188, 208)
   - Replaced Unicode `✓` with `[OK]` for clean, error-free Windows execution.

---

## 6. Endpoints Implemented & Verified

The following REST blueprints are fully implemented and verified with active test coverage:
1. `GET /api/subscriptions` & `POST /api/subscriptions`, `POST /api/subscriptions/<id>/status` (Subscription lifecycle & customer isolation)
2. `GET /api/invoices` & `POST /api/invoices/run-billing`, `POST /api/billing/run-cycle` (Recurring invoice generation & duplicate prevention)
3. `GET /api/payments` & `POST /api/payments`, `POST /api/payments/<id>/verify` (Payment ledger, offline verification, customer payment isolation)
4. `GET /api/dashboard/stats` & `GET /api/analytics/dashboard` (Active subscriptions, MRR, ARR, overdue counts, outstanding balance, revenue metrics)
