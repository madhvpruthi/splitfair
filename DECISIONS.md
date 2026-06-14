# Architectural Decisions - SplitFair

This document outlines key technical decisions made during the design and implementation of SplitFair, including alternatives considered and reasons for the final selections.

---

## 1. Decoupled React SPA + Django REST API vs. Django Server-Side Monolith
* **Decision**: Decouple the frontend (Vite/React) and backend (Django REST Framework).
* **Alternatives Considered**: Standard Django templates with server-side HTML rendering.
* **Reasoning**:
  - **Separation of Concerns**: Allows frontend designers and backend engineers to work independently.
  - **Premium UI Experience**: Rich animations, instant transitions, and glassmorphic hover effects are significantly easier to implement using a React SPA.
  - **API Reusability**: The REST APIs can easily serve mobile apps or third-party integrations later, rather than being coupled to template rendering.

---

## 2. Dynamic Database Settings (SQLite Local / PostgreSQL Production)
* **Decision**: Fallback to SQLite locally if `DATABASE_URL` is absent, and auto-configure PostgreSQL (using Neon) if present.
* **Alternatives Considered**: Force PostgreSQL setup locally.
* **Reasoning**:
  - **Developer Onboarding**: Installing and starting a local PostgreSQL server on MacOS/Windows requires homebrew, docker daemon running, or custom system packages. Supporting local SQLite fallback allows the app to boot instantly on any machine with `python manage.py migrate`.
  - **Compatibility**: Standard database operations are handled using Django's ORM, making database switching seamless. PostgreSQL-specific features like `JSONB` map perfectly to Django's standard `JSONField`, which operates on SQLite using stringified representations.

---

## 3. Base Currency Balance Aggregation (INR Base)
* **Decision**: Convert all expense transactions to a single base currency (**INR**) using date-specific rates to calculate net user balances.
* **Alternatives Considered**: Keep individual currency debt ledgers separate (e.g., Rohan owes Priya 10 USD AND Priya owes Rohan 1000 INR).
* **Reasoning**:
  - **Simplification**: Maintaining multi-ledger debt balances prevents a user from seeing "one final number" (Aisha's requirement). It also prevents payment minimization/simplification algorithms from running, since debts cannot be compared or simplified across currencies.
  - **Currency Integrity**: SplitFair stores both the original currency/amount and the converted currency/amount on the models, preserving full auditability (Priya's requirement) while providing the aggregated net calculations.

---

## 4. Synchronous CSV Processing & Anomaly Generation
* **Decision**: Parse and scan CSV files synchronously during the HTTP request.
* **Alternatives Considered**: Process CSV imports asynchronously using Celery and Redis.
* **Reasoning**:
  - **Simplicity & Reliability**: local deployments may not have a running Redis server. Running imports synchronously avoids Celery setup, reduces deployment dependencies, and delivers immediate user validation feedback.
  - **Performance**: The uploaded CSV size is small (< 1,000 rows). Parsing and scanning 1,000 rows using python's standard `csv` reader takes < 100ms, making asynchronous queues unnecessary.

---

## 5. Interactive Anomaly Review Dashboard vs. Auto-Correction
* **Decision**: Flag rows with warnings/errors, save them as pending anomalies in the database, and require user resolution inputs.
* **Alternatives Considered**: Automatically delete duplicates, discard membership dates, or drop invalid rows.
* **Reasoning**:
  - **Data Protection**: Automatically correcting data runs the risk of altering user ledger history (violating Meera's requirement). Surfacing issues in the UI guarantees that the user maintains complete control over their balances.
