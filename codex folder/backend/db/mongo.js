// db/mongo.js

const mongoose = require("mongoose");

const connectMongo = async () => {
    try {
        await mongoose.connect(process.env.DB_CONNECTION);
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    }
};

module.exports = connectMongo;
