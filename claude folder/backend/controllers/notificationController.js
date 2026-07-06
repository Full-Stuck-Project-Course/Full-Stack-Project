// controllers/notificationController.js

const Notification = require("../db/models/Notification");
const User = require("../db/models/User");
const Ride = require("../db/models/Ride");
const {
    sameId,
    isAdmin,
    forbidden,
    getPassengerProfileForUser,
    getDriverProfileForUser
} = require("../utils/authz");

function trimText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

// POST /notifications
async function createNotification(req, res) {
    try {
        if (!isAdmin(req)) return forbidden(res, "Admin access required");

        const payload = {
            userId: req.body.userId,
            type: req.body.type,
            title: trimText(req.body.title, 120),
            body: trimText(req.body.body, 1000),
            rideId: req.body.rideId || null
        };

        if (!payload.title || !payload.body) {
            return res.status(400).json({ error: "Notification title and body are required" });
        }

        const notification = await Notification.create(payload);
        res.status(201).json({ message: "Notification created", notification });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /notifications/complaint
async function createComplaint(req, res) {
    try {
        const { rideId, body } = req.body;
        const complaint = trimText(body, 1000);
        if (!rideId || !complaint) {
            return res.status(400).json({ error: "rideId and complaint body are required" });
        }

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });

        if (!isAdmin(req)) {
            const [passenger, driver] = await Promise.all([
                getPassengerProfileForUser(req.user.userId),
                getDriverProfileForUser(req.user.userId)
            ]);
            const allowed = (passenger && sameId(passenger._id, ride.passengerId)) ||
                (driver && sameId(driver._id, ride.driverId));
            if (!allowed) return forbidden(res);
        }

        const admins = await User.find({ role: "admin", isActive: true }).select("_id");
        if (admins.length === 0) {
            return res.status(503).json({ error: "No admin users configured to receive complaints" });
        }

        const notifications = await Notification.insertMany(admins.map(admin => ({
            userId: admin._id,
            type: "system",
            title: "Ride complaint",
            body: `Ride ${rideId}: ${complaint}`,
            rideId
        })));

        res.status(201).json({ message: "Complaint sent to admins", notificationsCreated: notifications.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /notifications/user/:userId
async function getNotificationsByUser(req, res) {
    try {
        if (!isAdmin(req) && !sameId(req.user.userId, req.params.userId)) {
            return forbidden(res);
        }
        const { unreadOnly, limit = 50 } = req.query;
        const filter = { userId: req.params.userId };
        if (unreadOnly === "true") filter.isRead = false;

        const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
        const notifications = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .limit(safeLimit);

        res.status(200).json(notifications);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /notifications/:id/read
async function markAsRead(req, res) {
    try {
        const existing = await Notification.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Notification not found" });
        if (!isAdmin(req) && !sameId(req.user.userId, existing.userId)) return forbidden(res);

        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            { isRead: true, readAt: new Date() },
            { new: true }
        );
        if (!notification) return res.status(404).json({ error: "Notification not found" });
        res.status(200).json({ message: "Marked as read", notification });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /notifications/user/:userId/read-all
async function markAllAsRead(req, res) {
    try {
        if (!isAdmin(req) && !sameId(req.user.userId, req.params.userId)) {
            return forbidden(res);
        }
        await Notification.updateMany(
            { userId: req.params.userId, isRead: false },
            { isRead: true, readAt: new Date() }
        );
        res.status(200).json({ message: "All notifications marked as read" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /notifications/:id
async function deleteNotification(req, res) {
    try {
        const existing = await Notification.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Notification not found" });
        if (!isAdmin(req) && !sameId(req.user.userId, existing.userId)) return forbidden(res);

        await Notification.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Notification deleted" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createNotification,
    createComplaint,
    getNotificationsByUser,
    markAsRead,
    markAllAsRead,
    deleteNotification
};
