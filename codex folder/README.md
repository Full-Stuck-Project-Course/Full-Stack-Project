# HailNow

Full-stack local ride-hailing project with React frontend, Express backend and MongoDB.

## Run Locally

Backend:

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

Frontend:

```bash
cd frontend
copy .env.example .env
npm install
npm start
```

Frontend runs on `http://localhost:3000`.
Backend runs on `http://localhost:5000`.

## Google Maps

Set these keys locally:

- `backend/.env`: `GOOGLE_MAPS_API_KEY=...`
- `frontend/.env`: `REACT_APP_GOOGLE_MAPS_API_KEY=...`

Without a key, HailNow still runs with a local demo map and local distance fallback.
