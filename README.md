# SplitFair - Shared Expenses Management Application

SplitFair is a full-stack production-ready Shared Expenses Management Application designed to ingest messy spreadsheet logs, flag anomalies (duplicates, future dates, invalid split calculations, membership timeline conflicts), provide interactive resolution controls, calculate date-restricted net balances, and compute optimized settlement paths.

Inspired by Splitwise, it uses a decoupled React SPA + Django REST API architecture.

---

## Technical Stack

* **Frontend**: React (Vite), React Router, Axios, Tailwind CSS, Lucide icons.
* **Backend**: Python 3.13, Django 6.0, Django REST Framework (DRF), Simple JWT (token-based auth), pandas.
* **Database**: PostgreSQL (Production: Neon PostgreSQL / Local Dev: SQLite3 fallback).
* **Authentication**: JWT token-based (access token lifetime: 7 days, refresh token: 30 days).

---

## Project Structure

```
splitwise/
├── backend/
│   ├── manage.py
│   ├── splitwise_backend/     # Main settings, URLs, WSGI configuration
│   └── expenses/              # Django App
│       ├── models.py          # Database Schema definitions
│       ├── serializers.py     # Serializers mapping models to JSON
│       ├── views.py           # REST views and file upload receivers
│       ├── urls.py            # Route mappings
│       ├── import_service.py  # CSV parser & Anomaly Detector logic
│       ├── balance_service.py # Debt calculation & Greedy Debt Minimization
│       └── tests.py           # Comprehensive unit & integration tests
├── frontend/
│   ├── index.html
│   ├── tailwind.config.js     # Tailwind design tokens
│   ├── postcss.config.js
│   ├── package.json
│   ├── src/
│   │   ├── main.jsx           # App bootstrapping
│   │   ├── App.jsx            # Routing and Context setup
│   │   ├── index.css          # Global CSS & Glassmorphism styles
│   │   ├── context/
│   │   │   └── AuthContext.jsx # JWT management & Axios intercepters
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Dashboard navigation wrapper
│   │   │   └── QRScanner.jsx  # Invitation scanner
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Register.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Groups.jsx
│   │       ├── GroupDetails.jsx
│   │       ├── ImportCSV.jsx
│   │       ├── ImportReportViewer.jsx
│   │       └── Profile.jsx
```

---

## Installation & Local Setup

### Prerequisite
* Python 3.13+
* Node.js v24+ & npm v11+

### 1. Setup Backend
1. Open a terminal and navigate to `backend/`:
   ```bash
   cd backend
   ```
2. Create and activate virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install django djangorestframework djangorestframework-simplejwt django-cors-headers pandas dj-database-url psycopg2-binary django-filter
   ```
4. Run migrations:
   ```bash
   python manage.py migrate
   ```
5. Run unit tests:
   ```bash
   python manage.py test
   ```
6. Start development server (runs on `http://127.0.0.1:8000`):
   ```bash
   python manage.py runserver
   ```

### 2. Setup Frontend
1. Open a new terminal and navigate to `frontend/`:
   ```bash
   cd frontend
   ```
2. Install packages:
   ```bash
   npm install
   ```
3. Run production verification build:
   ```bash
   npm run build
   ```
4. Start dev server (runs on `http://localhost:5173`):
   ```bash
   npm run dev
   ```

---

## Deployment Strategies

### Backend (Render)
1. Commit the code to GitHub.
2. In Render, create a new **Web Service**.
3. Link your repository.
4. Settings:
   - **Environment**: `Python`
   - **Build Command**: `pip install -r requirements.txt && python manage.py migrate`
   - **Start Command**: `gunicorn splitwise_backend.wsgi:application`
5. Configure Environment Variables:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string.
   - `SECRET_KEY`: Django settings secret key.
   - `DEBUG`: `False`.

### Frontend (Vercel)
1. Create a new project in Vercel.
2. Import the repository.
3. Configure the Root Directory to `frontend`.
4. Settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Configure environment variables (e.g. if pointing to a production backend, change the API URL).

### Database (Neon PostgreSQL)
1. Sign up on Neon.tech.
2. Create a serverless PostgreSQL project.
3. Copy the connection string.
4. Pass the connection string into Render's `DATABASE_URL` environment variable.
