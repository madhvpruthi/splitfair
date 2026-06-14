# Scope - Anomaly Handling & Database Schema

This document details the anomaly categories identified in shared spreadsheet data, their scanning checks, resolution options, and the database schema.

---

## 1. Anomaly Categories & Handling Policies

SplitFair never silently deletes or modifies data. Spreadsheet import rows are checked for the following problems:

### 1. Duplicate Expense
* **Detection Rule**: A row matches another row in title, payer, amount, and date within a 1-day threshold (either in the uploaded file itself, or against existing records in the database).
* **Handling Policy**: Flag as `WARNING: DUPLICATE`. Do not import automatically.
* **Resolution Options**:
  1. **Import Anyway**: Overwrite/bypass duplicate check and create a new record.
  2. **Skip Row**: Mark as IGNORED and exclude from the transaction.

### 2. Missing Participant
* **Detection Rule**: The `participants` field is empty.
* **Handling Policy**: Flag as `ERROR: MISSING PARTICIPANTS`. Cannot split the amount.
* **Resolution Options**:
  1. **Skip Row**: Exclude the row.

### 3. Missing Payer
* **Detection Rule**: The `payer` field is empty or doesn't match a user.
* **Handling Policy**: Flag as `ERROR: EMPTY FIELD` or `ERROR: UNKNOWN MEMBER`.
* **Resolution Options**:
  1. **Map User**: Manually specify an active group member to map this name to.
  2. **Skip Row**: Exclude.

### 4. Invalid Amount
* **Detection Rule**: Amount is <= 0 or not a valid number (e.g. text).
* **Handling Policy**: Flag as `ERROR: INVALID AMOUNT`.
* **Resolution Options**:
  1. **Skip Row**: Exclude row.

### 5. Invalid Date
* **Detection Rule**: Date cannot be parsed into YYYY-MM-DD.
* **Handling Policy**: Flag as `ERROR: INVALID DATE`.
* **Resolution Options**:
  1. **Skip Row**: Exclude.

### 6. Future Date
* **Detection Rule**: The expense date is later than the current system calendar date.
* **Handling Policy**: Flag as `WARNING: FUTURE DATE`.
* **Resolution Options**:
  1. **Import Anyway**: Proceed with the future date.
  2. **Skip Row**: Exclude.

### 7. Invalid Currency
* **Detection Rule**: The currency code is something other than USD or INR.
* **Handling Policy**: Flag as `WARNING: INVALID CURRENCY`.
* **Resolution Options**:
  1. **Bypass**: Use standard conversion rate of 1.0.

### 8. Unknown Member
* **Detection Rule**: Payer or participant username does not exist in the database.
* **Handling Policy**: Flag as `WARNING: UNKNOWN MEMBER`.
* **Resolution Options**:
  1. **Create Inactive User**: Automatically create a shell/invited user with that username.
  2. **Map to Existing User**: Link to an existing system username.

### 9. Settlement Recorded as Expense
* **Detection Rule**: Title or description contains keywords ("settle", "payment", "paid back") and the expense lists exactly 1 payer, 1 participant, and split type is EQUAL or UNEQUAL.
* **Handling Policy**: Flag as `WARNING: SETTLEMENT AS EXPENSE`.
* **Resolution Options**:
  1. **Import as Settlement**: Create a `Settlement` record instead of an `Expense`.
  2. **Import as Expense**: Create an `Expense` record.

### 10. Membership Violation
* **Detection Rule**: The expense date falls outside the membership active timeline of the payer or any participant (`joined_at` -> `left_at`).
* **Handling Policy**: Flag as `WARNING: MEMBERSHIP VIOLATION`.
* **Resolution Options**:
  1. **Extend Membership**: Auto-extend the member's group join date (or clear leave date) to include this expense date.
  2. **Skip Row**: Exclude.

### 11. Inconsistent Split
* **Detection Rule**: Unequal split values do not sum to total, or percentages do not sum to 100%, or shares are invalid.
* **Handling Policy**: Flag as `ERROR: INCONSISTENT SPLIT`.
* **Resolution Options**:
  1. **Force Equal**: Discard custom splits and divide the expense amount equally among participants.
  2. **Skip Row**: Exclude.

---

## 2. PostgreSQL Normalized Schema

### Tables

1. **`users`**
   - Stores user login data and their QR tokens.
   - *Key Columns*: `id` (UUID, PK), `username` (VARCHAR 150, Unique), `email` (VARCHAR 254), `qr_code_token` (VARCHAR 255, Unique).

2. **`groups`**
   - *Key Columns*: `id` (UUID, PK), `name` (VARCHAR 255), `description` (TEXT), `created_by_id` (UUID, FK -> `users`), `created_at` (TIMESTAMP).

3. **`group_memberships`**
   - Handles historical group active states.
   - *Key Columns*: `id` (UUID, PK), `group_id` (UUID, FK -> `groups`), `user_id` (UUID, FK -> `users`), `joined_at` (TIMESTAMP), `left_at` (TIMESTAMP, Nullable).
   - *Constraints*: Unique constraint on `(group_id, user_id, joined_at)`.

4. **`expenses`**
   - *Key Columns*: `id` (UUID, PK), `group_id` (UUID, FK -> `groups`), `title` (VARCHAR 255), `amount` (DECIMAL 12,2), `currency` (VARCHAR 3), `payer_id` (UUID, FK -> `users`), `date` (DATE), `split_type` (VARCHAR 20), `converted_amount` (DECIMAL 12,2), `exchange_rate` (DECIMAL 18,6).

5. **`expense_participants`**
   - *Key Columns*: `id` (UUID, PK), `expense_id` (UUID, FK -> `expenses` ON DELETE CASCADE), `user_id` (UUID, FK -> `users`), `amount` (DECIMAL 12,2), `percentage` (DECIMAL 5,2, Nullable), `share` (DECIMAL 5,2, Nullable), `original_amount` (DECIMAL 12,2, Nullable).

6. **`settlements`**
   - *Key Columns*: `id` (UUID, PK), `group_id` (UUID, FK -> `groups`), `payer_id` (UUID, FK -> `users`), `receiver_id` (UUID, FK -> `users`), `amount` (DECIMAL 12,2), `currency` (VARCHAR 3), `converted_amount` (DECIMAL 12,2), `exchange_rate` (DECIMAL 18,6), `date` (DATE), `note` (TEXT).

7. **`exchange_rates`**
   - *Key Columns*: `id` (INT, PK), `base_currency` (VARCHAR 3), `target_currency` (VARCHAR 3), `rate` (DECIMAL 18,6), `date` (DATE).
   - *Constraints*: Unique constraint on `(base_currency, target_currency, date)`.

8. **`import_jobs`**
   - *Key Columns*: `id` (UUID, PK), `group_id` (UUID, FK -> `groups`), `user_id` (UUID, FK -> `users`), `file_name` (VARCHAR 255), `status` (VARCHAR 20), `total_rows` (INT), `successful_imports` (INT), `failed_imports` (INT), `created_at` (TIMESTAMP).

9. **`import_anomalies`**
   - *Key Columns*: `id` (UUID, PK), `import_job_id` (UUID, FK -> `import_jobs` ON DELETE CASCADE), `row_number` (INT), `raw_data` (JSONB), `anomaly_type` (VARCHAR 100), `severity` (VARCHAR 10), `description` (TEXT), `status` (VARCHAR 20), `resolution_action` (VARCHAR 255), `resolved_at` (TIMESTAMP).

10. **`import_reports`**
    - *Key Columns*: `id` (UUID, PK), `import_job_id` (UUID, FK -> `import_jobs`), `report_data` (JSONB), `created_at` (TIMESTAMP).

11. **`audit_logs`**
    - *Key Columns*: `id` (UUID, PK), `user_id` (UUID, FK -> `users` Nullable), `action` (VARCHAR 100), `target_type` (VARCHAR 100), `target_id` (VARCHAR 100), `details` (JSONB), `timestamp` (TIMESTAMP).
