// controllers/notificationController.js

const Notification = require("../db/models/Notification");
const { sameId, isAdmin, forbidden } = require("../utils/authz");

// POST /notifications
async function createNotification(req, res) {
    try {
        if (!isAdmin(req) && !sameId(req.user.userId, req.body.userId)) {
            return forbidden(res);
        }
        const notification = await Notification.create(req.body);
        res.status(201).json({ message: "Notification created", notification });
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

        const notifications = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .limit(Number(limit));

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
    createNotification, getNotificationsByUser,
    markAsRead, markAllAsRead, deleteNotification
};
