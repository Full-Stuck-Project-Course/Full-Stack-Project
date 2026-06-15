// middleware/errorHandler.js

function errorHandler(err, req, res, next) {
    console.error(err.stack);

    if (err.name === "ValidationError") {
        return res.status(400).json({ error: err.message });
    }
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(409).json({ error: `${field} already exists` });
    }
    if (err.name === "CastError") {
        return res.status(400).json({ error: "Invalid ID format" });
    }

    res.status(500).json({ error: "Internal server error" });
}

module.exports = errorHandler;
