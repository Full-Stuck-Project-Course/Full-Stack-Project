import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { validateDriverStep } from "../utils/validation";

const initialForm = {
    driverLicenseImage: "",
    licenseNumber: "",
    company: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    licensePlate: "",
    vehicleType: "regular",
    seats: 4,
    testApproval: false,
    insuranceApproval: false,
    allowPets: true,
    spokenLanguages: ["he"],
    gender: "other",
    preferredMusic: "",
    hobbies: "",
    conditions: ""
};

export default function DriverOnboardingPage() {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const { state } = useLocation();
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(initialForm);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const userId = state?.userId || user?.userId || user?._id;
    const totalSteps = 3;

    const set = (key, val) => {
        setForm(current => ({ ...current, [key]: val }));
        setErrors(current => ({ ...current, [key]: "" }));
    };

    const fileName = (event) => event.target.files?.[0]?.name || "";

    const toggleLanguage = (lang) => {
        set("spokenLanguages", form.spokenLanguages.includes(lang)
            ? form.spokenLanguages.filter(item => item !== lang)
            : [...form.spokenLanguages, lang]
        );
    };

    const next = async () => {
        const nextErrors = validateDriverStep(step, form);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;

        if (step < totalSteps) {
            setStep(step + 1);
            return;
        }

        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/drivers", {
                userId,
                licenseNumber: form.licenseNumber,
                driverLicenseImage: form.driverLicenseImage,
                spokenLanguages: form.spokenLanguages,
                hobbies: form.hobbies.split(",").map(item => item.trim()).filter(Boolean),
                preferredMusic: form.preferredMusic,
                gender: form.gender
            });

            const driverId = data.driver?._id;
            if (driverId) {
                await api.post("/vehicles", {
                    driverId,
                    company: form.company,
                    model: form.model,
                    year: Number(form.year),
                    color: form.color,
                    licensePlate: form.licensePlate,
                    vehicleType: form.vehicleType,
                    seats: Number(form.seats),
                    testApproval: form.testApproval,
                    insuranceApproval: form.insuranceApproval,
                    allowPets: form.allowPets,
                    conditions: form.conditions
                });
            }

            login({ ...user, userId, role: user?.role === "passenger" ? "both" : user?.role || "driver", driverId }, localStorage.getItem("token"));
            navigate("/driver");
        } catch (err) {
            setError(err.response?.data?.error || "לא ניתן להשלים פרטי נהג כרגע");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="page page-narrow" dir="rtl">
            <section className="panel">
                <div className="row between wrap" style={{ marginBottom: 18 }}>
                    <div>
                        <h1>השלמת פרטי נהג</h1>
                        <p className="muted">שלב {step} מתוך {totalSteps}</p>
                    </div>
                    <span className="pill">בדיקת מנהלים לאחר ההגשה</span>
                </div>

                <div className="tab-row" style={{ marginBottom: 20 }}>
                    {[1, 2, 3].map(item => (
                        <span key={item} className={`tab-btn ${step === item ? "active" : ""}`}>
                            {item === 1 ? "רישיון" : item === 2 ? "רכב" : "העדפות"}
                        </span>
                    ))}
                </div>

                {step === 1 && (
                    <div className="stack">
                        <div>
                            <label htmlFor="driverLicenseImage">צילום רישיון נהיגה</label>
                            <input id="driverLicenseImage" type="file" accept="image/*,.pdf" onChange={e => set("driverLicenseImage", fileName(e))} />
                            {form.driverLicenseImage && <p className="muted">{form.driverLicenseImage}</p>}
                            {errors.driverLicenseImage && <p className="field-error">{errors.driverLicenseImage}</p>}
                        </div>
                        <div>
                            <label htmlFor="licenseNumber">מספר רישיון נהיגה</label>
                            <input id="licenseNumber" value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} />
                            {errors.licenseNumber && <p className="field-error">{errors.licenseNumber}</p>}
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="stack">
                        <div className="grid two">
                            <div>
                                <label htmlFor="company">חברת רכב</label>
                                <input id="company" value={form.company} onChange={e => set("company", e.target.value)} placeholder="Toyota" />
                                {errors.company && <p className="field-error">{errors.company}</p>}
                            </div>
                            <div>
                                <label htmlFor="model">דגם</label>
                                <input id="model" value={form.model} onChange={e => set("model", e.target.value)} placeholder="Corolla" />
                                {errors.model && <p className="field-error">{errors.model}</p>}
                            </div>
                        </div>
                        <div className="grid two">
                            <div>
                                <label htmlFor="year">שנה</label>
                                <input id="year" inputMode="numeric" value={form.year} onChange={e => set("year", e.target.value)} />
                                {errors.year && <p className="field-error">{errors.year}</p>}
                            </div>
                            <div>
                                <label htmlFor="color">צבע</label>
                                <input id="color" value={form.color} onChange={e => set("color", e.target.value)} />
                                {errors.color && <p className="field-error">{errors.color}</p>}
                            </div>
                        </div>
                        <div className="grid two">
                            <div>
                                <label htmlFor="licensePlate">לוחית רישוי</label>
                                <input id="licensePlate" value={form.licensePlate} onChange={e => set("licensePlate", e.target.value)} />
                                {errors.licensePlate && <p className="field-error">{errors.licensePlate}</p>}
                            </div>
                            <div>
                                <label htmlFor="vehicleType">גודל/יוקרת רכב</label>
                                <select id="vehicleType" value={form.vehicleType} onChange={e => set("vehicleType", e.target.value)}>
                                    <option value="regular">רגיל</option>
                                    <option value="comfort">נוח</option>
                                    <option value="luxury">יוקרתי</option>
                                    <option value="van">גדול</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid two">
                            <label className="row">
                                <input type="checkbox" checked={form.testApproval} onChange={e => set("testApproval", e.target.checked)} />
                                <span>יש אישור טסט תקף</span>
                            </label>
                            <label className="row">
                                <input type="checkbox" checked={form.insuranceApproval} onChange={e => set("insuranceApproval", e.target.checked)} />
                                <span>יש ביטוח תקף</span>
                            </label>
                        </div>
                        {(errors.testApproval || errors.insuranceApproval) && (
                            <p className="field-error">{errors.testApproval || errors.insuranceApproval}</p>
                        )}
                        <label className="row">
                            <input type="checkbox" checked={form.allowPets} onChange={e => set("allowPets", e.target.checked)} />
                            <span>מאפשר/ת בעלי חיים</span>
                        </label>
                        <div>
                            <label htmlFor="conditions">תנאים לנוסעים</label>
                            <textarea id="conditions" value={form.conditions} onChange={e => set("conditions", e.target.value)} placeholder="למשל: בלי חיות, מזוודה אחת, שיחה שקטה" />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="stack">
                        <div>
                            <label>שפות מדוברות</label>
                            <div className="row wrap" style={{ marginTop: 8 }}>
                                {["he", "en"].map(lang => (
                                    <button
                                        key={lang}
                                        type="button"
                                        className={`tab-btn ${form.spokenLanguages.includes(lang) ? "active" : ""}`}
                                        onClick={() => toggleLanguage(lang)}
                                    >
                                        {lang === "he" ? "עברית" : "English"}
                                    </button>
                                ))}
                            </div>
                            {errors.spokenLanguages && <p className="field-error">{errors.spokenLanguages}</p>}
                        </div>
                        <div className="grid two">
                            <div>
                                <label htmlFor="gender">מגדר נהג/ת</label>
                                <select id="gender" value={form.gender} onChange={e => set("gender", e.target.value)}>
                                    <option value="female">אישה</option>
                                    <option value="male">גבר</option>
                                    <option value="other">אחר/לא משנה</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="preferredMusic">מוזיקה אהובה</label>
                                <input id="preferredMusic" value={form.preferredMusic} onChange={e => set("preferredMusic", e.target.value)} />
                                {errors.preferredMusic && <p className="field-error">{errors.preferredMusic}</p>}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="hobbies">תחביבים</label>
                            <input id="hobbies" value={form.hobbies} onChange={e => set("hobbies", e.target.value)} placeholder="טיולים, ספורט, מוזיקה" />
                        </div>
                    </div>
                )}

                {error && <p className="error-msg" style={{ marginTop: 16 }}>{error}</p>}

                <div className="row between wrap" style={{ marginTop: 24 }}>
                    <button type="button" className="secondary-btn" onClick={() => step === 1 ? navigate("/profile") : setStep(step - 1)}>
                        חזרה
                    </button>
                    <button type="button" className="primary-btn" onClick={next} disabled={loading}>
                        {step === totalSteps ? (loading ? "שומרת..." : "סיום והפעלה כנהג") : "המשך"}
                    </button>
                </div>
            </section>
        </main>
    );
}
