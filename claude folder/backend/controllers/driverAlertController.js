// controllers/driverAlertController.js

const DriverAlert = require("../db/models/DriverAlert");
const { isAdmin, canAccessDriver, forbidden } = require("../utils/authz");

// POST /driver-alerts
async function createDriverAlert(req, res) {
    try {
        if (!isAdmin(req) && !await canAccessDriver(req, req.body.driverId)) {
            return forbidden(res);
        }
        const alert = await DriverAlert.create(req.body);
        res.status(201).json({ message: "Alert created", alert });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /driver-alerts/driver/:driverId
async function getAlertsByDriver(req, res) {
    try {
        if (!await canAccessDriver(req, req.params.driverId)) {
            return forbidden(res);
        }
        const { unreadOnly } = req.query;
        const filter = { driverId: req.params.driverId };
        if (unreadOnly === "true") filter.isRead = false;

        const alerts = await DriverAlert.find(filter).sort({ createdAt: -1 });
        res.status(200).json(alerts);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /driver-alerts/:id/read
async function markAlertAsRead(req, res) {
    try {
        const existing = await DriverAlert.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Alert not found" });
        if (!await canAccessDriver(req, existing.driverId)) return forbidden(res);

        const alert = await DriverAlert.findByIdAndUpdate(
            req.params.id, { isRead: true }, { new: true }
        );
        if (!alert) return res.status(404).json({ error: "Alert not found" });
        res.status(200).json({ message: "Alert marked as read", alert });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /driver-alerts/driver/:driverId/read-all
async function markAllAlertsAsRead(req, res) {
    try {
        if (!await canAccessDriver(req, req.params.driverId)) {
            return forbidden(res);
        }
        await DriverAlert.updateMany(
            { driverId: req.params.driverId, isRead: false },
            { isRead: true }
        );
        res.status(200).json({ message: "All alerts marked as read" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /driver-alerts/:id
async function deleteAlert(req, res) {
    try {
        const existing = await DriverAlert.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Alert not found" });
        if (!await canAccessDriver(req, existing.driverId)) return forbidden(res);

        await DriverAlert.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Alert deleted" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createDriverAlert, getAlertsByDriver, markAlertAsRead, markAllAlertsAsRead, deleteAlert
};
