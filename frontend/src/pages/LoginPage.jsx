// src/pages/LoginPage.jsx

import { useState } from "react";
import { Link, useLocation, useNavigate } from "../routing";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
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
    const navigate     = useNavigate();
    const location     = useLocation();
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const [form, setF] = useState({ email: "", password: "" });
    const [error, setE] = useState("");
    const [loading, setL] = useState(false);
    const [showPw, setShow] = useState(false);

    const userFromAuthResponse = (data) => ({
        userId: data.userId,
        role: data.role,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        preferredLanguage: data.preferredLanguage,
        referralCode: data.referralCode,
        loyaltyPoints: data.loyaltyPoints,
        passengerId: data.passengerId,
        driverId: data.driverId,
        needsProfileCompletion: data.needsProfileCompletion
    });

    const nextPathFromAuthResponse = (data) => {
        if (data.needsProfileCompletion) return "/complete-profile";
        return location.state?.needsDriverSetup ? "/driver-setup" : "/";
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        setE("");
        setL(true);
        try {
            const { data } = await api.post("/users/google-login", {
                credential: credentialResponse.credential
            });
            login(userFromAuthResponse(data), data.token);
            navigate(nextPathFromAuthResponse(data));
        } catch (err) {
            setE(err.response?.data?.error || "שגיאה בהתחברות עם Google");
        } finally {
            setL(false);
        }
    };

    const handleGoogleError = () => {
        setE("שגיאה בהתחברות עם Google");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setE("");
        if (!form.email) return setE("נא להזין אימייל");
        if (!form.password) return setE("נא להזין סיסמה");

        setL(true);
        try {
            const { data } = await api.post("/users/login", form);
            login(userFromAuthResponse(data), data.token);
            navigate(nextPathFromAuthResponse(data));
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
                        <div style={s.forgot}>
                            <Link to="/forgot-password" style={s.link}>{"שכחת סיסמה?"}</Link>
                        </div>
                    </div>

                    {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                        {loading ? "טוען..." : "התחבר"}
                    </button>
                </form>

                {googleClientId && !googleClientId.startsWith("your_") && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
                            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                            <span style={{ padding: "0 14px", color: "var(--text-muted)", fontSize: 13 }}>או</span>
                            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        </div>

                        <div style={{ display: "flex", justifyContent: "center" }}>
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={handleGoogleError}
                                shape="rectangular"
                                size="large"
                                width="100%"
                            />
                        </div>
                    </>
                )}

                <p style={s.footer}>
                    {"אין לך חשבון?"}{" "}
                    <Link to="/register" style={s.link}>{"הירשם"}</Link>
                </p>
            </div>
        </div>
    );
}
