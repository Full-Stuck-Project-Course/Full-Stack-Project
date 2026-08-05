// routes/index.js

const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { auth, adminOnly } = require("../middleware/auth");
const validate = require("../middleware/validate");
const createRateLimiter = require("../middleware/rateLimit");
const {
    registerSchema,
    loginSchema,
    googleLoginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    updateUserSchema,
    changePasswordSchema
} = require("../validators/userValidators");
const { createRideSchema, acceptRideSchema, cancelRideSchema } = require("../validators/rideValidators");
const { createRatingSchema } = require("../validators/ratingValidators");

const userController = require("../controllers/userController");
const rideController = require("../controllers/rideController");
const driverController = require("../controllers/driverController");
const passengerController = require("../controllers/passengerController");
const vehicleController = require("../controllers/vehicleController");
const paymentController = require("../controllers/paymentController");
const ratingController = require("../controllers/ratingController");
const driverAlertController = require("../controllers/driverAlertController");
const rideStopController = require("../controllers/rideStopController");
const notificationController = require("../controllers/notificationController");
const carpoolController = require("../controllers/carpoolController");
const mapsController = require("../controllers/mapsController");
const uploadController = require("../controllers/uploadController");

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const uploadLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });

// Public auth routes.
router.post("/users/register", authLimiter, validate(registerSchema), userController.register);
router.post("/users/login", authLimiter, validate(loginSchema), userController.login);
router.post("/users/google-login", authLimiter, validate(googleLoginSchema), userController.googleLogin);
router.post("/users/forgot-password", authLimiter, validate(forgotPasswordSchema), userController.forgotPassword);
router.post("/users/reset-password", authLimiter, validate(resetPasswordSchema), userController.resetPassword);

// Public registration helper. Do not reveal whether an email exists.
router.post("/users/check-email", authLimiter, (req, res) => {
    const email = String(req.body.email || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Invalid email" });

    res.json({ ok: true });
});

router.post("/users/check-phone", authLimiter, async (req, res) => {
    try {
        const phone = String(req.body.phone || "");
        if (!/^05\d{8}$/.test(phone)) return res.status(400).json({ error: "Invalid phone" });

        const User = require("../db/models/User");
        const exists = await User.findOne({ phone });
        res.json({ exists: !!exists });
    } catch {
        res.status(500).json({ error: "Could not check phone availability" });
    }
});

// All routes below require authentication.
router.use(auth);

// Users.
router.get("/users", auth, adminOnly, userController.getAllUsers);
router.get("/users/:id", userController.getUserById);
router.put("/users/:id", validate(updateUserSchema), userController.updateUser);
router.put("/users/:id/password", validate(changePasswordSchema), userController.changePassword);
router.post("/users/:id/password-reset", adminOnly, userController.adminSendPasswordReset);
router.delete("/users/:id/hard", adminOnly, userController.hardDeleteUser);
router.delete("/users/:id", auth, adminOnly, userController.deleteUser);

// Maps and pricing.
router.get("/maps/distance-price", mapsController.getDistanceAndPrice);
router.get("/maps/nearby-drivers", mapsController.getNearbyDrivers);
router.get("/maps/demand", mapsController.getDemandInfo);
router.get("/maps/best-departure", mapsController.getBestDeparture);
router.get("/maps/price-prediction", mapsController.getPricePrediction);
router.get("/maps/driver-eta", mapsController.getDriverETA);

// Generic public-file upload. Sensitive documents use the private upload routes below.
router.post("/file", uploadLimiter, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!upload.isValidImageFile(req.file)) {
        upload.cleanupFile(req.file);
        return res.status(400).json({ error: "Invalid image file" });
    }

    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    res.status(200).json({ url: `${publicBaseUrl}/public/${req.file.filename}` });
});

// Private uploads.
router.post("/uploads/profile", uploadLimiter, upload.single("profileImage"), uploadController.uploadProfile);
router.post("/uploads/id-photo", uploadLimiter, upload.single("idPhoto"), uploadController.uploadIdPhoto);
router.post("/uploads/license", uploadLimiter, upload.single("licensePhoto"), uploadController.uploadLicense);
router.post("/uploads/vehicle-test", uploadLimiter, upload.single("testPhoto"), uploadController.uploadVehicleTest);
router.post("/uploads/vehicle-insurance", uploadLimiter, upload.single("insurancePhoto"), uploadController.uploadVehicleInsurance);
router.get("/uploads/secure/:kind/:filename", uploadController.getSecureUpload);
router.get("/uploads/pending", adminOnly, uploadController.getPendingVerifications);
router.put("/uploads/verify-id/:userId", adminOnly, uploadController.verifyId);
router.put("/uploads/verify-driver/:driverProfileId", adminOnly, uploadController.verifyDriverLicense);
router.put("/uploads/verify-vehicle/:vehicleId", adminOnly, uploadController.verifyVehicleDocuments);
router.delete("/uploads/profile/:userId", adminOnly, uploadController.deleteProfileImage);
router.delete("/uploads/id-photo/:userId", adminOnly, uploadController.deleteIdPhoto);
router.delete("/uploads/license/:driverProfileId", adminOnly, uploadController.deleteDriverLicensePhoto);
router.delete("/uploads/vehicle-docs/:vehicleId", adminOnly, uploadController.deleteVehicleDocuments);

// Direct redemption was removed because points must be committed atomically with ride creation.
router.post("/points/redeem", (req, res) => {
    res.status(410).json({ error: "Redeem points through ride creation using pointsToRedeem" });
});

// Rides.
router.post("/rides", validate(createRideSchema), rideController.createRide);
router.get("/rides", rideController.getAllRides);
router.get("/rides/:id", rideController.getRideById);
router.put("/rides/:id/accept", validate(acceptRideSchema), rideController.acceptRide);
router.put("/rides/:id/driver-arriving", rideController.driverArriving);
router.put("/rides/:id/start", rideController.startRide);
router.put("/rides/:id/complete", rideController.completeRide);
router.put("/rides/:id/cancel", validate(cancelRideSchema), rideController.cancelRide);
router.put("/rides/:id/admin", adminOnly, rideController.adminUpdateRide);

// Drivers.
router.post("/drivers", driverController.registerDriver);
router.get("/drivers", driverController.getAllDrivers);
router.get("/drivers/available", driverController.getAvailableDrivers);
router.get("/drivers/:id", driverController.getDriverById);
router.put("/drivers/:id", driverController.updateDriver);
router.put("/drivers/:id/status", driverController.updateDriverStatus);
router.put("/drivers/:id/location", driverController.updateLocation);
router.put("/drivers/:id/verify", adminOnly, driverController.verifyDriver);
router.delete("/drivers/:id", adminOnly, driverController.deleteDriver);

// Passengers.
router.post("/passengers", passengerController.registerPassenger);
router.get("/passengers", passengerController.getAllPassengers);
router.get("/passengers/:id", passengerController.getPassengerById);
router.put("/passengers/:id", passengerController.updatePassenger);
router.post("/passengers/:id/saved-locations", passengerController.addSavedLocation);
router.delete("/passengers/:id/saved-locations/:locationId", passengerController.removeSavedLocation);

// Vehicles.
router.post("/vehicles", vehicleController.createVehicle);
router.get("/vehicles", vehicleController.getAllVehicles);
router.get("/vehicles/driver/:driverId", vehicleController.getVehiclesByDriver);
router.get("/vehicles/:id", vehicleController.getVehicleById);
router.put("/vehicles/:id", vehicleController.updateVehicle);
router.delete("/vehicles/:id", vehicleController.deleteVehicle);

// Payments.
router.post("/payments", paymentController.createPayment);
router.get("/payments", paymentController.getAllPayments);
router.get("/payments/ride/:rideId", paymentController.getPaymentByRide);
router.post("/payments/ride/:rideId/simulate", paymentController.simulatePayment);
router.get("/payments/:id", paymentController.getPaymentById);
router.put("/payments/:id/status", paymentController.updatePaymentStatus);
router.put("/payments/:id/refund", paymentController.refundPayment);

// Ratings.
router.post("/ratings", validate(createRatingSchema), ratingController.createRating);
router.get("/ratings", ratingController.getAllRatings);
router.get("/ratings/driver/:driverId", ratingController.getRatingsByDriver);
router.get("/ratings/passenger/:passengerId", ratingController.getRatingsByPassenger);
router.get("/ratings/ride/:rideId", ratingController.getRatingByRide);

// Driver alerts.
router.post("/driver-alerts", driverAlertController.createDriverAlert);
router.get("/driver-alerts/driver/:driverId", driverAlertController.getAlertsByDriver);
router.put("/driver-alerts/driver/:driverId/read-all", driverAlertController.markAllAlertsAsRead);
router.put("/driver-alerts/:id/read", driverAlertController.markAlertAsRead);
router.delete("/driver-alerts/:id", driverAlertController.deleteAlert);

// Ride stops.
router.post("/ride-stops", rideStopController.createRideStop);
router.get("/ride-stops/ride/:rideId", rideStopController.getStopsByRide);
router.put("/ride-stops/:id/arrive", rideStopController.markStopArrived);
router.put("/ride-stops/:id", rideStopController.updateRideStop);
router.delete("/ride-stops/:id", rideStopController.deleteRideStop);

// Notifications.
router.post("/notifications", notificationController.createNotification);
router.post("/notifications/complaint", notificationController.createComplaint);
router.get("/notifications/user/:userId", notificationController.getNotificationsByUser);
router.put("/notifications/user/:userId/read-all", notificationController.markAllAsRead);
router.put("/notifications/:id/read", notificationController.markAsRead);
router.delete("/notifications/:id", notificationController.deleteNotification);

// Carpool.
router.post("/carpool", carpoolController.createCarpoolRequest);
router.get("/carpool", carpoolController.getAllCarpoolRequests);
router.get("/carpool/pending", carpoolController.getPendingRequests);
router.get("/carpool/:id", carpoolController.getCarpoolRequestById);
router.put("/carpool/:id/match", carpoolController.matchCarpoolRequest);
router.put("/carpool/:id/cancel", carpoolController.cancelCarpoolRequest);

module.exports = router;
