// src/pages/ResetPasswordPage.jsx

import { useState } from "react";
import { useSearchParams, useNavigate } from "../routing";
import api from "../api/axios";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 },
    card: { background: "var(--surface)", borderRadius: 18, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "var(--shadow-lg)" },
    title: { fontSize: 24, fontWeight: 800, marginBottom: 6 },
    sub: { color: "var(--text-muted)", marginBottom: 28, fontSize: 14 },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 18 },
    link: { color: "var(--primary)", fontWeight: 700 },
    passwordRules: {
        marginTop: 8,
        display: "grid",
        gap: 6,
        fontSize: 12
    },
    passwordRule: (ok) => ({
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: ok ? "var(--success)" : "var(--danger)",
        fontWeight: 600
    }),
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

function resetErrorMessage(message) {
    if (!message) return "שגיאה";
    if (message.includes("Too many invalid")) return "יותר מדי ניסיונות שגויים. בקש קוד חדש ונסה שוב.";
    if (message.includes("Invalid or expired")) return "קוד או קישור האיפוס לא תקינים או שפג תוקפם.";
    if (message.includes("Reset token")) return "נדרש קישור איפוס או אימייל וקוד אימות.";
    return message;
}

function PasswordGuidance({ password }) {
    const rules = [
        { label: "\u05DC\u05E4\u05D7\u05D5\u05EA 8 \u05EA\u05D5\u05D5\u05D9\u05DD", ok: password.length >= 8 },
        { label: "\u05DC\u05E4\u05D7\u05D5\u05EA \u05D0\u05D5\u05EA \u05D2\u05D3\u05D5\u05DC\u05D4 \u05D0\u05D7\u05EA \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA (A-Z)", ok: /[A-Z]/.test(password) },
        { label: "\u05DC\u05E4\u05D7\u05D5\u05EA \u05D0\u05D5\u05EA \u05E7\u05D8\u05E0\u05D4 \u05D0\u05D7\u05EA \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA (a-z)", ok: /[a-z]/.test(password) },
        { label: "\u05DC\u05E4\u05D7\u05D5\u05EA \u05DE\u05E1\u05E4\u05E8 \u05D0\u05D7\u05D3 (0-9)", ok: /[0-9]/.test(password) }
    ];

    return (
        <div id="reset-password-guidance" style={s.passwordRules} aria-live="polite">
            {rules.map(rule => (
                <div key={rule.label} style={s.passwordRule(rule.ok)}>
                    <span aria-hidden="true">{rule.ok ? "\u2713" : "\u2715"}</span>
                    <span>{rule.label}</span>
                </div>
            ))}
        </div>
    );
}

function ConfirmPasswordGuidance({ password, confirmPassword }) {
    const hasConfirmPassword = confirmPassword.length > 0;
    const matches = hasConfirmPassword && password === confirmPassword;
    const label = !hasConfirmPassword
        ? "\u05D9\u05E9 \u05DC\u05D4\u05E7\u05DC\u05D9\u05D3 \u05D0\u05EA \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05E4\u05E2\u05DD \u05E0\u05D5\u05E1\u05E4\u05EA"
        : matches
            ? "\u05D4\u05E1\u05D9\u05E1\u05DE\u05D0\u05D5\u05EA \u05EA\u05D5\u05D0\u05DE\u05D5\u05EA"
            : "\u05D4\u05E1\u05D9\u05E1\u05DE\u05D0\u05D5\u05EA \u05D0\u05D9\u05E0\u05DF \u05EA\u05D5\u05D0\u05DE\u05D5\u05EA";

    return (
        <div id="reset-confirm-password-guidance" style={s.passwordRules} aria-live="polite">
            <div style={s.passwordRule(matches)}>
                <span aria-hidden="true">{matches ? "\u2713" : "\u2715"}</span>
                <span>{label}</span>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    const navigate      = useNavigate();
    const [params]      = useSearchParams();
    const token         = params.get("token") || "";
    const emailFromLink = params.get("email") || "";
    const codeFromLink  = params.get("code") || "";

    const [form, setF]   = useState({ email: emailFromLink, code: codeFromLink, newPassword: "", confirm: "" });
    const [error, setE]  = useState("");
    const [loading, setL] = useState(false);
    const [done, setDone] = useState(false);
    const [showPw, setShow] = useState(false);

    const strength = passwordStrength(form.newPassword);
    const strengthLabel = ["", "חלשה", "בינונית", "חזקה", "חזקה מאוד"][strength];
    const strengthColor  = ["", "#ef4444", "#f59e0b", "#10b981", "#059669"][strength];
    const isResetLink = Boolean(token);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setE("");
        if (!isResetLink && !form.email.match(/^\S+@\S+\.\S+$/)) return setE("כתובת אימייל לא תקינה");
        if (!isResetLink && !form.code.match(/^\d{6}$/)) return setE("יש להזין קוד אימות בן 6 ספרות");
        if (form.newPassword.length < 8) return setE("סיסמה חייבת להכיל לפחות 8 תווים");
        if (!/[A-Z]/.test(form.newPassword)) return setE("סיסמה חייבת להכיל לפחות אות גדולה אחת");
        if (!/[a-z]/.test(form.newPassword)) return setE("סיסמה חייבת להכיל לפחות אות קטנה אחת");
        if (!/[0-9]/.test(form.newPassword)) return setE("סיסמה חייבת להכיל לפחות מספר אחד");
        if (form.newPassword !== form.confirm) return setE("הסיסמאות אינן תואמות");

        setL(true);
        try {
            const payload = isResetLink
                ? { token, newPassword: form.newPassword }
                : { email: form.email, code: form.code, newPassword: form.newPassword };
            await api.post("/users/reset-password", payload);
            setDone(true);
        } catch (err) {
            setE(resetErrorMessage(err.response?.data?.error));
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
                <p style={s.sub}>{isResetLink ? "הזן סיסמה חדשה חזקה לחשבונך." : "הזן את הקוד שנשלח למייל ובחר סיסמה חדשה."}</p>

                <form onSubmit={handleSubmit} noValidate>
                    {!isResetLink && (
                        <>
                            <div style={s.group}>
                                <label style={s.label} htmlFor="reset-email">{"אימייל"}</label>
                                <input
                                    id="reset-email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={form.email}
                                    onChange={e => setF(f => ({ ...f, email: e.target.value }))}
                                    autoComplete="email"
                                    required
                                    aria-required="true"
                                />
                            </div>

                            <div style={s.group}>
                                <label style={s.label} htmlFor="reset-code">{"קוד אימות"}</label>
                                <input
                                    id="reset-code"
                                    type="text"
                                    placeholder="123456"
                                    value={form.code}
                                    onChange={e => setF(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                                    inputMode="numeric"
                                    pattern="[0-9]{6}"
                                    autoComplete="one-time-code"
                                    required
                                    aria-required="true"
                                />
                            </div>
                        </>
                    )}

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
                                aria-describedby="reset-password-guidance"
                            />
                            <button type="button"
                                onClick={() => setShow(s => !s)}
                                aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                                style={{
                                    position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                                    background: "none", border: "none", padding: "4px 6px", cursor: "pointer",
                                    borderRadius: 6, color: "var(--text-muted)", fontSize: 13, fontWeight: 600,
                                    transition: "background 0.2s, color 0.2s"
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                                {showPw ? "הסתר" : "הצג"}
                            </button>
                        </div>
                        {form.newPassword && (
                            <div style={{ marginTop: 6 }}>
                                <div style={s.strength(strength)} aria-label={`חוזק סיסמה: ${strengthLabel}`} />
                                <span style={{ fontSize: 12, color: strengthColor }}>{strengthLabel}</span>
                            </div>
                        )}
                        <PasswordGuidance password={form.newPassword} />
                    </div>

                    <div style={s.group}>
                        <label style={s.label}>{"אימות סיסמה"}</label>
                        <input
                            type={showPw ? "text" : "password"}
                            placeholder={"הזן שוב"}
                            value={form.confirm}
                            onChange={e => setF(f => ({ ...f, confirm: e.target.value }))}
                            autoComplete="new-password"
                            aria-describedby="reset-confirm-password-guidance"
                            style={{ borderColor: form.confirm && form.confirm !== form.newPassword ? "var(--danger)" : undefined }}
                        />
                        <ConfirmPasswordGuidance password={form.newPassword} confirmPassword={form.confirm} />
                    </div>

                    {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                        {loading ? "טוען..." : "אפס סיסמה"}
                    </button>
                </form>
            </div>
        </div>
    );
}
