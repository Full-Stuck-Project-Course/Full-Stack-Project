// controllers/rideController.js

const Ride = require("../db/models/Ride");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Vehicle = require("../db/models/Vehicle");
const {
    sameId,
    isAdmin,
    getPassengerProfileForUser,
    getDriverProfileForUser,
    forbidden
} = require("../utils/authz");

const DISPATCH_WINDOW_MS = 15 * 60 * 1000;

function readyForDispatchFilter(date = new Date()) {
    return {
        $or: [
            { scheduledTime: null },
            { scheduledTime: { $lte: new Date(date.getTime() + DISPATCH_WINDOW_MS) } }
        ]
    };
}

async function canAccessRide(req, ride) {
    if (isAdmin(req)) return true;

    const [passenger, driver] = await Promise.all([
        getPassengerProfileForUser(req.user.userId),
        getDriverProfileForUser(req.user.userId)
    ]);

    return Boolean(
        (passenger && sameId(passenger._id, ride.passengerId)) ||
        (driver && sameId(driver._id, ride.driverId))
    );
}

async function getPopulatedRide(id) {
    return Ride.findById(id)
        .populate({
            path: "passengerId",
            populate: { path: "userId", select: "fullName profileImage preferredLanguage" }
        })
        .populate({
            path: "driverId",
            populate: { path: "userId", select: "fullName profileImage preferredLanguage" }
        })
        .populate("vehicleId");
}

// POST /rides
async function createRide(req, res) {
    try {
        let passengerId = req.body.passengerId;

        if (!isAdmin(req)) {
            const passenger = await getPassengerProfileForUser(req.user.userId);
            if (!passenger) return res.status(400).json({ error: "Passenger profile not found" });
            passengerId = passenger._id;
        } else if (!passengerId) {
            return res.status(400).json({ error: "passengerId is required for admin ride creation" });
        }

        const ride = await Ride.create({
            ...req.body,
            passengerId,
            driverId: null,
            vehicleId: null,
            status: "searching"
        });

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
        if (status)   filter.status = status;
        if (rideType) filter.rideType = rideType;

        if (isAdmin(req)) {
            if (driverId)    filter.driverId = driverId;
            if (passengerId) filter.passengerId = passengerId;
        } else {
            const [passenger, driver] = await Promise.all([
                getPassengerProfileForUser(req.user.userId),
                getDriverProfileForUser(req.user.userId)
            ]);

            if (driverId) {
                if (!driver || !sameId(driver._id, driverId)) return forbidden(res);
                filter.driverId = driver._id;
            } else if (passengerId) {
                if (!passenger || !sameId(passenger._id, passengerId)) return forbidden(res);
                filter.passengerId = passenger._id;
            } else if (status === "searching") {
                if (!driver || !driver.isVerified) return res.status(200).json([]);
                Object.assign(filter, readyForDispatchFilter());
            } else {
                const ownFilters = [];
                if (passenger) ownFilters.push({ passengerId: passenger._id });
                if (driver) ownFilters.push({ driverId: driver._id });
                if (ownFilters.length === 0) return res.status(200).json([]);
                filter.$or = ownFilters;
            }
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
        const ride = await getPopulatedRide(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);

        res.status(200).json(ride);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/accept
async function acceptRide(req, res) {
    try {
        let driverId = req.body.driverId;

        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver) return res.status(400).json({ error: "Driver profile not found" });
            driverId = driver._id;
        }

        const driver = await DriverProfile.findById(driverId);
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        if (!driver.isVerified) return res.status(403).json({ error: "Driver must be verified before accepting rides" });
        if (driver.status !== "available") return res.status(400).json({ error: "Driver must be available to accept rides" });

        let vehicleId = req.body.vehicleId || null;
        if (vehicleId) {
            const vehicle = await Vehicle.findOne({ _id: vehicleId, driverId, isActive: true });
            if (!vehicle) return res.status(400).json({ error: "Vehicle does not belong to this driver" });
        } else {
            const vehicle = await Vehicle.findOne({ driverId, isActive: true }).sort({ createdAt: -1 });
            vehicleId = vehicle?._id || null;
        }

        const ride = await Ride.findOneAndUpdate(
            {
                _id: req.params.id,
                status: "searching",
                ...readyForDispatchFilter()
            },
            {
                $set: {
                    driverId,
                    vehicleId,
                    status: "accepted"
                }
            },
            { new: true, runValidators: true }
        );

        if (!ride) {
            const existing = await Ride.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: "Ride not found" });
            if (existing.status !== "searching") return res.status(409).json({ error: "Ride is no longer available" });
            return res.status(400).json({ error: "Scheduled ride is not open for drivers yet" });
        }

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
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver || !sameId(driver._id, ride.driverId)) return forbidden(res, "Only the assigned driver can start the ride");
        }
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
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver || !sameId(driver._id, ride.driverId)) return forbidden(res, "Only the assigned driver can complete the ride");
        }
        if (ride.status !== "in_progress") return res.status(400).json({ error: "Ride is not in progress" });

        ride.status = "completed";
        ride.completedAt = new Date();
        if (finalPrice !== undefined) ride.finalPrice = finalPrice;
        if (distanceKm !== undefined) ride.distanceKm = distanceKm;
        if (durationMinutes !== undefined) ride.estimatedDurationMinutes = durationMinutes;
        await ride.save();

        if (ride.driverId) {
            await DriverProfile.findByIdAndUpdate(ride.driverId, {
                $inc: { totalRides: 1, totalEarnings: ride.finalPrice || 0 },
                status: "available"
            });
        }

        await PassengerProfile.findByIdAndUpdate(ride.passengerId, {
            $inc: { totalRides: 1, totalSpent: ride.finalPrice || 0 }
        });

        res.status(200).json({ message: "Ride completed", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/cancel
async function cancelRide(req, res) {
    try {
        const { cancellationReason } = req.body;

        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (["completed", "cancelled"].includes(ride.status)) {
            return res.status(400).json({ error: "Cannot cancel a finished ride" });
        }

        let cancelledBy = "passenger";
        if (isAdmin(req)) cancelledBy = req.body.cancelledBy || "system";
        else {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (driver && sameId(driver._id, ride.driverId)) cancelledBy = "driver";
        }

        ride.status = "cancelled";
        ride.cancelledAt = new Date();
        ride.cancelledBy = cancelledBy;
        ride.cancellationReason = cancellationReason || "";
        await ride.save();

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
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver || !sameId(driver._id, ride.driverId)) return forbidden(res, "Only the assigned driver can update arrival");
        }
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
