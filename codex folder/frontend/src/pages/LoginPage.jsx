import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { validateLogin } from "../utils/validation";

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const set = (key, val) => {
        setForm(current => ({ ...current, [key]: val }));
        setErrors(current => ({ ...current, [key]: "" }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const nextErrors = validateLogin(form);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;

        setError("");
        setLoading(true);
        try {
            const { data } = await api.post("/users/login", form);
            login(data.user, data.token);
            navigate("/");
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בהתחברות");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="page page-narrow" dir="rtl">
            <section className="panel" aria-labelledby="login-title">
                <div className="row" style={{ marginBottom: 18 }}>
                    <span className="brand-mark">HN</span>
                    <div>
                        <h1 id="login-title">ברוכה הבאה ל-HailNow</h1>
                        <p className="muted">כניסה לנוסעים ולנהגים מאותו חשבון</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="stack" noValidate>
                    <div>
                        <label htmlFor="email">אימייל</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={form.email}
                            onChange={e => set("email", e.target.value)}
                            aria-invalid={Boolean(errors.email)}
                        />
                        {errors.email && <p className="field-error">{errors.email}</p>}
                    </div>

                    <div>
                        <label htmlFor="password">סיסמה</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="לפחות 8 תווים"
                            value={form.password}
                            onChange={e => set("password", e.target.value)}
                            aria-invalid={Boolean(errors.password)}
                        />
                        {errors.password && <p className="field-error">{errors.password}</p>}
                    </div>

                    <div className="row between wrap">
                        <Link to="/forgot-password" className="pill">שכחתי סיסמה</Link>
                        <span className="muted">אפשר לעבור בין נוסע לנהג אחרי הכניסה</span>
                    </div>

                    {error && <p className="error-msg">{error}</p>}

                    <button type="submit" className="primary-btn" disabled={loading}>
                        {loading ? "מתחברת..." : "התחברות"}
                    </button>
                </form>

                <p className="muted" style={{ marginTop: 20, textAlign: "center" }}>
                    אין לך חשבון? <Link to="/register" className="pill">הרשמה</Link>
                </p>
            </section>
        </main>
    );
}
