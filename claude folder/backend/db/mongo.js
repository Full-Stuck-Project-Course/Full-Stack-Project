// db/mongo.js

const mongoose = require("mongoose");

const connectMongo = async () => {
    const uri = process.env.DB_CONNECTION;

    if (!uri) {
        console.error("MongoDB connection error: DB_CONNECTION is missing. Create backend/.env from backend/.env.example and set DB_CONNECTION.");
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    }
};

module.exports = connectMongo;
