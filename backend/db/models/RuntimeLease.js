const mongoose = require("mongoose");

const runtimeLeaseSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    ownerId: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true,
    versionKey: false
});

runtimeLeaseSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("RuntimeLease", runtimeLeaseSchema);
