// src/pages/RegisterPage.jsx — Multi-step registration with validation

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 },
    card: { background: "var(--surface)", borderRadius: 18, padding: "36px 32px", width: "100%", maxWidth: 480, boxShadow: "var(--shadow-lg)" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 4 },
    sub: { color: "var(--text-muted)", marginBottom: 24, fontSize: 13 },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 16 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    footer: { textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--text-muted)" },
    link: { color: "var(--primary)", fontWeight: 700 },
    stepBar: { display: "flex", gap: 6, marginBottom: 28 },
    step: (active, done) => ({
        flex: 1, height: 5, borderRadius: 3,
        background: done ? "var(--success)" : active ? "var(--primary)" : "var(--border)",
        transition: "background 0.3s"
    }),
    stepLabel: { display: "flex", justifyContent: "space-between", marginBottom: 10 },
    navRow: { display: "flex", gap: 10, marginTop: 20 },
    roleCard: (sel) => ({
        border: `2px solid ${sel ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 12, padding: "16px 12px", textAlign: "center",
        cursor: "pointer", flex: 1, transition: "all 0.2s",
        background: sel ? "rgba(79,70,229,0.06)" : "var(--surface)"
    }),
    fileBox: {
        border: "2px dashed var(--border)", borderRadius: 12, padding: 20,
        textAlign: "center", cursor: "pointer", transition: "border-color 0.2s"
    }
};

function FieldErr({ msg }) {
    if (!msg) return null;
    return <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>⚠️ {msg}</p>;
}

export default function RegisterPage() {
    const { t }     = useLang();
    const navigate  = useNavigate();

    const steps = ["פרטים אישיים", "תפקיד והעדפות", "מסמכים"];

    const validate = (stepIdx, formData) => {
        const errors = {};
        if (stepIdx === 0) {
            if (!formData.fullName.trim() || formData.fullName.trim().length < 2)
                errors.fullName = "שם מלא חייב להכיל לפחות 2 תווים";
            if (!formData.phone.match(/^05\d{8}$/))
                errors.phone = "מספר טלפון לא תקין (לדוגמה: 0501234567)";
            if (!formData.email.match(/^\S+@\S+\.\S+$/))
                errors.email = "כתובת אימייל לא תקינה";
            if (formData.password.length < 8)
                errors.password = "סיסמה חייבת להכיל לפחות 8 תווים";
            if (formData.password !== formData.confirmPassword)
                errors.confirmPassword = "הסיסמאות אינן תואמות";
        }
        if (stepIdx === 1) {
            if (!formData.role) errors.role = "יש לבחור תפקיד";
        }
        if (stepIdx === 2) {
            if (!formData.idPhotoPreview) errors.idPhoto = "יש להעלות תעודת זהות";
        }
        return errors;
    };

    const [step, setStep] = useState(0);
    const [form, setForm] = useState({
        fullName: "", phone: "", email: "", password: "", confirmPassword: "",
        role: "", preferredLanguage: "he", gender: "other",
        referralCode: "", idPhotoFile: null, idPhotoPreview: "", profilePhotoFile: null, profilePhotoPreview: ""
    });
    const [errors, setErrors] = useState({});
    const [error,  setError]  = useState("");
    const [loading, setLoading] = useState(false);
    const [showPw, setShowPw]   = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const goNext = () => {
        const errs = validate(step, form);
        setErrors(errs);
        if (Object.keys(errs).length === 0) setStep(s => s + 1);
    };

    const goBack = () => { setStep(s => s - 1); setErrors({}); };

    const handleFile = (field, previewField) => (e) => {
        const file = e.target.files[0];
        if (!file) return;
        set(field, file);
        const reader = new FileReader();
        reader.onload = ev => set(previewField, ev.target.result);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        const errs = validate(2, form);
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setError("");
        setLoading(true);
        try {
            const { data } = await api.post("/users/register", {
                fullName: form.fullName,
                email:    form.email,
                password: form.password,
                phone:    form.phone,
                role:     form.role,
                preferredLanguage: form.preferredLanguage,
                referralCode: form.referralCode || undefined
            });

            // Upload ID photo
            if (form.idPhotoFile && data.userId) {
                const fd = new FormData();
                fd.append("idPhoto", form.idPhotoFile);
                fd.append("userId", data.userId);
                await api.post("/uploads/id-photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
            }
            // Upload profile photo
            if (form.profilePhotoFile && data.userId) {
                const fd = new FormData();
                fd.append("profileImage", form.profilePhotoFile);
                fd.append("userId", data.userId);
                await api.post("/uploads/profile", fd, { headers: { "Content-Type": "multipart/form-data" } });
            }

            // If driver/both → go to driver setup after login
            navigate("/login", { state: { needsDriverSetup: form.role === "driver" || form.role === "both" } });
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בהרשמה");
        } finally {
            setLoading(false);
        }
    };

    const ROLES = [
        { value: "passenger", icon: "🧍", label: "נוסע",    desc: "אני מחפש נסיעות" },
        { value: "driver",    icon: "🚗", label: "נהג",     desc: "אני מציע נסיעות" },
        { value: "both",      icon: "🔄", label: "נהג ונוסע", desc: "שניהם" }
    ];

    return (
        <div style={s.page}>
            <div style={s.card} className="fade-in">
                <div style={{ textAlign: "center", fontSize: 36, marginBottom: 8 }}>🚕</div>
                <h1 style={s.title}>{"הירשם"}</h1>
                <p style={s.sub}>שלב {step + 1} מתוך {STEPS.length} — {STEPS[step]}</p>

                {/* Progress bar */}
                <div style={s.stepBar} role="progressbar" aria-valuenow={step + 1} aria-valuemax={STEPS.length}>
                    {STEPS.map((_, i) => <div key={i} style={s.step(i === step, i < step)} />)}
                </div>

                {/* Step 1: Personal info */}
                {step === 0 && (
                    <div>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="fullName">{"שם מלא"} *</label>
                            <input id="fullName" placeholder="ישראל ישראלי"
                                value={form.fullName}
                                onChange={e => set("fullName", e.target.value)}
                                aria-required="true"
                                style={{ borderColor: errors.fullName ? "var(--danger)" : undefined }}
                            />
                            <FieldErr msg={errors.fullName} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="phone">{"טלפון"} *</label>
                            <input id="phone" type="tel" placeholder="0501234567"
                                value={form.phone}
                                onChange={e => set("phone", e.target.value)}
                                aria-required="true"
                                style={{ borderColor: errors.phone ? "var(--danger)" : undefined }}
                            />
                            <FieldErr msg={errors.phone} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="reg-email">{"אימייל"} *</label>
                            <input id="reg-email" type="email" placeholder="you@example.com"
                                value={form.email}
                                onChange={e => set("email", e.target.value)}
                                autoComplete="email"
                                style={{ borderColor: errors.email ? "var(--danger)" : undefined }}
                            />
                            <FieldErr msg={errors.email} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="reg-pw">{"סיסמה"} *</label>
                            <div style={{ position: "relative" }}>
                                <input id="reg-pw"
                                    type={showPw ? "text" : "password"}
                                    placeholder="לפחות 8 תווים"
                                    value={form.password}
                                    onChange={e => set("password", e.target.value)}
                                    style={{ paddingLeft: 44, borderColor: errors.password ? "var(--danger)" : undefined }}
                                    autoComplete="new-password"
                                />
                                <button type="button" onClick={() => setShowPw(p => !p)}
                                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", padding: 0, fontSize: 16 }}>
                                    {showPw ? "🙈" : "👁️"}
                                </button>
                            </div>
                            <FieldErr msg={errors.password} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="confirm-pw">אימות סיסמה *</label>
                            <input id="confirm-pw"
                                type={showPw ? "text" : "password"}
                                placeholder="הזן שוב"
                                value={form.confirmPassword}
                                onChange={e => set("confirmPassword", e.target.value)}
                                style={{ borderColor: errors.confirmPassword ? "var(--danger)" : undefined }}
                                autoComplete="new-password"
                            />
                            <FieldErr msg={errors.confirmPassword} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="referral">קוד הפניה (אופציונלי)</label>
                            <input id="referral" placeholder="הכנס קוד אם קיבלת"
                                value={form.referralCode}
                                onChange={e => set("referralCode", e.target.value.toUpperCase())}
                            />
                        </div>
                    </div>
                )}

                {/* Step 2: Role & preferences */}
                {step === 1 && (
                    <div>
                        <div style={s.group}>
                            <label style={s.label}>{"תפקיד"} *</label>
                            <div style={{ display: "flex", gap: 10 }}>
                                {ROLES.map(r => (
                                    <div key={r.value} style={s.roleCard(form.role === r.value)}
                                        onClick={() => set("role", r.value)}
                                        role="radio" aria-checked={form.role === r.value}
                                        tabIndex={0}
                                        onKeyDown={e => e.key === "Enter" && set("role", r.value)}>
                                        <div style={{ fontSize: 28, marginBottom: 6 }}>{r.icon}</div>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{r.label}</div>
                                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{r.desc}</div>
                                    </div>
                                ))}
                            </div>
                            <FieldErr msg={errors.role} />
                        </div>

                        <div style={s.row}>
                            <div style={s.group}>
                                <label style={s.label}>{"שפה"}</label>
                                <select value={form.preferredLanguage}
                                    onChange={e => set("preferredLanguage", e.target.value)}>
                                    <option value="he">{"עברית"}</option>
                                    <option value="en">{"English"}</option>
                                </select>
                            </div>
                            <div style={s.group}>
                                <label style={s.label}>מגדר</label>
                                <select value={form.gender}
                                    onChange={e => set("gender", e.target.value)}>
                                    <option value="male">זכר</option>
                                    <option value="female">נקבה</option>
                                    <option value="other">אחר</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Documents */}
                {step === 2 && (
                    <div>
                        <div style={{ ...s.group, textAlign: "center", background: "#fef9c3", borderRadius: 10, padding: 12, marginBottom: 20 }}>
                            <span style={{ fontSize: 13, color: "#92400e" }}>
                                🔒 המסמכים שלך נשמרים בצורה מאובטחת ויישלחו לאישור הצוות שלנו
                            </span>
                        </div>

                        {/* ID Photo */}
                        <div style={s.group}>
                            <label style={s.label}>{"העלה תעודת זהות"} * <span style={{ color: "var(--danger)" }}>חובה</span></label>
                            <label style={{
                                ...s.fileBox,
                                borderColor: errors.idPhoto ? "var(--danger)" : form.idPhotoPreview ? "var(--success)" : undefined
                            }}>
                                {form.idPhotoPreview ? (
                                    <img src={form.idPhotoPreview} alt="תעודת זהות"
                                        style={{ maxHeight: 120, borderRadius: 8, objectFit: "cover" }} />
                                ) : (
                                    <div>
                                        <div style={{ fontSize: 32, marginBottom: 6 }}>🪪</div>
                                        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>לחץ להעלאת תעודת זהות</div>
                                    </div>
                                )}
                                <input type="file" accept="image/*" style={{ display: "none" }}
                                    onChange={handleFile("idPhotoFile", "idPhotoPreview")} />
                            </label>
                            <FieldErr msg={errors.idPhoto} />
                        </div>

                        {/* Profile Photo */}
                        <div style={s.group}>
                            <label style={s.label}>{"תמונת פרופיל"} (אופציונלי לנוסעים, חובה לנהגים)</label>
                            <label style={{ ...s.fileBox, borderColor: form.profilePhotoPreview ? "var(--success)" : undefined }}>
                                {form.profilePhotoPreview ? (
                                    <img src={form.profilePhotoPreview} alt="תמונת פרופיל"
                                        style={{ width: 90, height: 90, borderRadius: "50%", objectFit: "cover" }} />
                                ) : (
                                    <div>
                                        <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                                        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>לחץ להעלאת תמונת פרופיל</div>
                                    </div>
                                )}
                                <input type="file" accept="image/*" style={{ display: "none" }}
                                    onChange={handleFile("profilePhotoFile", "profilePhotoPreview")} />
                            </label>
                        </div>
                    </div>
                )}

                {error && <p className="error-msg" role="alert" style={{ marginBottom: 8 }}>⚠️ {error}</p>}

                <div style={s.navRow}>
                    {step > 0 && (
                        <button type="button" onClick={goBack}
                            style={{ flex: 1, background: "var(--border)", color: "var(--text)" }}>
                            ← חזור
                        </button>
                    )}
                    {step < 2 ? (
                        <button type="button" onClick={goNext}
                            className="btn-primary" style={{ flex: 2 }}>
                            הבא →
                        </button>
                    ) : (
                        <button type="button" onClick={handleSubmit}
                            className="btn-primary" style={{ flex: 2 }} disabled={loading}>
                            {loading ? "טוען..." : "סיים הרשמה ✓"}
                        </button>
                    )}
                </div>

                <p style={s.footer}>
                    יש לך חשבון?{" "}
                    <Link to="/login" style={s.link}>{"התחבר"}</Link>
                </p>
            </div>
        </div>
    );
}
