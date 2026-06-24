// controllers/rideController.js

const Ride = require("../db/models/Ride");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");

// POST /rides
async function createRide(req, res) {
    try {
        const ride = await Ride.create(req.body);
        res.status(201).json({ message: "Ride created successfully", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /rides
async function getAllRides(req, res) {
    try {
        const { status, rideType, driverId, passengerId } = req.query;
        const filter = {};
        if (status)      filter.status = status;
        if (rideType)    filter.rideType = rideType;
        if (driverId)    filter.driverId = driverId;
        if (passengerId) filter.passengerId = passengerId;

        // Non-admin users see only their own rides (unless querying open rides for drivers)
        if (req.user?.role !== "admin" && !driverId && !passengerId && status !== "searching") {
            const pProfile = await PassengerProfile.findOne({ userId: req.user.userId });
            const dProfile = await DriverProfile.findOne({ userId: req.user.userId });
            const ids = [];
            if (pProfile) ids.push({ passengerId: pProfile._id });
            if (dProfile) ids.push({ driverId: dProfile._id });
            if (ids.length > 0) filter.$or = ids;
            else filter.passengerId = "000000000000000000000000";
        }

        const rides = await Ride.find(filter)
            .populate("passengerId")
            .populate("driverId")
            .populate("vehicleId")
            .sort({ createdAt: -1 });

        res.status(200).json(rides);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /rides/:id
async function getRideById(req, res) {
    try {
        const ride = await Ride.findById(req.params.id)
            .populate("passengerId")
            .populate("driverId")
            .populate("vehicleId");

        if (!ride) return res.status(404).json({ error: "Ride not found" });
        res.status(200).json(ride);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/accept
async function acceptRide(req, res) {
    try {
        const { driverId, vehicleId } = req.body;

        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "searching") return res.status(400).json({ error: "Ride is no longer available" });

        ride.driverId = driverId;
        ride.vehicleId = vehicleId;
        ride.status = "accepted";
        await ride.save();

        await DriverProfile.findByIdAndUpdate(driverId, { status: "busy" });

        res.status(200).json({ message: "Ride accepted", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/start
async function startRide(req, res) {
    try {
        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "driver_arriving" && ride.status !== "accepted") {
            return res.status(400).json({ error: "Cannot start ride in current status" });
        }

        ride.status = "in_progress";
        ride.startedAt = new Date();
        await ride.save();

        res.status(200).json({ message: "Ride started", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/complete
async function completeRide(req, res) {
    try {
        const { finalPrice, distanceKm, durationMinutes } = req.body;

        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "in_progress") return res.status(400).json({ error: "Ride is not in progress" });

        ride.status = "completed";
        ride.completedAt = new Date();
        if (finalPrice !== undefined) ride.finalPrice = finalPrice;
        if (distanceKm !== undefined) ride.distanceKm = distanceKm;
        if (durationMinutes !== undefined) ride.estimatedDurationMinutes = durationMinutes;
        await ride.save();

        // Update driver stats
        if (ride.driverId) {
            await DriverProfile.findByIdAndUpdate(ride.driverId, {
                $inc: { totalRides: 1, totalEarnings: ride.finalPrice },
                status: "available"
            });
        }

        // Update passenger stats
        await PassengerProfile.findByIdAndUpdate(ride.passengerId, {
            $inc: { totalRides: 1 }
        });

        res.status(200).json({ message: "Ride completed", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/cancel
async function cancelRide(req, res) {
    try {
        const { cancelledBy, cancellationReason } = req.body;

        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (["completed", "cancelled"].includes(ride.status)) {
            return res.status(400).json({ error: "Cannot cancel a finished ride" });
        }

        ride.status = "cancelled";
        ride.cancelledAt = new Date();
        ride.cancelledBy = cancelledBy || "passenger";
        ride.cancellationReason = cancellationReason || "";
        await ride.save();

        // Free up driver if assigned
        if (ride.driverId) {
            await DriverProfile.findByIdAndUpdate(ride.driverId, { status: "available" });
        }

        res.status(200).json({ message: "Ride cancelled", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/driver-arriving
async function driverArriving(req, res) {
    try {
        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "accepted") return res.status(400).json({ error: "Ride must be accepted first" });

        ride.status = "driver_arriving";
        await ride.save();

        res.status(200).json({ message: "Driver is arriving", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createRide, getAllRides, getRideById,
    acceptRide, startRide, completeRide, cancelRide, driverArriving
};
