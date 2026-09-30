# Kashmir Brand Ambassador — Backend

Django + DRF API for the Intelligent Brand Ambassador Kashmir frontend.
Lives next to the Vite app; **does not modify** the frontend.

## Layout

```
backend/
  manage.py
  requirements.txt
  config/          # Django settings / urls
  core/            # Auth user (JWT + Djoser)
  api/             # Stores, BAs, shifts, shopper, training, …
  ba_engine/       # In-process NLP for BA assessment
```

## Business codes

On create, the API auto-assigns:

| Entity       | Field  | Format   |
|--------------|--------|----------|
| Ambassador   | `code` | `BA-001` |
| Store        | `code` | `ST-001` |

Also kept: integer PK, BA `invite_token` → `/ba/open/{token}`, store `qr_slug` → `/shopper/{slug}`.

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Optional NLP: pip install torch --index-url https://download.pytorch.org/whl/cpu
#               python -m spacy download en_core_web_sm
copy .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8000
```

Frontend (unchanged): `npm run dev` on port 5173.

## Main routes

| Prefix | Purpose |
|--------|---------|
| `/auth/` | Djoser + JWT (`jwt/create/`, …) |
| `/api/stores/` | Store CRUD + QR (`code` = ST-###) |
| `/api/ambassadors/` | BA CRUD + deploy (`code` = BA-###) |
| `/api/shifts/` | Week shift board |
| `/api/training-videos/` | HO training upload |
| `/api/ba/*` | Invite, check-in/out, assessment sessions |
| `/api/shopper/*` | Public QR shopper journey |
| `/api/intelligence/*` | HO dashboards |
| `/api/manager/overview/` | Manager ops |
| `/admin/` | Django admin |

## Brand

Default `BRAND_NAME=Kashmir Oil`. Override in `.env`.
