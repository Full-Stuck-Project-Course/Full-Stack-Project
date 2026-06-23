// src/pages/ResetPasswordPage.jsx

import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 },
    card: { background: "var(--surface)", borderRadius: 18, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "var(--shadow-lg)" },
    title: { fontSize: 24, fontWeight: 800, marginBottom: 6 },
    sub: { color: "var(--text-muted)", marginBottom: 28, fontSize: 14 },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 18 },
    link: { color: "var(--primary)", fontWeight: 700 },
    strength: (s) => ({
        height: 4, borderRadius: 2, marginTop: 6, transition: "all 0.3s",
        background: s === 0 ? "#e2e8f0" : s === 1 ? "#ef4444" : s === 2 ? "#f59e0b" : s === 3 ? "#10b981" : "#059669",
        width: `${Math.min(s * 25, 100)}%`
    })
};

function passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
}

export default function ResetPasswordPage() {
    const { t }         = useLang();
    const navigate      = useNavigate();
    const [params]      = useSearchParams();
    const token         = params.get("token") || "";

    const [form, setF]   = useState({ newPassword: "", confirm: "" });
    const [error, setE]  = useState("");
    const [loading, setL] = useState(false);
    const [done, setDone] = useState(false);
    const [showPw, setShow] = useState(false);

    const strength = passwordStrength(form.newPassword);
    const strengthLabel = ["", "חלשה", "בינונית", "חזקה", "חזקה מאוד"][strength];
    const strengthColor  = ["", "#ef4444", "#f59e0b", "#10b981", "#059669"][strength];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setE("");
        if (!token) return setE("קישור לא תקין. בקש קישור חדש.");
        if (form.newPassword.length < 8) return setE("סיסמה חייבת להכיל לפחות 8 תווים");
        if (form.newPassword !== form.confirm) return setE("הסיסמאות אינן תואמות");
        if (strength < 2) return setE("הסיסמה חלשה מדי — הוסף אותיות גדולות, מספרים או תווים מיוחדים");

        setL(true);
        try {
            await api.post("/users/reset-password", { token, newPassword: form.newPassword });
            setDone(true);
        } catch (err) {
            setE(err.response?.data?.error || "שגיאה");
        } finally {
            setL(false);
        }
    };

    if (done) return (
        <div style={s.page}>
            <div style={s.card} className="fade-in">
                <div style={{ textAlign: "center", fontSize: 56, marginBottom: 16 }}>✅</div>
                <h1 style={{ ...s.title, textAlign: "center" }}>{"הסיסמה אופסה בהצלחה!"}</h1>
                <p style={{ textAlign: "center", color: "var(--text-muted)", margin: "12px 0 24px" }}>
                    {"כעת תוכל להתחבר עם הסיסמה החדשה שלך."}
                </p>
                <button className="btn-primary" onClick={() => navigate("/login")}>
                    {"התחבר"} ←
                </button>
            </div>
        </div>
    );

    return (
        <div style={s.page}>
            <div style={s.card} className="fade-in">
                <div style={{ textAlign: "center", fontSize: 44, marginBottom: 12 }}>🔑</div>
                <h1 style={s.title}>{"איפוס סיסמה"}</h1>
                <p style={s.sub}>{"הזן סיסמה חדשה חזקה לחשבונך."}</p>

                {!token && (
                    <div className="error-msg" role="alert" style={{ marginBottom: 16 }}>
                        ⚠️ {"קישור לא תקין. בקש קישור חדש."} <Link to="/forgot-password" style={s.link}>{"שלח קישור לאיפוס"}</Link>
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                    <div style={s.group}>
                        <label style={s.label}>{"סיסמה חדשה"}</label>
                        <div style={{ position: "relative" }}>
                            <input
                                type={showPw ? "text" : "password"}
                                placeholder={"לפחות 8 תווים"}
                                value={form.newPassword}
                                onChange={e => setF(f => ({ ...f, newPassword: e.target.value }))}
                                style={{ paddingLeft: 44 }}
                                autoComplete="new-password"
                            />
                            <button type="button"
                                onClick={() => setShow(s => !s)}
                                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", padding: 0, fontSize: 16, color: "var(--text-muted)" }}>
                                {showPw ? "🙈" : "👁️"}
                            </button>
                        </div>
                        {form.newPassword && (
                            <div style={{ marginTop: 6 }}>
                                <div style={s.strength(strength)} aria-label={`חוזק סיסמה: ${strengthLabel}`} />
                                <span style={{ fontSize: 12, color: strengthColor }}>{strengthLabel}</span>
                            </div>
                        )}
                    </div>

                    <div style={s.group}>
                        <label style={s.label}>{"אימות סיסמה"}</label>
                        <input
                            type={showPw ? "text" : "password"}
                            placeholder={"הזן שוב"}
                            value={form.confirm}
                            onChange={e => setF(f => ({ ...f, confirm: e.target.value }))}
                            autoComplete="new-password"
                            style={{ borderColor: form.confirm && form.confirm !== form.newPassword ? "var(--danger)" : undefined }}
                        />
                        {form.confirm && form.confirm !== form.newPassword && (
                            <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{"הסיסמאות אינן תואמות"}</p>
                        )}
                    </div>

                    {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

                    <button type="submit" className="btn-primary" disabled={loading || !token} style={{ marginTop: 8 }}>
                        {loading ? "טוען..." : "אפס סיסמה"}
                    </button>
                </form>
            </div>
        </div>
    );
}
