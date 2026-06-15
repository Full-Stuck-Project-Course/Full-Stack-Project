// routes/index.js

const express  = require("express");
const router   = express.Router();
const upload   = require("../middleware/upload");

const userController         = require("../controllers/userController");
const rideController         = require("../controllers/rideController");
const driverController       = require("../controllers/driverController");
const passengerController    = require("../controllers/passengerController");
const vehicleController      = require("../controllers/vehicleController");
const paymentController      = require("../controllers/paymentController");
const ratingController       = require("../controllers/ratingController");
const driverAlertController  = require("../controllers/driverAlertController");
const rideStopController     = require("../controllers/rideStopController");
const notificationController = require("../controllers/notificationController");
const carpoolController      = require("../controllers/carpoolController");
const mapsController         = require("../controllers/mapsController");
const uploadController       = require("../controllers/uploadController");

// ── Auth / Users ──────────────────────────────────────────────────────────────
router.post  ("/users/register",           userController.register);
router.post  ("/users/login",              userController.login);
router.post  ("/users/forgot-password",    userController.forgotPassword);
router.post  ("/users/reset-password",     userController.resetPassword);
router.get   ("/users",                    userController.getAllUsers);
router.get   ("/users/:id",                userController.getUserById);
router.put   ("/users/:id",                userController.updateUser);
router.put   ("/users/:id/password",       userController.changePassword);
router.delete("/users/:id",                userController.deleteUser);

// ── Google Maps / Pricing ─────────────────────────────────────────────────────
router.get("/maps/distance-price",  mapsController.getDistanceAndPrice);
router.get("/maps/nearby-drivers",  mapsController.getNearbyDrivers);
router.get("/maps/demand",          mapsController.getDemandInfo);
router.get("/maps/best-departure",  mapsController.getBestDeparture);

// ── Uploads ───────────────────────────────────────────────────────────────────
router.post("/uploads/profile",  upload.single("profileImage"), uploadController.uploadProfile);
router.post("/uploads/id-photo", upload.single("idPhoto"),      uploadController.uploadIdPhoto);
router.post("/uploads/license",  upload.single("licensePhoto"), uploadController.uploadLicense);
router.get ("/uploads/pending",  uploadController.getPendingVerifications);
router.put ("/uploads/verify-id/:userId",              uploadController.verifyId);
router.put ("/uploads/verify-driver/:driverProfileId", uploadController.verifyDriverLicense);

// ── Rides ─────────────────────────────────────────────────────────────────────
router.post  ("/rides",                     rideController.createRide);
router.get   ("/rides",                     rideController.getAllRides);
router.get   ("/rides/:id",                 rideController.getRideById);
router.put   ("/rides/:id/accept",          rideController.acceptRide);
router.put   ("/rides/:id/driver-arriving", rideController.driverArriving);
router.put   ("/rides/:id/start",           rideController.startRide);
router.put   ("/rides/:id/complete",        rideController.completeRide);
router.put   ("/rides/:id/cancel",          rideController.cancelRide);

// ── Drivers ───────────────────────────────────────────────────────────────────
router.post  ("/drivers",                   driverController.registerDriver);
router.get   ("/drivers",                   driverController.getAllDrivers);
router.get   ("/drivers/available",         driverController.getAvailableDrivers);
router.get   ("/drivers/:id",               driverController.getDriverById);
router.put   ("/drivers/:id",               driverController.updateDriver);
router.put   ("/drivers/:id/status",        driverController.updateDriverStatus);
router.put   ("/drivers/:id/location",      driverController.updateLocation);
router.put   ("/drivers/:id/verify",        driverController.verifyDriver);

// ── Passengers ────────────────────────────────────────────────────────────────
router.post  ("/passengers",                              passengerController.registerPassenger);
router.get   ("/passengers",                              passengerController.getAllPassengers);
router.get   ("/passengers/:id",                          passengerController.getPassengerById);
router.put   ("/passengers/:id",                          passengerController.updatePassenger);
router.post  ("/passengers/:id/saved-locations",          passengerController.addSavedLocation);
router.delete("/passengers/:id/saved-locations/:locationId", passengerController.removeSavedLocation);

// ── Vehicles ──────────────────────────────────────────────────────────────────
router.post  ("/vehicles",                  vehicleController.createVehicle);
router.get   ("/vehicles",                  vehicleController.getAllVehicles);
router.get   ("/vehicles/driver/:driverId", vehicleController.getVehiclesByDriver);
router.get   ("/vehicles/:id",              vehicleController.getVehicleById);
router.put   ("/vehicles/:id",              vehicleController.updateVehicle);
router.delete("/vehicles/:id",              vehicleController.deleteVehicle);

// ── Payments ──────────────────────────────────────────────────────────────────
router.post  ("/payments",                  paymentController.createPayment);
router.get   ("/payments",                  paymentController.getAllPayments);
router.get   ("/payments/ride/:rideId",     paymentController.getPaymentByRide);
router.get   ("/payments/:id",              paymentController.getPaymentById);
router.put   ("/payments/:id/status",       paymentController.updatePaymentStatus);
router.put   ("/payments/:id/refund",       paymentController.refundPayment);

// ── Ratings ───────────────────────────────────────────────────────────────────
router.post  ("/ratings",                          ratingController.createRating);
router.get   ("/ratings",                          ratingController.getAllRatings);
router.get   ("/ratings/driver/:driverId",         ratingController.getRatingsByDriver);
router.get   ("/ratings/passenger/:passengerId",   ratingController.getRatingsByPassenger);
router.get   ("/ratings/ride/:rideId",             ratingController.getRatingByRide);

// ── Driver Alerts ─────────────────────────────────────────────────────────────
router.post  ("/driver-alerts",                           driverAlertController.createDriverAlert);
router.get   ("/driver-alerts/driver/:driverId",          driverAlertController.getAlertsByDriver);
router.put   ("/driver-alerts/driver/:driverId/read-all", driverAlertController.markAllAlertsAsRead);
router.put   ("/driver-alerts/:id/read",                  driverAlertController.markAlertAsRead);
router.delete("/driver-alerts/:id",                       driverAlertController.deleteAlert);

// ── Ride Stops ────────────────────────────────────────────────────────────────
router.post  ("/ride-stops",              rideStopController.createRideStop);
router.get   ("/ride-stops/ride/:rideId", rideStopController.getStopsByRide);
router.put   ("/ride-stops/:id/arrive",   rideStopController.markStopArrived);
router.put   ("/ride-stops/:id",          rideStopController.updateRideStop);
router.delete("/ride-stops/:id",          rideStopController.deleteRideStop);

// ── Notifications ─────────────────────────────────────────────────────────────
router.post  ("/notifications",                          notificationController.createNotification);
router.get   ("/notifications/user/:userId",             notificationController.getNotificationsByUser);
router.put   ("/notifications/user/:userId/read-all",    notificationController.markAllAsRead);
router.put   ("/notifications/:id/read",                 notificationController.markAsRead);
router.delete("/notifications/:id",                      notificationController.deleteNotification);

// ── Carpool ───────────────────────────────────────────────────────────────────
router.post  ("/carpool",              carpoolController.createCarpoolRequest);
router.get   ("/carpool",              carpoolController.getAllCarpoolRequests);
router.get   ("/carpool/pending",      carpoolController.getPendingRequests);
router.get   ("/carpool/:id",          carpoolController.getCarpoolRequestById);
router.put   ("/carpool/:id/match",    carpoolController.matchCarpoolRequest);
router.put   ("/carpool/:id/cancel",   carpoolController.cancelCarpoolRequest);

module.exports = router;
