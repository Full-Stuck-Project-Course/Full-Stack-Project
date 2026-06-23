// src/pages/DriverSetupPage.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

const STEPS = ["פרטי נהג", "רכב", "מסמכים"];
const VEHICLE_TYPES = ["regular", "comfort", "luxury", "van"];
const LANGS = ["עברית", "אנגלית", "ערבית", "רוסית", "אמהרית", "צרפתית"];

const s = {
    page: { padding: "28px 20px", maxWidth: 560, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 6 },
    sub: { color: "var(--text-muted)", fontSize: 14, marginBottom: 24 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 18 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    stepBar: { display: "flex", gap: 6, marginBottom: 24 },
    step: (a, d) => ({ flex: 1, height: 5, borderRadius: 3, background: d ? "var(--success)" : a ? "var(--primary)" : "var(--border)", transition: "background 0.3s" }),
    fileBox: { border: "2px dashed var(--border)", borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" },
    tagList: { display: "flex", flexWrap: "wrap", gap: 8 },
    tag: (sel) => ({
        padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
        border: `1.5px solid ${sel ? "var(--primary)" : "var(--border)"}`,
        background: sel ? "rgba(79,70,229,0.08)" : "var(--surface)",
        color: sel ? "var(--primary)" : "var(--text-muted)",
        fontWeight: sel ? 700 : 400
    })
};

function FileUpload({ label, preview, onChange, fieldName }) {
    return (
        <div style={s.group}>
            <label style={s.label}>{label}</label>
            <label style={{ ...s.fileBox, borderColor: preview ? "var(--success)" : undefined }}>
                {preview
                    ? <img src={preview} alt={label} style={{ maxHeight: 100, borderRadius: 8, objectFit: "cover" }} />
                    : <div><div style={{ fontSize: 28, marginBottom: 6 }}>📄</div><div style={{ fontSize: 13, color: "var(--text-muted)" }}>לחץ להעלאה</div></div>
                }
                <input type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => {
                        const file = e.target.files[0];
                        if (!file) return;
                        onChange(file);
                    }} />
            </label>
        </div>
    );
}

export default function DriverSetupPage() {
    const { user, updateUser } = useAuth();
    const { t }     = useLang();
    const navigate  = useNavigate();
    const [step, setStep] = useState(0);
    const [existingDriver, setExistingDriver] = useState(null);
    const [driverForm, setDF] = useState({
        licenseNumber: "", licenseExpiry: "", gender: "other",
        preferredMusic: "", hobbies: "",
        spokenLanguages: [], acceptsCarpoolRides: true,
        vehicleConditions: { noPets: false, noSmoking: true, noFood: false }
    });
    const [vehicleForm, setVF] = useState({
        company: "", model: "", year: "", color: "", licensePlate: "",
        vehicleType: "regular", seats: 4,
        testApproval: false, insuranceApproval: false
    });
    const [licenseFile, setLicenseFile] = useState(null);
    const [licensePreview, setLicensePreview] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/drivers").then(r => {
            const d = r.data.find(d => d.userId?._id === user?.userId || d.userId === user?.userId);
            if (d) {
                setExistingDriver(d);
                setDF(prev => ({
                    ...prev,
                    licenseNumber: d.licenseNumber || "",
                    gender: d.gender || "other",
                    preferredMusic: d.preferredMusic || "",
                    hobbies: d.hobbies?.join(", ") || "",
                    spokenLanguages: d.spokenLanguages || [],
                    acceptsCarpoolRides: d.acceptsCarpoolRides ?? true,
                    vehicleConditions: d.vehicleConditions || { noPets: false, noSmoking: true, noFood: false }
                }));
            }
        }).catch(() => {});
    }, []);

    const setD = (k, v) => setDF(f => ({ ...f, [k]: v }));
    const setV = (k, v) => setVF(f => ({ ...f, [k]: v }));
    const toggleLang = (lang) => setDF(f => ({
        ...f,
        spokenLanguages: f.spokenLanguages.includes(lang)
            ? f.spokenLanguages.filter(l => l !== lang)
            : [...f.spokenLanguages, lang]
    }));

    const validateStep = () => {
        if (step === 0) {
            if (!driverForm.licenseNumber.trim()) return "נא להזין מספר רישיון נהיגה";
        }
        if (step === 1) {
            if (!vehicleForm.company || !vehicleForm.model || !vehicleForm.year || !vehicleForm.licensePlate)
                return "נא למלא את כל פרטי הרכב";
        }
        if (step === 2) {
            if (!licensePreview) return "יש להעלות צילום רישיון נהיגה";
        }
        return null;
    };

    const handleLicenseFile = (file) => {
        setLicenseFile(file);
        const reader = new FileReader();
        reader.onload = ev => setLicensePreview(ev.target.result);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        const err = validateStep();
        if (err) return setError(err);

        setError("");
        setLoading(true);
        try {
            let driverId;

            if (existingDriver) {
                await api.put(`/drivers/${existingDriver._id}`, {
                    licenseNumber: driverForm.licenseNumber,
                    gender: driverForm.gender,
                    preferredMusic: driverForm.preferredMusic,
                    hobbies: driverForm.hobbies.split(",").map(s => s.trim()).filter(Boolean),
                    spokenLanguages: driverForm.spokenLanguages,
                    acceptsCarpoolRides: driverForm.acceptsCarpoolRides,
                    vehicleConditions: driverForm.vehicleConditions,
                    licenseExpiry: driverForm.licenseExpiry || undefined
                });
                driverId = existingDriver._id;
            } else {
                const { data } = await api.post("/drivers", {
                    userId: user?.userId,
                    licenseNumber: driverForm.licenseNumber,
                    gender: driverForm.gender,
                    preferredMusic: driverForm.preferredMusic,
                    hobbies: driverForm.hobbies.split(",").map(s => s.trim()).filter(Boolean),
                    spokenLanguages: driverForm.spokenLanguages,
                    acceptsCarpoolRides: driverForm.acceptsCarpoolRides,
                    vehicleConditions: driverForm.vehicleConditions,
                    licenseExpiry: driverForm.licenseExpiry || undefined
                });
                driverId = data.driver?._id;
            }

            // Vehicle
            await api.post("/vehicles", {
                driverId,
                company: vehicleForm.company,
                model:   vehicleForm.model,
                year:    Number(vehicleForm.year),
                color:   vehicleForm.color,
                licensePlate: vehicleForm.licensePlate,
                vehicleType:  vehicleForm.vehicleType,
                seats:   Number(vehicleForm.seats),
                testApproval:      vehicleForm.testApproval,
                insuranceApproval: vehicleForm.insuranceApproval
            });

            // License photo
            if (licenseFile && driverId) {
                const fd = new FormData();
                fd.append("licensePhoto", licenseFile);
                fd.append("driverProfileId", driverId);
                await api.post("/uploads/license", fd, { headers: { "Content-Type": "multipart/form-data" } });
            }

            // Update user role if needed
            if (user?.role === "passenger") {
                await api.put(`/users/${user.userId}`, { role: "both" });
                updateUser({ role: "both" });
            }

            navigate("/driver");
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בשמירת הפרופיל");
        } finally {
            setLoading(false);
        }
    };

    const goNext = () => {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError("");
        setStep(s => s + 1);
    };

    return (
        <div style={s.page} className="fade-in">
            <h1 style={s.title}>{"הגדרת פרופיל נהג"}</h1>
            <p style={s.sub}>שלב {step + 1} מתוך {STEPS.length} — {STEPS[step]}</p>

            <div style={s.stepBar}>
                {STEPS.map((_, i) => <div key={i} style={s.step(i === step, i < step)} />)}
            </div>

            {/* Step 0: Driver details */}
            {step === 0 && (
                <div style={s.card}>
                    <div style={s.group}>
                        <label style={s.label}>{"מספר רישיון נהיגה"} * <span style={{ color: "var(--danger)" }}>חובה</span></label>
                        <input placeholder="12345678" value={driverForm.licenseNumber}
                            onChange={e => setD("licenseNumber", e.target.value)} />
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>תפוגת רישיון</label>
                        <input type="date" value={driverForm.licenseExpiry}
                            onChange={e => setD("licenseExpiry", e.target.value)} />
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>מגדר</label>
                            <select value={driverForm.gender} onChange={e => setD("gender", e.target.value)}>
                                <option value="male">זכר</option>
                                <option value="female">נקבה</option>
                                <option value="other">אחר</option>
                            </select>
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>מוזיקה אהובה</label>
                            <input placeholder="פופ, רוק, מזרחי..." value={driverForm.preferredMusic}
                                onChange={e => setD("preferredMusic", e.target.value)} />
                        </div>
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>תחביבים (יוצג לנוסעים)</label>
                        <input placeholder="ספורט, בישול, טיולים..." value={driverForm.hobbies}
                            onChange={e => setD("hobbies", e.target.value)} />
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>שפות מדוברות</label>
                        <div style={s.tagList}>
                            {LANGS.map(lang => (
                                <span key={lang} style={s.tag(driverForm.spokenLanguages.includes(lang))}
                                    onClick={() => toggleLang(lang)}>
                                    {lang}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>תנאי נסיעה</label>
                        {[
                            { key: "noSmoking", label: "🚭 ללא עישון" },
                            { key: "noPets",    label: "🐾 ללא חיות מחמד" },
                            { key: "noFood",    label: "🍔 ללא אוכל" }
                        ].map(c => (
                            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                                <input type="checkbox"
                                    checked={driverForm.vehicleConditions[c.key]}
                                    onChange={e => setD("vehicleConditions", { ...driverForm.vehicleConditions, [c.key]: e.target.checked })} />
                                {c.label}
                            </label>
                        ))}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                        <input type="checkbox" checked={driverForm.acceptsCarpoolRides}
                            onChange={e => setD("acceptsCarpoolRides", e.target.checked)} />
                        קבל נסיעות קרפול (שיתוף עם נוסעים נוספים)
                    </label>
                </div>
            )}

            {/* Step 1: Vehicle */}
            {step === 1 && (
                <div style={s.card}>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>{"חברה"} *</label>
                            <input placeholder="טויוטה, יונדאי..." value={vehicleForm.company}
                                onChange={e => setV("company", e.target.value)} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>{"דגם"} *</label>
                            <input placeholder="קורולה, i35..." value={vehicleForm.model}
                                onChange={e => setV("model", e.target.value)} />
                        </div>
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>{"שנה"} *</label>
                            <input type="number" placeholder="2020" min="1990" max={new Date().getFullYear()}
                                value={vehicleForm.year} onChange={e => setV("year", e.target.value)} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>{"צבע"} *</label>
                            <input placeholder="לבן, שחור..." value={vehicleForm.color}
                                onChange={e => setV("color", e.target.value)} />
                        </div>
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>{"לוחית רישוי"} *</label>
                            <input placeholder="12-345-67" value={vehicleForm.licensePlate}
                                onChange={e => setV("licensePlate", e.target.value)} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>מושבים</label>
                            <select value={vehicleForm.seats} onChange={e => setV("seats", Number(e.target.value))}>
                                {[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>{"סוג רכב"}</label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {VEHICLE_TYPES.map(vt => (
                                <span key={vt}
                                    style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                                        border: `1.5px solid ${vehicleForm.vehicleType === vt ? "var(--primary)" : "var(--border)"}`,
                                        background: vehicleForm.vehicleType === vt ? "rgba(79,70,229,0.08)" : "var(--surface)",
                                        color: vehicleForm.vehicleType === vt ? "var(--primary)" : "var(--text-muted)", fontWeight: vehicleForm.vehicleType === vt ? 700 : 400 }}
                                    onClick={() => setV("vehicleType", vt)}>
                                    {t(vt)}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div>
                        {[
                            { key: "testApproval",      label: "✅ אישור טסט תקף" },
                            { key: "insuranceApproval", label: "✅ ביטוח תקף" }
                        ].map(c => (
                            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                                <input type="checkbox" checked={vehicleForm[c.key]}
                                    onChange={e => setV(c.key, e.target.checked)} />
                                {c.label}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Step 2: Documents */}
            {step === 2 && (
                <div style={s.card}>
                    <div style={{ background: "#fef9c3", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: "#92400e" }}>
                        🔒 המסמכים נשמרים בצורה מאובטחת ויאושרו על ידי הצוות שלנו לפני שתוכל לקבל נסיעות.
                    </div>
                    <FileUpload
                        label="📷 צילום רישיון נהיגה * (חובה)"
                        preview={licensePreview}
                        onChange={handleLicenseFile}
                        fieldName="licensePhoto"
                    />
                </div>
            )}

            {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {step > 0 && (
                    <button type="button" onClick={() => { setStep(s => s - 1); setError(""); }}
                        style={{ flex: 1, background: "var(--border)", color: "var(--text)" }}>
                        ← חזור
                    </button>
                )}
                {step < 2 ? (
                    <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={goNext}>
                        הבא →
                    </button>
                ) : (
                    <button type="button" className="btn-primary" style={{ flex: 2 }} disabled={loading} onClick={handleSubmit}>
                        {loading ? "טוען..." : "שמור וסיים ✓"}
                    </button>
                )}
            </div>
        </div>
    );
}
