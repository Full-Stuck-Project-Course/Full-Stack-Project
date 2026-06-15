import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { validateForgotPassword } from "../utils/validation";

export default function ForgotPasswordPage() {
    const [step, setStep] = useState("email");
    const [form, setForm] = useState({ email: "", code: "", newPassword: "" });
    const [errors, setErrors] = useState({});
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const set = (key, val) => {
        setForm(current => ({ ...current, [key]: val }));
        setErrors(current => ({ ...current, [key]: "" }));
    };

    const requestReset = async (e) => {
        e.preventDefault();
        const nextErrors = validateForgotPassword(form, "email");
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;

        setLoading(true);
        setMessage("");
        try {
            const { data } = await api.post("/users/forgot-password", { email: form.email });
            setMessage(data.demoCode ? `קוד דמו לאיפוס: ${data.demoCode}` : "נשלח קוד איפוס לאימייל");
            setStep("reset");
        } catch (err) {
            setMessage(err.response?.data?.error || "לא ניתן לשלוח קוד איפוס כרגע");
        } finally {
            setLoading(false);
        }
    };

    const resetPassword = async (e) => {
        e.preventDefault();
        const nextErrors = validateForgotPassword(form, "reset");
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;

        setLoading(true);
        setMessage("");
        try {
            await api.post("/users/reset-password", form);
            setMessage("הסיסמה אופסה בהצלחה. אפשר להתחבר עכשיו.");
            setStep("done");
        } catch (err) {
            setMessage(err.response?.data?.error || "קוד לא תקין או פג תוקף");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="page page-narrow" dir="rtl">
            <section className="panel" aria-labelledby="forgot-title">
                <div className="row" style={{ marginBottom: 18 }}>
                    <span className="brand-mark">HN</span>
                    <div>
                        <h1 id="forgot-title">שכחתי סיסמה</h1>
                        <p className="muted">איפוס מקומי לצורך הדגמת הפרויקט</p>
                    </div>
                </div>

                {step === "email" && (
                    <form onSubmit={requestReset} className="stack" noValidate>
                        <div>
                            <label htmlFor="reset-email">אימייל</label>
                            <input
                                id="reset-email"
                                type="email"
                                value={form.email}
                                onChange={e => set("email", e.target.value)}
                                placeholder="you@example.com"
                                aria-invalid={Boolean(errors.email)}
                            />
                            {errors.email && <p className="field-error">{errors.email}</p>}
                        </div>
                        <button type="submit" className="primary-btn" disabled={loading}>
                            {loading ? "שולחת..." : "שליחת קוד איפוס"}
                        </button>
                    </form>
                )}

                {step === "reset" && (
                    <form onSubmit={resetPassword} className="stack" noValidate>
                        <div>
                            <label htmlFor="reset-code">קוד איפוס</label>
                            <input
                                id="reset-code"
                                inputMode="numeric"
                                value={form.code}
                                onChange={e => set("code", e.target.value)}
                                placeholder="123456"
                                aria-invalid={Boolean(errors.code)}
                            />
                            {errors.code && <p className="field-error">{errors.code}</p>}
                        </div>
                        <div>
                            <label htmlFor="new-password">סיסמה חדשה</label>
                            <input
                                id="new-password"
                                type="password"
                                value={form.newPassword}
                                onChange={e => set("newPassword", e.target.value)}
                                placeholder="Aa123456"
                                aria-invalid={Boolean(errors.newPassword)}
                            />
                            {errors.newPassword && <p className="field-error">{errors.newPassword}</p>}
                        </div>
                        <button type="submit" className="primary-btn" disabled={loading}>
                            {loading ? "מאפסת..." : "איפוס סיסמה"}
                        </button>
                    </form>
                )}

                {step === "done" && (
                    <div className="stack">
                        <p className="pill">הסיסמה עודכנה</p>
                        <Link to="/login" className="primary-btn" style={{ textAlign: "center" }}>חזרה להתחברות</Link>
                    </div>
                )}

                {message && <p className="muted" style={{ marginTop: 18 }}>{message}</p>}

                <p style={{ marginTop: 20 }}>
                    <Link to="/login" className="pill">חזרה למסך התחברות</Link>
                </p>
            </section>
        </main>
    );
}
