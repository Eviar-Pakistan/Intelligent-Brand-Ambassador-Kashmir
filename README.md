# Intelligent Brand Ambassador — Kashmir

Monorepo layout:

```
Intelligent-Brand-Ambassador-Kashmir/
  frontend/     # Vite + React UI
  backend/      # Django + DRF API
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:5173  
Copy `frontend/.env.example` → `frontend/.env` and set `VITE_API_URL` (default `http://localhost:8000`).

## Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8000
```

See `backend/README.md` for API routes.

## Role routes (frontend)

| Role | URL |
|------|-----|
| Head Office | `/ho/...` |
| Administrator | `/admin/...` |
| Store Manager | `/manager` |
| Brand Ambassador | `/ba/...` |
| Shopper | `/shopper/...` |

Login at `/login`.
