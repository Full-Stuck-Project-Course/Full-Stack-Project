const Joi = require("joi");

const passwordSchema = Joi.string()
    .min(8)
    .max(128)
    .pattern(/[A-Z]/, "uppercase letter")
    .pattern(/[a-z]/, "lowercase letter")
    .pattern(/[0-9]/, "digit")
    .messages({
        "string.min":            "סיסמה חייבת להכיל לפחות 8 תווים",
        "string.max":            "סיסמה יכולה להכיל עד 128 תווים",
        "string.pattern.name":   "סיסמה חייבת להכיל לפחות אות גדולה, אות קטנה ומספר",
    });

const registerSchema = Joi.object({
    fullName:          Joi.string().min(2).required(),
    email:             Joi.string().email().required(),
    password:          passwordSchema.required(),
    phone:             Joi.string().pattern(/^05\d{8}$/).required(),
    role:              Joi.string().valid("passenger", "driver", "both").optional(),
    preferredLanguage: Joi.string().valid("he", "en").optional(),
    gender:            Joi.string().valid("male", "female").optional().allow(null, ""),
    referralCode:      Joi.string().optional(),
});

const loginSchema = Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().required(),
});

const googleLoginSchema = Joi.object({
    credential: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
    token:       Joi.string().trim().optional(),
    email:       Joi.string().email().optional(),
    code:        Joi.string().pattern(/^\d{6}$/).optional(),
    newPassword: passwordSchema.required(),
}).custom((value, helpers) => {
    if (value.token || (value.email && value.code)) return value;
    return helpers.error("any.custom");
}).messages({
    "any.custom": "נדרש קישור איפוס או אימייל וקוד אימות",
});

const updateUserSchema = Joi.object({
    fullName:          Joi.string().min(2).optional(),
    phone:             Joi.string().pattern(/^05\d{8}$/).optional(),
    preferredLanguage: Joi.string().valid("he", "en").optional(),
    gender:            Joi.string().valid("male", "female").optional().allow(null, ""),
    profileImage:      Joi.string().optional().allow(null, ""),
    role:              Joi.string().valid("passenger", "driver", "both", "admin").optional(),
    isActive:          Joi.boolean().optional(),
});

const completeProfileSchema = Joi.object({
    fullName:          Joi.string().trim().min(2).required(),
    phone:             Joi.string().pattern(/^05\d{8}$/).required(),
    role:              Joi.string().valid("passenger", "driver", "both").required(),
    preferredLanguage: Joi.string().valid("he", "en").required(),
});

const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword:     passwordSchema.required(),
});

module.exports = {
    registerSchema,
    loginSchema,
    googleLoginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    updateUserSchema,
    completeProfileSchema,
    changePasswordSchema,
};
