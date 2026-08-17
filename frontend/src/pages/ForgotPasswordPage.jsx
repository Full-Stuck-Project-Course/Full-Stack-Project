// src/pages/ForgotPasswordPage.jsx

import { useState } from "react";
import { Link, useSearchParams } from "../routing";
import api from "../api/axios";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 },
    card: { background: "var(--surface)", borderRadius: 18, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "var(--shadow-lg)" },
    title: { fontSize: 24, fontWeight: 800, marginBottom: 6, color: "var(--text)" },
    sub: { color: "var(--text-muted)", marginBottom: 28, fontSize: 14, lineHeight: 1.6 },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 20 },
    footer: { textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--text-muted)" },
    link: { color: "var(--primary)", fontWeight: 700 },
    resetBox: {
        background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12,
        padding: 20, marginTop: 20
    }
};

function toLocalResetPath(resetLink) {
    try {
        const url = new URL(resetLink);
        return `${url.pathname}${url.search}`;
    } catch {
        return resetLink
            .replace("http://localhost:3000", "")
            .replace("http://127.0.0.1:3000", "");
    }
}

// "The mail did not go out" has several causes needing opposite fixes, so the
// server tags each failure with a code rather than leaving the page to guess.
const DELIVERY_FAILURE_MESSAGES = {
    MAIL_CREDENTIALS_REJECTED: "שירות הדואר דחה את פרטי ההתחברות של השרת, ולכן המייל לא נשלח. יש לבדוק את מפתח ה-API ואת כתובת השולח המאומתת.",
    MAIL_SERVER_UNREACHABLE: "לא הצלחנו להגיע לשרת הדואר בזמן. ייתכן שהחיבור חסום מהסביבה שבה רץ השרת.",
    MAIL_SEND_FAILED: "שליחת המייל נכשלה. יש לבדוק את הגדרות שירות הדואר בשרת."
};

function forgotPasswordErrorMessage(message, code) {
    if (DELIVERY_FAILURE_MESSAGES[code]) return DELIVERY_FAILURE_MESSAGES[code];
    if (!message) return "שגיאה";
    if (message.includes("delivery is not configured")) {
        return "שליחת מיילים לא מוגדרת בשרת, ולכן לא נשלח קוד אימות. יש להשלים את הגדרות שרת הדואר.";
    }
    if (message.includes("send password reset email")) return DELIVERY_FAILURE_MESSAGES.MAIL_SEND_FAILED;
    return message;
}

export default function ForgotPasswordPage() {
    const [params] = useSearchParams();
    const [email,    setEmail]    = useState(params.get("email") || "");
    const [error,    setError]    = useState("");
    const [loading,  setLoading]  = useState(false);
    const [resetLink, setResetLink] = useState("");
    const [resetCode, setResetCode] = useState("");
    const [deliveryConfigured, setDeliveryConfigured] = useState(true);
    const [submitted, setSubmitted] = useState(false);
    const resetCodePath = `/reset-password?email=${encodeURIComponent(email)}${resetCode ? `&code=${resetCode}` : ""}`;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!email.match(/^\S+@\S+\.\S+$/)) return setError("כתובת אימייל לא תקינה");

        setLoading(true);
        try {
            const { data } = await api.post("/users/forgot-password", { email });
            setResetLink(data.resetLink || "");
            setResetCode(data.resetCode || "");
            setDeliveryConfigured(data.deliveryConfigured !== false);
            setSubmitted(true);
        } catch (err) {
            setError(forgotPasswordErrorMessage(err.response?.data?.error, err.response?.data?.code));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.page}>
            <div style={s.card} className="fade-in">
                <div style={{ textAlign: "center", fontSize: 44, marginBottom: 12 }}>🔐</div>
                <h1 style={s.title}>{"שכחת סיסמה?"}</h1>
                <p style={s.sub}>{"הזן את האימייל שלך ונשלח לך קישור לאיפוס הסיסמה."}</p>

                {!submitted ? (
                    <form onSubmit={handleSubmit} noValidate>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="forgot-email">{"אימייל"}</label>
                            <input
                                id="forgot-email" type="email" placeholder="you@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required aria-required="true"
                            />
                        </div>

                        {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? "טוען..." : "שלח קישור לאיפוס"}
                        </button>
                    </form>
                ) : (
                    <div style={s.resetBox}>
                        <div style={{ fontWeight: 700, marginBottom: 10, color: "#166534" }}>
                            {deliveryConfigured ? "✅ בדוק את האימייל שלך" : "⚠️ שליחת מייל לא מוגדרת"}
                        </div>
                        <p style={{ fontSize: 13, color: "#166534", marginBottom: 14, lineHeight: 1.6 }}>
                            {deliveryConfigured
                                ? "אם קיים חשבון לכתובת הזו, שלחנו מייל עם קישור לאיפוס הסיסמה וקוד אימות."
                                : "כדי לשלוח מייל אמיתי צריך להגדיר SMTP בקובץ backend\\.env. בינתיים אפשר להשתמש בקוד או בקישור שמופיעים כאן במצב פיתוח."}
                        </p>
                        <Link to={resetCodePath}
                            style={{
                                display: "block", background: "#166534", color: "#fff",
                                padding: "10px 16px", borderRadius: 8, textAlign: "center",
                                fontWeight: 700, fontSize: 14
                            }}>
                            {"הזן קוד מהמייל"} →
                        </Link>
                        {(resetLink || resetCode) && (
                            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #86efac" }}>
                                <div style={{ fontWeight: 700, marginBottom: 8, color: "#166534", fontSize: 13 }}>{"מצב פיתוח"}</div>
                                {resetCode && (
                                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: "#166534", marginBottom: 10 }}>
                                        {resetCode}
                                    </div>
                                )}
                                {resetLink && (
                                    <Link to={toLocalResetPath(resetLink)} style={{ color: "#166534", fontWeight: 700, fontSize: 13 }}>
                                        {"פתח קישור איפוס"}
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <p style={s.footer}>
                    {"נזכרת בסיסמה?"}{" "}
                    <Link to="/login" style={s.link}>{"התחבר"}</Link>
                </p>
            </div>
        </div>
    );
}
