# HailNow

HailNow is a local full-stack ride-hailing and carpool web application. The project includes React frontends, Node/Express APIs, MongoDB/Mongoose data models, Google Maps integration, live ride communication, passenger and driver dashboards, verification workflows, and accessibility/language support.

The app is intended to run locally on `localhost`. Cloud deployment is intentionally not included.

## Repository Overview

```text
Full-Stack-Project/
├── README.md                  # This project guide
├── package.json               # Root Vite UI prototype dependencies
├── RUN_RIDELOOP.bat           # Starts the root Vite prototype
├── src/                       # Standalone React/Vite UI prototype
├── claude folder/             # Recommended full-stack HailNow implementation
│   ├── start.bat              # Starts backend and frontend together
│   ├── backend/               # Express + MongoDB + Socket.IO API
│   └── frontend/              # React app with routes, maps, dashboards and i18n
├── codex folder/              # Alternate HailNow full-stack implementation
│   ├── backend/
│   └── frontend/
└── guidelines/                # Final-project guideline notes/template
```

Use `claude folder` as the main application version. It currently contains the broadest feature set: Google Maps, file uploads, admin verification, realtime Socket.IO events, dashboards, ratings, complaints, and Hebrew/English UI support.

## Main Features

- Authentication: registration, login, forgot-password and reset-password flows.
- Roles: a user can be a passenger, driver, both, or admin.
- Passenger flows: ride booking, scheduled rides, carpool rides, multiple passengers, stops, nearby drivers, ride status, trip history, future rides, loyalty points and referrals.
- Driver flows: driver setup, required license details, availability status, nearby ride requests, ride acceptance, earnings, fines, total rides, latest ratings and demand alerts.
- Google Maps: Places autocomplete, map markers, nearby drivers, distance calculation and route-based price estimation.
- Dynamic pricing: price changes by distance, duration, vehicle type, passenger count, carpool discount and surge multiplier during busy hours.
- Ride lifecycle: searching, accepted, driver arriving, in progress, completed and cancelled.
- Safety and communication: live location updates, in-ride chat, ride sharing notification endpoint, complaint flow and emergency SOS event.
- Ratings: passengers can rate drivers after completed rides, add tags/comments and submit complaints.
- Verification: profile photo, ID photo for all users, driver license photo for drivers, and admin approval/rejection screens.
- Vehicle management: company, model, year, color, license plate, vehicle type, test/insurance details and ride conditions.
- Language support: Hebrew and English UI text with automatic RTL/LTR direction switching.
- Accessibility: skip-navigation support, accessible form labels/states and UI styling prepared for high-contrast/font-size options.

## Tech Stack

Frontend:

- React 18
- React Router
- Axios
- `@react-google-maps/api`
- Socket.IO client in the main full-stack version
- CSS modules/global CSS per app folder

Backend:

- Node.js
- Express
- MongoDB with Mongoose
- JWT authentication
- bcrypt password hashing
- Multer file uploads
- Socket.IO realtime events
- Google Distance Matrix API through Axios

## Prerequisites

Install these before running the project:

- Node.js with npm
- MongoDB running locally
- A Google Maps API key with the required Maps/Places/Distance Matrix APIs enabled

Recommended local MongoDB URL:

```env
mongodb://localhost:27017/carpool
```

## Environment Variables

Do not commit real secrets or API keys. Keep them only in local `.env` files.

### Main App Backend

Create this file:

```text
claude folder/backend/.env
```

Example values:

```env
PORT=5000
DB_CONNECTION=mongodb://localhost:27017/carpool
JWT_SECRET=replace_with_a_long_random_secret
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
```

### Main App Frontend

Create this file:

```text
claude folder/frontend/.env
```

The map component in this version reads:

```env
REACT_APP_GOOGLE_MAPS_KEY=your_google_maps_key_here
```

### Alternate Codex Version

The alternate app in `codex folder` has its own backend/frontend `.env` files. Its README documents:

```env
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key_here
```

## Run the Main App

From the main full-stack folder:

```bat
cd "claude folder"
start.bat
```

The script checks Node.js, installs missing dependencies, and opens two terminals:

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3000`

Keep both terminals open while using the app.

## Run Manually

Backend:

```bash
cd "claude folder/backend"
npm install
npm run dev
```

Frontend:

```bash
cd "claude folder/frontend"
npm install
npm start
```

Open the frontend at:

```text
http://localhost:3000
```

## Run the Root Vite Prototype

The root `src` folder is a separate Vite UI prototype. To run it:

```bat
RUN_RIDELOOP.bat
```

Or manually:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

## API Overview

The main backend exposes routes under `/api`.

Authentication and users:

```text
POST /api/users/register
POST /api/users/login
POST /api/users/forgot-password
POST /api/users/reset-password
GET  /api/users
GET  /api/users/:id
PUT  /api/users/:id
DELETE /api/users/:id
PUT  /api/users/:id/change-password
```

Maps and pricing:

```text
GET /api/maps/distance-price
GET /api/maps/nearby-drivers
GET /api/maps/demand
GET /api/maps/best-departure
```

Rides:

```text
POST /api/rides
GET  /api/rides
GET  /api/rides/:id
PUT  /api/rides/:id/accept
PUT  /api/rides/:id/driver-arriving
PUT  /api/rides/:id/start
PUT  /api/rides/:id/complete
PUT  /api/rides/:id/cancel
```

Driver/passenger resources:

```text
/api/drivers
/api/passengers
/api/vehicles
/api/driver-alerts
```

Ride support resources:

```text
/api/payments
/api/ratings
/api/ride-stops
/api/notifications
/api/carpool
```

Uploads and verification:

```text
POST /api/uploads/profile
POST /api/uploads/id-photo
POST /api/uploads/license
GET  /api/uploads/pending
PUT  /api/uploads/verify-id/:userId
PUT  /api/uploads/verify-driver/:driverProfileId
```

## Realtime Events

The main backend uses Socket.IO on port `5000`.

Client events:

```text
join-ride
join-driver
driver-location
chat-message
sos
```

Server broadcasts:

```text
location-update
new-message
sos-alert
```

These events power ride-room updates, driver location sharing, in-ride chat, driver notifications and emergency alerts.

## Data Model Summary

Important MongoDB models in the main backend:

- `User`: login details, role, language, profile image, ID verification status, referral code and loyalty points.
- `DriverProfile`: license details, verification status, rating, earnings, fines, availability, current location, preferred language, music/hobby and vehicle conditions.
- `PassengerProfile`: passenger preferences, driver preference filters, loyalty points and referral bonuses.
- `Vehicle`: driver vehicles, license plate, vehicle type, test and insurance data.
- `Ride`: pickup/destination, driver/passenger references, status, ride type, scheduled time, price and cancellation data.
- `RideStop`: additional stops for a ride.
- `Rating`: passenger feedback, stars, tags, comments and complaints.
- `Payment`: payment status, split payment data and cancellation fees.
- `DriverAlert`: demand and activity alerts for drivers.
- `Notification`: user notifications.
- `CarpoolRequest`: carpool matching requests.

## Google Maps Notes

The backend price endpoint uses Google Distance Matrix when `GOOGLE_MAPS_API_KEY` is configured. If no backend key exists, the controller returns fallback demo values so local development can still continue.

The main frontend uses Google Places autocomplete and map markers when `REACT_APP_GOOGLE_MAPS_KEY` is configured. Without a frontend key, it shows a local placeholder map/input fallback.

For production-style use, restrict the Google key in the Google Cloud Console and never expose unrestricted keys in commits.

## Project Notes

- This repository contains generated artifacts such as `node_modules`, uploaded images and a zip copy. They are not part of the source documentation and should usually stay out of commits.
- Uploaded ID/license/profile files are served locally from `claude folder/backend/uploads`.
- MongoDB must be running before the backend starts successfully.
- The project is designed for local submission/demo use, not cloud deployment.
- The `guidelines/Guidelines.md` file currently contains a general guideline template, so the README documents the actual implemented source structure and behavior.
