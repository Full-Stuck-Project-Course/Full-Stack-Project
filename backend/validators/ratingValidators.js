const Joi = require("joi");

const ratingDirections = ["passenger_to_driver", "driver_to_passenger"];

const createRatingSchema = Joi.object({
    rideId:        Joi.string().required(),
    passengerId:   Joi.string().optional(),
    driverId:      Joi.string().optional(),
    direction:     Joi.string().valid(...ratingDirections).optional(),
    rating:        Joi.number().min(1).max(5).required(),
    comment:       Joi.string().max(500).optional().allow(""),
    complaint:     Joi.string().max(1000).optional().allow(""),
    tags:          Joi.array().items(Joi.string()).optional(),
    wouldRideAgain: Joi.boolean().optional(),
});

module.exports = {
    createRatingSchema,
};
