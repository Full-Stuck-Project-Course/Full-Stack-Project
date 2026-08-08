// src/pages/ProfilePage.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "../routing";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { assetUrl, secureUploadPath } from "../api/assets";
import {
    documentBadgeStyle,
    documentStatus,
    documentStatusIcon,
    documentStatusLabel
} from "../api/verification";
import AutoVerificationOverlay, { waitForAutoVerification } from "../components/AutoVerificationOverlay";

const s = {
    page: { padding: "28px 20px", maxWidth: 640, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    avatar: {
        width: 90, height: 90, borderRadius: "50%",
        background: "var(--primary)", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 36, color: "#fff",
        marginBottom: 14, overflow: "hidden", position: "relative", cursor: "pointer"
    },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 16 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    tag: (c) => ({ display: "inline-block", background: c + "18", color: c, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }),
};

const ROLE_LABELS = { passenger: "נוסע", driver: "נהג", both: "נהג ונוסע", admin: "מנהל" };
const ROLE_COLORS = { passenger: "#3b82f6", driver: "#10b981", both: "#8b5cf6", admin: "#ef4444" };

const PROFILE_PHOTO_VERIFICATION = {
    title: "מאשרים את תמונת הפרופיל שלך",
    subtitle: "האישור מתבצע מיד אחרי ההעלאה.",
    steps: [
        { label: "מעלה את התמונה", detail: "הקובץ נשמר במסד הנתונים" },
        { label: "בודק איכות תמונה", detail: "מוודא שהקובץ תקין וקריא" },
        { label: "מאשר את התמונה", detail: "האישור מיידי — אין המתנה לנציג" }
    ],
    successTitle: "תמונת הפרופיל אושרה",
    successText: "התמונה שלך עודכנה ואושרה."
};

function SecureImage({ path, alt, style }) {
    const [src, setSrc] = useState("");
    useEffect(() => {
        if (!path) return;
        let active = true;
        let objectUrl = "";
        const apiPath = secureUploadPath(path);
        if (!apiPath) return;
        api.get(apiPath, { responseType: "blob" })
            .then(({ data }) => {
                if (!active) return;
                objectUrl = URL.createObjectURL(data);
                setSrc(objectUrl);
            })
            .catch(() => {});
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [path]);
    if (!src) return null;
    return <img src={src} alt={alt} style={style} />;
}

export default function ProfilePage() {
    const { user, updateUser } = useAuth();
    const userId               = user?.userId;
    const navigate             = useNavigate();
    const [profile,  setProfile]  = useState(null);
    const [form,     setForm]     = useState({});
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);
    const [saved,    setSaved]    = useState(false);
    const [error,    setError]    = useState("");
    const [pwForm,   setPwForm]   = useState({ currentPassword: "", newPassword: "", confirm: "" });
    const [pwSaved,  setPwSaved]  = useState(false);
    const [pwError,  setPwError]  = useState("");
    const [showPw,   setShowPw]   = useState({ currentPassword: false, newPassword: false, confirm: false });
    const [idVerification, setIdVerification] = useState(null);
    const [photoApproved, setPhotoApproved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/users/${userId}`);
                setProfile(data);
                setForm({
                    fullName: data.fullName,
                    phone: data.phone,
                    preferredLanguage: data.preferredLanguage
                });
            } finally { setLoading(false); }
        })();
    }, [userId]);

    const [formErrors, setFormErrors] = useState({});

    const set = (k, v) => {
        setForm(f => ({ ...f, [k]: v }));
        setFormErrors(er => ({ ...er, [k]: undefined }));
        if (k === "fullName" && v.trim().length > 0 && v.trim().length < 2)
            setFormErrors(er => ({ ...er, fullName: "שם מלא חייב להכיל לפחות 2 תווים" }));
        if (k === "phone") {
            const digits = v.replace(/\D/g, "");
            if (digits.length > 0 && !digits.match(/^05\d{0,8}$/))
                setFormErrors(er => ({ ...er, phone: "מספר טלפון חייב להתחיל ב-05" }));
            else if (digits.length > 0 && digits.length < 10)
                setFormErrors(er => ({ ...er, phone: `חסרות ${10 - digits.length} ספרות` }));
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!form.fullName || form.fullName.trim().length < 2) errs.fullName = "שם מלא חייב להכיל לפחות 2 תווים";
        if (form.phone && !form.phone.match(/^05\d{8}$/)) errs.phone = "מספר טלפון לא תקין";
        if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }

        setSaving(true); setError("");
        try {
            await api.put(`/users/${user.userId}`, form);
            updateUser({ fullName: form.fullName, preferredLanguage: form.preferredLanguage });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בשמירה");
        } finally { setSaving(false); }
    };

    const handlePwChange = async (e) => {
        e.preventDefault();
        setPwError("");
        if (pwForm.newPassword.length < 8) return setPwError("סיסמה חייבת להכיל לפחות 8 תווים");
        if (!/[A-Z]/.test(pwForm.newPassword)) return setPwError("סיסמה חייבת להכיל לפחות אות גדולה אחת");
        if (!/[a-z]/.test(pwForm.newPassword)) return setPwError("סיסמה חייבת להכיל לפחות אות קטנה אחת");
        if (!/[0-9]/.test(pwForm.newPassword)) return setPwError("סיסמה חייבת להכיל לפחות מספר אחד");
        if (pwForm.newPassword !== pwForm.confirm) return setPwError("הסיסמאות אינן תואמות");
        try {
            await api.put(`/users/${user.userId}/password`, {
                currentPassword: pwForm.currentPassword,
                newPassword: pwForm.newPassword
            });
            setPwSaved(true);
            setPwForm({ currentPassword: "", newPassword: "", confirm: "" });
            setTimeout(() => setPwSaved(false), 3000);
        } catch (err) {
            setPwError(err.response?.data?.error || "שגיאה בשינוי סיסמה");
        }
    };

    const handleProfilePhoto = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("profileImage", file);
        fd.append("userId", user.userId);
        setError("");
        setPhotoApproved(false);
        setIdVerification(PROFILE_PHOTO_VERIFICATION);
        const verificationDelay = waitForAutoVerification();
        try {
            const [updatedProfile] = await Promise.all([
                (async () => {
                    await api.post("/uploads/profile", fd, { headers: { "Content-Type": "multipart/form-data" } });
                    const { data } = await api.get(`/users/${user.userId}`);
                    return data;
                })(),
                verificationDelay
            ]);
            setProfile(updatedProfile);
            setPhotoApproved(true);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בהעלאת תמונת הפרופיל");
        } finally {
            setIdVerification(null);
        }
    };

    const handleIdPhoto = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("idPhoto", file);
        fd.append("userId", user.userId);
        setError("");
        setIdVerification({
            title: "מאשרים את תעודת הזהות שלך",
            subtitle: "הפרופיל יתעדכן מיד.",
            steps: [
                { label: "מעלה תעודת זהות", detail: "הקובץ נשמר באזור פרטי" },
                { label: "בודק איכות תמונה", detail: "מוודא שהצילום ברור וקריא" },
                { label: "מאשר את המסמך", detail: "תגית האימות עוברת למאושר" }
            ],
            successTitle: "תעודת הזהות אושרה",
            successText: "הפרופיל שלך עודכן בהצלחה."
        });
        const verificationDelay = waitForAutoVerification();
        try {
            const [updatedProfile] = await Promise.all([
                (async () => {
                    await api.post("/uploads/id-photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
                    const { data } = await api.get(`/users/${user.userId}`);
                    return data;
                })(),
                verificationDelay
            ]);
            setProfile(updatedProfile);
            updateUser({
                idPhotoPath: updatedProfile.idPhotoPath,
                idVerificationStatus: updatedProfile.idVerificationStatus
            });
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בהעלאת תעודת הזהות");
        } finally {
            setIdVerification(null);
        }
    };

    if (loading) return <div className="spinner" />;

    const hasIdPhoto = Boolean(profile?.idPhotoPath);
    const verifyStatus = documentStatus(profile?.idVerificationStatus, hasIdPhoto);
    const verifyLabel = documentStatusLabel(profile?.idVerificationStatus, hasIdPhoto);
    const verifyIcon = documentStatusIcon(profile?.idVerificationStatus, hasIdPhoto);
    const photoStatus = documentStatus(null, Boolean(profile?.profileImage));

    return (
        <div style={s.page} className="fade-in">
            <AutoVerificationOverlay open={Boolean(idVerification)} {...(idVerification || {})} />
            <h1 style={s.title}>{"הפרופיל שלי"}</h1>

            {/* Profile card */}
            <div style={s.card}>
                <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16 }}>
                    <label style={s.avatar} title="לחץ לשינוי תמונה">
                        {profile?.profileImage
                            ? <img src={assetUrl(profile.profileImage)} alt="תמונת פרופיל" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span>{profile?.fullName?.[0] || "?"}</span>
                        }
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleProfilePhoto} />
                        <div style={{ position: "absolute", bottom: 0, right: 0, background: "rgba(0,0,0,0.5)", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✏️</div>
                    </label>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 20 }}>{profile?.fullName}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 2 }}>{profile?.email}</div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={s.tag(ROLE_COLORS[profile?.role] || "#888")}>
                                {ROLE_LABELS[profile?.role] || profile?.role}
                            </span>
                            {profile?.profileImage && (
                                <span style={documentBadgeStyle(photoStatus)}>
                                    🖼️ {"תמונת פרופיל"}: {documentStatusIcon(null, true)} {documentStatusLabel(null, true)}
                                </span>
                            )}
                            <span style={documentBadgeStyle(verifyStatus)}>
                                🪪 {"תעודת זהות"}: {verifyIcon} {verifyLabel}
                            </span>
                        </div>
                    </div>
                </div>

                {photoApproved && (
                    <div role="status" style={{ background: "#d1fae5", color: "#065f46", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                        ✅ תמונת הפרופיל אושרה
                    </div>
                )}

                {profile?.loyaltyPoints > 0 && (
                    <div style={{ background: "#fef3c7", borderRadius: 10, padding: "12px 14px", fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 12 }}>
                        <div>✨ {profile.loyaltyPoints} {"נקודות נאמנות"}</div>
                        <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>
                            שווה ₪{(profile.loyaltyPoints * 0.1).toFixed(1)} — ניתן לפדות בכל הזמנת נסיעה
                        </div>
                    </div>
                )}

                {profile?.referralCode && (
                    <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>🎁 {"קוד הפניה"}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input readOnly value={profile.referralCode} style={{ fontWeight: 700, letterSpacing: 2, flex: 1 }} />
                            <button onClick={() => { navigator.clipboard?.writeText(profile.referralCode); alert("הועתק!"); }}
                                style={{ background: "var(--success)", color: "#fff", padding: "8px 14px" }}>
                                העתק
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit form */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>✏️ {"עריכת פרטים"}</div>
                <form onSubmit={handleSave}>
                    <div style={s.group}>
                        <label style={s.label}>{"שם מלא"}</label>
                        <input value={form.fullName || ""}
                            onChange={e => set("fullName", e.target.value)}
                            style={{ borderColor: formErrors.fullName ? "var(--danger)" : undefined }} />
                        {formErrors.fullName && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>⚠️ {formErrors.fullName}</p>}
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>{"טלפון"}</label>
                            <input value={form.phone || ""}
                                onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                                inputMode="numeric" maxLength={10}
                                style={{ borderColor: formErrors.phone ? "var(--danger)" : undefined }} />
                            {formErrors.phone && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>⚠️ {formErrors.phone}</p>}
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>{"שפה"}</label>
                            <select value={form.preferredLanguage || "he"}
                                onChange={e => set("preferredLanguage", e.target.value)}>
                                <option value="he">{"עברית"}</option>
                                <option value="en">{"English"}</option>
                            </select>
                        </div>
                    </div>
                    {error && <p className="error-msg">⚠️ {error}</p>}
                    <button type="submit" className="btn-primary" disabled={saving} style={{ width: "auto" }}>
                        {saved ? "✓ נשמר!" : "שמור"}
                    </button>
                </form>
            </div>

            {/* ID verification */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🪪 {"העלה תעודת זהות"}</div>
                {profile?.idPhotoPath ? (
                    <div>
                        <SecureImage path={profile.idPhotoPath} alt="תעודת זהות"
                            style={{ maxHeight: 140, borderRadius: 8, objectFit: "cover", marginBottom: 10 }} />
                        <div style={documentBadgeStyle(verifyStatus)}>
                            {verifyIcon} {verifyLabel}
                        </div>
                    </div>
                ) : (
                    <label style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: 20, display: "block", textAlign: "center", cursor: "pointer" }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🪪</div>
                        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>לחץ להעלאת תעודת זהות</div>
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleIdPhoto} />
                    </label>
                )}
            </div>

            {/* Change password */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>🔑 שינוי סיסמה</div>
                <form onSubmit={handlePwChange}>
                    {["currentPassword", "newPassword", "confirm"].map((field, i) => (
                        <div key={field} style={s.group}>
                            <label style={s.label}>
                                {i === 0 ? "סיסמה נוכחית" : i === 1 ? "סיסמה חדשה" : "אימות סיסמה חדשה"}
                            </label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showPw[field] ? "text" : "password"}
                                    value={pwForm[field]}
                                    onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                                    autoComplete={i === 0 ? "current-password" : "new-password"}
                                    style={{ paddingLeft: 44 }}
                                />
                                <button type="button"
                                    onClick={() => setShowPw(p => ({ ...p, [field]: !p[field] }))}
                                    aria-label={showPw[field] ? "הסתר סיסמה" : "הצג סיסמה"}
                                    style={{
                                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                                        background: "none", border: "none", padding: "4px 6px", cursor: "pointer",
                                        borderRadius: 6, color: "var(--text-muted)", fontSize: 13, fontWeight: 600,
                                        transition: "background 0.2s, color 0.2s"
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                                    {showPw[field] ? "הסתר" : "הצג"}
                                </button>
                            </div>
                        </div>
                    ))}
                    {pwError && <p className="error-msg">⚠️ {pwError}</p>}
                    {pwSaved && <p className="success-msg">✅ הסיסמה שונתה בהצלחה!</p>}
                    <button type="submit" style={{ background: "var(--primary)", color: "#fff", padding: "10px 20px" }}>
                        שנה סיסמה
                    </button>
                </form>
            </div>

            {/* Switch to driver */}
            {user?.role === "passenger" && (
                <div style={{ ...s.card, textAlign: "center", borderColor: "var(--success)" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🚗</div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{"עבור למצב נהג"}</div>
                    <button style={{ background: "var(--success)", color: "#fff", padding: "10px 24px", borderRadius: 10 }}
                        onClick={() => navigate("/driver-setup")}>
                        {"הגדרת פרופיל נהג"} →
                    </button>
                </div>
            )}
        </div>
    );
}
