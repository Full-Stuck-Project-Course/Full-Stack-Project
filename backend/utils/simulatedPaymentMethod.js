function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
}

function isValidFutureExpiry(expiry, date = new Date()) {
    if (!/^\d{4}-\d{2}$/.test(expiry)) return false;
    const [year, month] = expiry.split("-").map(Number);
    if (month < 1 || month > 12) return false;

    const currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const expiryMonth = new Date(year, month - 1, 1);
    return expiryMonth >= currentMonth;
}

function detectCardBrand(cardNumber) {
    const digits = digitsOnly(cardNumber);
    if (/^4/.test(digits)) return "visa";
    if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(digits)) return "mastercard";
    if (/^3[47]/.test(digits)) return "amex";
    return "other";
}

function normalizePaymentMethodInput(body, { requireCvv = false } = {}) {
    const cardholderName = String(body?.cardholderName || "").trim();
    const cardNumber = digitsOnly(body?.cardNumber);
    const expiry = String(body?.expiry || "").trim();
    const cvv = digitsOnly(body?.cvv);

    if (!cardholderName) return { error: "Cardholder name is required" };
    if (cardNumber.length < 12 || cardNumber.length > 19) {
        return { error: "Card number must contain 12 to 19 digits" };
    }
    if (!isValidFutureExpiry(expiry)) return { error: "Expiry month must be current or future" };
    if (requireCvv && !/^\d{3,4}$/.test(cvv)) return { error: "CVV must contain 3 or 4 digits" };

    return {
        cardholderName,
        cardBrand: detectCardBrand(cardNumber),
        cardLast4: cardNumber.slice(-4),
        expiry
    };
}

function normalizeSavedPaymentMethod(body) {
    return normalizePaymentMethodInput(body, { requireCvv: false });
}

function validateSimulatedCard(body) {
    return normalizePaymentMethodInput(body, { requireCvv: true });
}

function validateStoredPaymentMethod(method) {
    const cardholderName = String(method?.cardholderName || "").trim();
    const cardLast4 = digitsOnly(method?.cardLast4);
    const expiry = String(method?.expiry || "").trim();
    const cardBrand = ["visa", "mastercard", "amex", "other"].includes(method?.cardBrand)
        ? method.cardBrand
        : "other";

    if (!cardholderName || !/^\d{4}$/.test(cardLast4)) {
        return { error: "Saved payment method is missing" };
    }
    if (!isValidFutureExpiry(expiry)) return { error: "Saved payment method is expired" };

    return { cardholderName, cardBrand, cardLast4, expiry };
}

module.exports = {
    digitsOnly,
    detectCardBrand,
    isValidFutureExpiry,
    normalizeSavedPaymentMethod,
    validateSimulatedCard,
    validateStoredPaymentMethod
};
