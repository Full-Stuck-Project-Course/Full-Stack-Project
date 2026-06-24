// src/pages/LoginPage.jsx

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 },
    card: { background: "var(--surface)", borderRadius: 18, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "var(--shadow-lg)" },
    logo: { textAlign: "center", fontSize: 48, marginBottom: 8 },
    title: { fontSize: 26, fontWeight: 800, marginBottom: 4, color: "var(--text)" },
    sub: { color: "var(--text-muted)", marginBottom: 28, fontSize: 14 },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 18 },
    forgot: { textAlign: "left", marginTop: 6, fontSize: 13 },
    footer: { textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--text-muted)" },
    link: { color: "var(--primary)", fontWeight: 700 }
};

export default function LoginPage() {
    const { login }    = useAuth();
    const { t }        = useLang();
    const navigate     = useNavigate();
    const [form, setF] = useState({ email: "", password: "" });
    const [error, setE] = useState("");
    const [loading, setL] = useState(false);
    const [showPw, setShow] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setE("");
        if (!form.email) return setE("נא להזין אימייל");
        if (!form.password) return setE("נא להזין סיסמה");

        setL(true);
        try {
            const { data } = await api.post("/users/login", form);
            login(
                { userId: data.userId, role: data.role, fullName: data.fullName, preferredLanguage: data.preferredLanguage, referralCode: data.referralCode, loyaltyPoints: data.loyaltyPoints, passengerId: data.passengerId, driverId: data.driverId },
                data.token
            );
            navigate("/");
        } catch (err) {
            setE(err.response?.data?.error || "שגיאה בהתחברות");
        } finally {
            setL(false);
        }
    };

    return (
        <div style={s.page}>
            <div style={s.card} className="fade-in">
                <div style={s.logo}>🚕</div>
                <h1 style={s.title}>{"ברוך הבא"}</h1>
                <p style={s.sub}>{"היכנס לחשבונך ב-HailNow"}</p>

                <form onSubmit={handleSubmit} noValidate>
                    <div style={s.group}>
                        <label style={s.label} htmlFor="email">{"אימייל"}</label>
                        <input
                            id="email" type="email" placeholder="you@example.com"
                            value={form.email}
                            onChange={e => setF({ ...form, email: e.target.value })}
                            autoComplete="email" required
                            aria-required="true"
                        />
                    </div>

                    <div style={s.group}>
                        <label style={s.label} htmlFor="password">{"סיסמה"}</label>
                        <div style={{ position: "relative" }}>
                            <input
                                id="password"
                                type={showPw ? "text" : "password"}
                                placeholder="••••••••"
                                value={form.password}
                                onChange={e => setF({ ...form, password: e.target.value })}
                                autoComplete="current-password" required
                                aria-required="true"
                                style={{ paddingLeft: 44 }}
                            />
                            <button type="button"
                                onClick={() => setShow(s => !s)}
                                style={{
                                    position: "absolute", left: 12, top: "50%",
                                    transform: "translateY(-50%)", background: "none",
                                    padding: 0, fontSize: 16, color: "var(--text-muted)"
                                }}
                                aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}>
                                {showPw ? "🙈" : "👁️"}
                            </button>
                        </div>
                        <div style={s.forgot}>
                            <Link to="/forgot-password" style={s.link}>{"שכחת סיסמה?"}</Link>
                        </div>
                    </div>

                    {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                        {loading ? "טוען..." : "התחבר"}
                    </button>
                </form>

                <p style={s.footer}>
                    {"אין לך חשבון?"}{" "}
                    <Link to="/register" style={s.link}>{"הירשם"}</Link>
                </p>
            </div>
        </div>
    );
}
