// src/pages/ProfilePage.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

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
    verifyBadge: (status) => ({
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
        background: status === "approved" ? "#d1fae5" : status === "pending" ? "#fef3c7" : "#fee2e2",
        color:      status === "approved" ? "#065f46" : status === "pending" ? "#92400e" : "#991b1b"
    })
};

const ROLE_LABELS = { passenger: "נוסע", driver: "נהג", both: "נהג ונוסע", admin: "מנהל" };
const ROLE_COLORS = { passenger: "#3b82f6", driver: "#10b981", both: "#8b5cf6", admin: "#ef4444" };
const VERIFY_LABELS = { not_submitted: "לא הוגש", pending: "ממתין לאישור", approved: "מאושר", rejected: "נדחה" };
const VERIFY_ICONS  = { not_submitted: "📄", pending: "⏳", approved: "✅", rejected: "❌" };

export default function ProfilePage() {
    const { user, updateUser } = useAuth();
    const { t }                = useLang();
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
    const [showPw,   setShowPw]   = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/users/${user.userId}`);
                setProfile(data);
                setForm({
                    fullName: data.fullName,
                    phone: data.phone,
                    preferredLanguage: data.preferredLanguage
                });
            } finally { setLoading(false); }
        })();
    }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async (e) => {
        e.preventDefault();
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
        await api.post("/uploads/profile", fd, { headers: { "Content-Type": "multipart/form-data" } });
        const { data } = await api.get(`/users/${user.userId}`);
        setProfile(data);
    };

    const handleIdPhoto = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("idPhoto", file);
        fd.append("userId", user.userId);
        await api.post("/uploads/id-photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
        const { data } = await api.get(`/users/${user.userId}`);
        setProfile(data);
    };

    if (loading) return <div className="spinner" />;

    const verifyStatus = profile?.idVerificationStatus || "not_submitted";

    return (
        <div style={s.page} className="fade-in">
            <h1 style={s.title}>{t("myProfile")}</h1>

            {/* Profile card */}
            <div style={s.card}>
                <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16 }}>
                    <label style={s.avatar} title="לחץ לשינוי תמונה">
                        {profile?.profileImage
                            ? <img src={`http://localhost:5000${profile.profileImage}`} alt="תמונת פרופיל" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                            <span style={s.verifyBadge(verifyStatus)}>
                                {VERIFY_ICONS[verifyStatus]} {VERIFY_LABELS[verifyStatus]}
                            </span>
                        </div>
                    </div>
                </div>

                {profile?.loyaltyPoints > 0 && (
                    <div style={{ background: "#fef3c7", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 12 }}>
                        ✨ {profile.loyaltyPoints} {t("loyaltyPoints")}
                    </div>
                )}

                {profile?.referralCode && (
                    <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>🎁 {t("referralCode")}</div>
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
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>✏️ {t("editProfile")}</div>
                <form onSubmit={handleSave}>
                    <div style={s.group}>
                        <label style={s.label}>{t("fullName")}</label>
                        <input value={form.fullName || ""}
                            onChange={e => set("fullName", e.target.value)} />
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>{t("phone")}</label>
                            <input value={form.phone || ""}
                                onChange={e => set("phone", e.target.value)} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>{t("language")}</label>
                            <select value={form.preferredLanguage || "he"}
                                onChange={e => set("preferredLanguage", e.target.value)}>
                                <option value="he">{t("hebrew")}</option>
                                <option value="en">{t("english")}</option>
                            </select>
                        </div>
                    </div>
                    {error && <p className="error-msg">⚠️ {error}</p>}
                    <button type="submit" className="btn-primary" disabled={saving} style={{ width: "auto" }}>
                        {saved ? "✓ נשמר!" : t("save")}
                    </button>
                </form>
            </div>

            {/* ID verification */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🪪 {t("uploadIdPhoto")}</div>
                {profile?.idPhotoPath ? (
                    <div>
                        <img src={`http://localhost:5000${profile.idPhotoPath}`} alt="תעודת זהות"
                            style={{ maxHeight: 140, borderRadius: 8, objectFit: "cover", marginBottom: 10 }} />
                        <div style={s.verifyBadge(verifyStatus)}>
                            {VERIFY_ICONS[verifyStatus]} {VERIFY_LABELS[verifyStatus]}
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
                                {i === 0 ? "סיסמה נוכחית" : i === 1 ? t("newPassword") : "אימות סיסמה חדשה"}
                            </label>
                            <input
                                type={showPw ? "text" : "password"}
                                value={pwForm[field]}
                                onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                                autoComplete={i === 0 ? "current-password" : "new-password"}
                            />
                        </div>
                    ))}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
                        הצג סיסמאות
                    </label>
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
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("switchToDriver")}</div>
                    <button style={{ background: "var(--success)", color: "#fff", padding: "10px 24px", borderRadius: 10 }}
                        onClick={() => navigate("/driver-setup")}>
                        {t("driverSetup")} →
                    </button>
                </div>
            )}
        </div>
    );
}
