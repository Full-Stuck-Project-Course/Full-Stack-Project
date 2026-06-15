// src/context/LanguageContext.jsx

import { createContext, useContext, useState, useEffect } from "react";

const T = {
    he: {
        appName: "HailNow",
        home: "בית", bookRide: "הזמן נסיעה", history: "היסטוריה",
        driverDash: "לוח נהג", passengerDash: "לוח נוסע", profile: "פרופיל",
        logout: "התנתק", login: "התחבר", register: "הירשם",
        welcome: "ברוך הבא", whereToday: "לאן תרצה לנסוע היום?",
        bookRideBtn: "הזמן נסיעה", carpoolBtn: "קרפול", historyBtn: "היסטוריה",
        driverDashBtn: "לוח נהג", passengerDashBtn: "לוח נוסע",
        loading: "טוען...", save: "שמור", cancel: "ביטול", confirm: "אישור",
        email: "אימייל", password: "סיסמה", fullName: "שם מלא", phone: "טלפון",
        forgotPassword: "שכחת סיסמה?", sendReset: "שלח קישור לאיפוס",
        resetPassword: "איפוס סיסמה", newPassword: "סיסמה חדשה",
        passenger: "נוסע", driver: "נהג", both: "נהג ונוסע",
        role: "תפקיד", language: "שפה", hebrew: "עברית", english: "English",
        pickup: "נקודת איסוף", destination: "יעד",
        estimatedPrice: "מחיר משוער", bookNow: "הזמן עכשיו",
        rideStatus: "סטטוס נסיעה", driverInfo: "פרטי הנהג",
        cancelRide: "בטל נסיעה", emergencySOS: "SOS חירום",
        rateRide: "דרג נסיעה", submit: "שלח",
        myProfile: "הפרופיל שלי", editProfile: "עריכת פרטים",
        accessibility: "נגישות", highContrast: "ניגודיות גבוהה",
        fontSize: "גודל גופן", normal: "רגיל", large: "גדול", xlarge: "גדול מאוד",
        loyaltyPoints: "נקודות נאמנות", referralCode: "קוד הפניה",
        totalRides: "נסיעות", avgRating: "דירוג ממוצע", earnings: "הכנסות",
        openRequests: "בקשות פתוחות", acceptRide: "קבל נסיעה",
        available: "זמין", busy: "עסוק", offline: "לא מחובר",
        rideType: "סוג נסיעה", regularRide: "נסיעה", carpool: "קרפול",
        passengers: "נוסעים", scheduledTime: "זמן מתוכנן", optional: "אופציונלי",
        nearbyDrivers: "נהגים בסביבה", noDrivers: "אין נהגים זמינים כרגע",
        uploadIdPhoto: "העלה תעודת זהות", uploadLicense: "העלה צילום רישיון",
        uploadProfile: "תמונת פרופיל", pendingVerification: "ממתין לאישור",
        complaint: "הגש תלונה", splitPayment: "פיצול תשלום",
        addStop: "הוסף עצירה", stops: "עצירות",
        noRides: "אין נסיעות להצגה", upcomingRides: "נסיעות עתידיות",
        pastRides: "נסיעות קודמות", switchToDriver: "עבור למצב נהג",
        switchToPassenger: "עבור למצב נוסע",
        chat: "צ'אט עם הנהג", sendMessage: "שלח הודעה",
        demandHigh: "ביקוש גבוה", demandLow: "ביקוש נמוך",
        vehicleType: "סוג רכב", regular: "רגיל", comfort: "קומפורט",
        luxury: "יוקרה", van: "מיניוואן",
        driverSetup: "הגדרת פרופיל נהג", licenseNumber: "מספר רישיון נהיגה",
        vehicle: "רכב", addVehicle: "הוסף רכב",
        company: "חברה", model: "דגם", year: "שנה", color: "צבע",
        licensePlate: "לוחית רישוי",
        rideCompleted: "הנסיעה הושלמה!", howWasRide: "איך הייתה הנסיעה?",
        ratingStars: "דירוג כוכבים", addComment: "הוסף תגובה",
        wouldRideAgain: "הייתי נוסע שוב עם נהג זה",
        perPerson: "לנוסע", totalPrice: "מחיר כולל",
        distance: "מרחק", duration: "זמן נסיעה",
        surgePricing: "מחיר שיא", bestTime: "הזמן הטוב ביותר לנסיעה",
        referFriend: "הפנה חבר",
    },
    en: {
        appName: "HailNow",
        home: "Home", bookRide: "Book Ride", history: "History",
        driverDash: "Driver Panel", passengerDash: "Passenger Panel", profile: "Profile",
        logout: "Logout", login: "Login", register: "Register",
        welcome: "Welcome", whereToday: "Where do you want to go today?",
        bookRideBtn: "Book a Ride", carpoolBtn: "Carpool", historyBtn: "History",
        driverDashBtn: "Driver Panel", passengerDashBtn: "Passenger Panel",
        loading: "Loading...", save: "Save", cancel: "Cancel", confirm: "Confirm",
        email: "Email", password: "Password", fullName: "Full Name", phone: "Phone",
        forgotPassword: "Forgot password?", sendReset: "Send Reset Link",
        resetPassword: "Reset Password", newPassword: "New Password",
        passenger: "Passenger", driver: "Driver", both: "Driver & Passenger",
        role: "Role", language: "Language", hebrew: "עברית", english: "English",
        pickup: "Pickup Location", destination: "Destination",
        estimatedPrice: "Estimated Price", bookNow: "Book Now",
        rideStatus: "Ride Status", driverInfo: "Driver Info",
        cancelRide: "Cancel Ride", emergencySOS: "SOS Emergency",
        rateRide: "Rate Ride", submit: "Submit",
        myProfile: "My Profile", editProfile: "Edit Details",
        accessibility: "Accessibility", highContrast: "High Contrast",
        fontSize: "Font Size", normal: "Normal", large: "Large", xlarge: "X-Large",
        loyaltyPoints: "Loyalty Points", referralCode: "Referral Code",
        totalRides: "Rides", avgRating: "Avg Rating", earnings: "Earnings",
        openRequests: "Open Requests", acceptRide: "Accept Ride",
        available: "Available", busy: "Busy", offline: "Offline",
        rideType: "Ride Type", regularRide: "Ride", carpool: "Carpool",
        passengers: "Passengers", scheduledTime: "Scheduled Time", optional: "Optional",
        nearbyDrivers: "Nearby Drivers", noDrivers: "No available drivers right now",
        uploadIdPhoto: "Upload ID Photo", uploadLicense: "Upload License Photo",
        uploadProfile: "Profile Photo", pendingVerification: "Pending Verification",
        complaint: "File Complaint", splitPayment: "Split Payment",
        addStop: "Add Stop", stops: "Stops",
        noRides: "No rides to display", upcomingRides: "Upcoming Rides",
        pastRides: "Past Rides", switchToDriver: "Switch to Driver Mode",
        switchToPassenger: "Switch to Passenger Mode",
        chat: "Chat with Driver", sendMessage: "Send Message",
        demandHigh: "High Demand", demandLow: "Low Demand",
        vehicleType: "Vehicle Type", regular: "Regular", comfort: "Comfort",
        luxury: "Luxury", van: "Minivan",
        driverSetup: "Driver Profile Setup", licenseNumber: "Driver License Number",
        vehicle: "Vehicle", addVehicle: "Add Vehicle",
        company: "Company", model: "Model", year: "Year", color: "Color",
        licensePlate: "License Plate",
        rideCompleted: "Ride Completed!", howWasRide: "How was your ride?",
        ratingStars: "Star Rating", addComment: "Add Comment",
        wouldRideAgain: "I would ride again with this driver",
        perPerson: "per person", totalPrice: "Total Price",
        distance: "Distance", duration: "Duration",
        surgePricing: "Surge Pricing", bestTime: "Best Time to Travel",
        referFriend: "Refer a Friend",
    }
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState(() => localStorage.getItem("lang") || "he");

    const switchLang = (l) => {
        setLang(l);
        localStorage.setItem("lang", l);
        document.documentElement.lang = l;
        document.documentElement.dir  = l === "he" ? "rtl" : "ltr";
    };

    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir  = lang === "he" ? "rtl" : "ltr";
    }, [lang]);

    const t = (key) => T[lang]?.[key] ?? T["he"][key] ?? key;

    return (
        <LanguageContext.Provider value={{ lang, switchLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLang = () => useContext(LanguageContext);
