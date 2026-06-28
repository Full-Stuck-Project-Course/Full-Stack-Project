const Joi = require("joi");

const locationSchema = Joi.object({
    address: Joi.string().required(),
    lat:     Joi.number().required(),
    lng:     Joi.number().required(),
});

const createRideSchema = Joi.object({
    passengerId:              Joi.string().required(),
    rideType:                 Joi.string().valid("ride", "delivery", "carpool").optional(),
    pickupLocation:           locationSchema.required(),
    destinationLocation:      locationSchema.required(),
    passengerCount:           Joi.number().min(1).optional(),
    scheduledTime:            Joi.date().optional().allow(null),
    vehicleType:              Joi.string().optional(),
    basePrice:                Joi.number().optional(),
    finalPrice:               Joi.number().optional(),
    distanceKm:               Joi.number().optional(),
    estimatedDurationMinutes: Joi.number().optional(),
    surgeMultiplier:          Joi.number().optional(),
});

const acceptRideSchema = Joi.object({
    driverId:  Joi.string().required(),
    vehicleId: Joi.string().optional().allow(null, ""),
});

const cancelRideSchema = Joi.object({
    cancelledBy:        Joi.string().valid("passenger", "driver", "system").optional(),
    cancellationReason: Joi.string().optional().allow(""),
});

module.exports = {
    createRideSchema,
    acceptRideSchema,
    cancelRideSchema,
};
