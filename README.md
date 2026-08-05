# HailNow

HailNow is a full-stack ride-hailing application with passenger, driver, admin, payment, rating, SOS, and carpool workflows.

## Project Structure

```text
Full-Stack-Project/
|-- backend/
|   |-- server.js
|   |-- package.json
|   |-- .env.example
|   |-- controllers/
|   |-- db/
|   |-- middleware/
|   |-- routes/
|   |-- scripts/
|   `-- tests/
`-- frontend/
    |-- package.json
    |-- scripts/
    `-- src/
        |-- App.jsx
        |-- api/
        |-- components/
        |-- context/
        `-- pages/
```

## Run Locally

### One-command startup on Windows

```bat
start.bat
```

The script prepares missing dependencies, starts the backend and frontend in dedicated HailNow command windows, waits for both services, and opens the frontend.

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Required environment values include `DB_CONNECTION` and `JWT_SECRET`.

For multi-instance deployments, set a shared `REDIS_URL` or `SOCKET_IO_REDIS_URL` so Socket.IO can broadcast across replicas. Set `RATE_LIMIT_STORE=redis` with `RATE_LIMIT_REDIS_URL` or `REDIS_URL` when HTTP rate limits must be shared across replicas. Scheduled jobs use MongoDB leases by default; set `ENABLE_SCHEDULED_TASKS=false` only on web replicas if you run a separate worker for those jobs.

To create the first admin without editing MongoDB manually, set the `BOOTSTRAP_ADMIN_*` values in `backend/.env` and run:

```bash
cd backend
npm run bootstrap:admin
```

The command exits without changes when an admin already exists.

### Frontend

```bash
cd frontend
npm install
npm start
```

The frontend runs at `http://127.0.0.1:3000` by default. The backend defaults to port `5000` unless `PORT` is configured in `backend/.env`.

## Verification

```bash
cd backend
npm test

cd ../frontend
npm test
npm run build
```
