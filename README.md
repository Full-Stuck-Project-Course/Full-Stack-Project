# CarPool App

## מבנה הפרויקט

```
claude folder/
├── backend/
│   ├── server.js          ← נקודת כניסה
│   ├── app.js             ← Express setup
│   ├── package.json
│   ├── .env.example       ← העתק ל-.env ומלא פרטים
│   ├── db/
│   │   ├── mongo.js
│   │   └── models/        ← כל מודלי MongoDB
│   ├── controllers/       ← כל הקונטרולרים
│   ├── routes/
│   │   └── index.js
│   └── middleware/
│       ├── auth.js
│       └── errorHandler.js
└── frontend/
    ├── package.json
    └── src/
        ├── App.jsx
        ├── index.jsx
        ├── api/axios.js
        ├── context/AuthContext.jsx
        ├── components/Navbar.jsx
        └── pages/
            ├── LoginPage.jsx
            ├── RegisterPage.jsx
            ├── HomePage.jsx
            ├── BookRidePage.jsx
            ├── RideStatusPage.jsx
            ├── RideHistoryPage.jsx
            ├── DriverDashboard.jsx
            └── ProfilePage.jsx
```

## הרצה

### Backend
```bash
cd backend
cp .env.example .env   # ערוך את DB_CONNECTION ו-JWT_SECRET
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

הפרונטאנד ירוץ על http://localhost:3000
הבקאנד ירוץ על http://localhost:5000
