const { estimateRidePrice } = require("../services/pricingService");

async function estimate(req, res) {
    try {
        const quote = await estimateRidePrice(req.body);
        res.status(200).json(quote);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = { estimate };
