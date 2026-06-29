// src/pages/ForgotPasswordPage.jsx

import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../context/LanguageContext";
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

export default function ForgotPasswordPage() {
    const { t } = useLang();
    const [email,    setEmail]    = useState("");
    const [error,    setError]    = useState("");
    const [loading,  setLoading]  = useState(false);
    const [resetLink, setResetLink] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!email.match(/^\S+@\S+\.\S+$/)) return setError("כתובת אימייל לא תקינה");

        setLoading(true);
        try {
            const { data } = await api.post("/users/forgot-password", { email });
            setResetLink(data.resetLink || "");
            setSubmitted(true);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה");
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
                        <div style={{ fontWeight: 700, marginBottom: 10, color: "#166534" }}>✅ {"קישור לאיפוס נוצר!"}</div>
                        <p style={{ fontSize: 13, color: "#166534", marginBottom: 14, lineHeight: 1.6 }}>
                            {"בסביבת פיתוח הקישור מוצג כאן. בפרודקשן היה נשלח לאימייל."}
                        </p>
                        {resetLink && <Link to={resetLink.replace("http://localhost:3000", "")}
                            style={{
                                display: "block", background: "#166534", color: "#fff",
                                padding: "10px 16px", borderRadius: 8, textAlign: "center",
                                fontWeight: 700, fontSize: 14
                            }}>
                            {"לחץ כאן לאיפוס הסיסמה"} →
                        </Link>}
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
