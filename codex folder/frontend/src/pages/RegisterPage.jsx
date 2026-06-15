import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { passwordChecklist, validateRegistration } from "../utils/validation";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [form, setForm] = useState({
        fullName: "",
        email: "",
        password: "",
        phone: "",
        role: "passenger",
        preferredLanguage: "he",
        idNumber: "",
        profileImage: "",
        idDocumentImage: "",
        preferredDriverGender: "any",
        preferredMatching: "closest",
        referralCode: ""
    });
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const set = (key, val) => {
        setForm(current => ({ ...current, [key]: val }));
        setErrors(current => ({ ...current, [key]: "" }));
    };

    const fileName = (event) => event.target.files?.[0]?.name || "";
    const checklist = passwordChecklist(form.password);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const nextErrors = validateRegistration(form);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;

        setError("");
        setLoading(true);
        try {
            const { data } = await api.post("/users/register", form);
            const userData = data.user || {
                userId: data.userId,
                role: form.role,
                passengerId: data.passengerId
            };
            login(userData, data.token);
            if (form.role === "driver" || form.role === "both") {
                navigate("/driver/onboarding", { state: { userId: userData.userId } });
            } else {
                navigate("/");
            }
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בהרשמה");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="page page-narrow" dir="rtl">
            <section className="panel" aria-labelledby="register-title">
                <div className="row" style={{ marginBottom: 18 }}>
                    <span className="brand-mark">HN</span>
                    <div>
                        <h1 id="register-title">הרשמה ל-HailNow</h1>
                        <p className="muted">כל משתמש יכול להיות נוסע, נהג או שניהם</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="stack" noValidate>
                    <div className="grid two">
                        <div>
                            <label htmlFor="fullName">שם מלא</label>
                            <input id="fullName" value={form.fullName} onChange={e => set("fullName", e.target.value)} />
                            {errors.fullName && <p className="field-error">{errors.fullName}</p>}
                        </div>
                        <div>
                            <label htmlFor="phone">טלפון</label>
                            <input id="phone" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="050-0000000" />
                            {errors.phone && <p className="field-error">{errors.phone}</p>}
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="email">אימייל</label>
                            <input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
                            {errors.email && <p className="field-error">{errors.email}</p>}
                        </div>
                        <div>
                            <label htmlFor="idNumber">מספר תעודת זהות</label>
                            <input id="idNumber" inputMode="numeric" value={form.idNumber} onChange={e => set("idNumber", e.target.value)} />
                            {errors.idNumber && <p className="field-error">{errors.idNumber}</p>}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password">סיסמה</label>
                        <input id="password" type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="Aa123456" />
                        {errors.password && <p className="field-error">{errors.password}</p>}
                        <div className="row wrap" style={{ marginTop: 8 }}>
                            <span className={`pill ${checklist.length ? "" : "muted"}`}>8 תווים</span>
                            <span className={`pill ${checklist.upper ? "" : "muted"}`}>אות גדולה</span>
                            <span className={`pill ${checklist.lower ? "" : "muted"}`}>אות קטנה</span>
                            <span className={`pill ${checklist.number ? "" : "muted"}`}>מספר</span>
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="profileImage">תמונת פרופיל</label>
                            <input id="profileImage" type="file" accept="image/*" onChange={e => set("profileImage", fileName(e))} />
                            {form.profileImage && <p className="muted">{form.profileImage}</p>}
                            {errors.profileImage && <p className="field-error">{errors.profileImage}</p>}
                        </div>
                        <div>
                            <label htmlFor="idDocumentImage">צילום תעודת זהות</label>
                            <input id="idDocumentImage" type="file" accept="image/*,.pdf" onChange={e => set("idDocumentImage", fileName(e))} />
                            {form.idDocumentImage && <p className="muted">{form.idDocumentImage}</p>}
                            {errors.idDocumentImage && <p className="field-error">{errors.idDocumentImage}</p>}
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="role">תפקיד</label>
                            <select id="role" value={form.role} onChange={e => set("role", e.target.value)}>
                                <option value="passenger">נוסע</option>
                                <option value="driver">נהג</option>
                                <option value="both">נהג ונוסע</option>
                            </select>
                            {(form.role === "driver" || form.role === "both") && (
                                <p className="muted">אחרי ההרשמה תועברי ישירות להשלמת פרטי נהג ורישיון.</p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="preferredLanguage">שפה מועדפת</label>
                            <select id="preferredLanguage" value={form.preferredLanguage} onChange={e => set("preferredLanguage", e.target.value)}>
                                <option value="he">עברית</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="preferredMatching">העדפת התאמת נהג</label>
                            <select id="preferredMatching" value={form.preferredMatching} onChange={e => set("preferredMatching", e.target.value)}>
                                <option value="closest">הכי קרוב</option>
                                <option value="highest_rated">הדירוג הכי גבוה</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="preferredDriverGender">העדפת נהג/ת</label>
                            <select id="preferredDriverGender" value={form.preferredDriverGender} onChange={e => set("preferredDriverGender", e.target.value)}>
                                <option value="any">אין העדפה</option>
                                <option value="female">אישה</option>
                                <option value="male">גבר</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="referralCode">קוד חבר מביא חבר</label>
                        <input id="referralCode" value={form.referralCode} onChange={e => set("referralCode", e.target.value)} placeholder="אופציונלי" />
                    </div>

                    {error && <p className="error-msg">{error}</p>}

                    <button type="submit" className="primary-btn" disabled={loading}>
                        {loading ? "נרשמת..." : "יצירת חשבון"}
                    </button>
                </form>

                <p className="muted" style={{ marginTop: 20, textAlign: "center" }}>
                    יש לך חשבון? <Link to="/login" className="pill">התחברות</Link>
                </p>
            </section>
        </main>
    );
}
