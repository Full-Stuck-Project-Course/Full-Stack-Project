// controllers/translateController.js

const axios = require("axios");
const SUPPORTED_TARGET_LANG = "he";

function rejectUnsupportedTargetLang(targetLang, res) {
    if (!targetLang || targetLang === SUPPORTED_TARGET_LANG) return false;
    res.status(400).json({ error: "Only Hebrew translation is supported" });
    return true;
}

// POST /api/translate
async function translate(req, res) {
    try {
        const { text, targetLang = SUPPORTED_TARGET_LANG, sourceLang = "auto" } = req.body;
        if (!text) return res.status(400).json({ error: "text is required" });
        if (rejectUnsupportedTargetLang(targetLang, res)) return;

        const key = process.env.GOOGLE_MAPS_API_KEY; // same key works for Translate API
        if (!key || key === "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
            return res.json({ translatedText: text, note: "Translation API key not configured" });
        }

        const { data } = await axios.post(
            `https://translation.googleapis.com/language/translate/v2`,
            null,
            {
                params: {
                    q: text,
                    target: SUPPORTED_TARGET_LANG,
                    source: sourceLang !== "auto" ? sourceLang : undefined,
                    key
                }
            }
        );

        const translatedText = data?.data?.translations?.[0]?.translatedText || text;
        res.json({ translatedText, detectedLanguage: data?.data?.translations?.[0]?.detectedSourceLanguage });
    } catch (error) {
        res.status(502).json({ translatedText: req.body.text, error: "Translation failed" });
    }
}

// POST /api/translate/batch
async function translateBatch(req, res) {
    try {
        const { texts, targetLang = SUPPORTED_TARGET_LANG } = req.body;
        if (!texts || !Array.isArray(texts)) return res.status(400).json({ error: "texts array is required" });
        if (rejectUnsupportedTargetLang(targetLang, res)) return;

        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key || key === "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
            return res.json({ translations: texts.map(t => ({ original: t, translated: t })) });
        }

        const { data } = await axios.post(
            `https://translation.googleapis.com/language/translate/v2`,
            null,
            { params: { q: texts, target: SUPPORTED_TARGET_LANG, key } }
        );

        const results = data?.data?.translations?.map((t, i) => ({
            original: texts[i],
            translated: t.translatedText
        })) || texts.map(t => ({ original: t, translated: t }));

        res.json({ translations: results });
    } catch (error) {
        const texts = Array.isArray(req.body.texts) ? req.body.texts : [];
        res.status(502).json({
            error: "Translation failed",
            translations: texts.map(t => ({ original: t, translated: t }))
        });
    }
}

module.exports = { translate, translateBatch };
