import { useEffect, useRef, useState } from "react";
import { useNavigate } from "../routing";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import AutoVerificationOverlay, { waitForAutoVerification } from "../components/AutoVerificationOverlay";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 },
    card: { background: "var(--surface)", borderRadius: 18, padding: "36px 32px", width: "100%", maxWidth: 500, boxShadow: "var(--shadow-lg)" },
    logo: { textAlign: "center", fontSize: 36, marginBottom: 8 },
    title: { fontSize: 24, fontWeight: 800, marginBottom: 4, color: "var(--text)" },
    sub: { color: "var(--text-muted)", marginBottom: 24, fontSize: 14 },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 16 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    roleGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 },
    roleCard: (selected) => ({
        border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 12,
        padding: "14px 10px",
        textAlign: "center",
        cursor: "pointer",
        background: selected ? "rgba(79,70,229,0.06)" : "var(--surface)",
        transition: "border-color 0.2s, background 0.2s"
    }),
    roleIcon: { fontSize: 25, marginBottom: 6 },
    roleLabel: { fontWeight: 800, fontSize: 13 },
    navRow: { display: "flex", gap: 10, marginTop: 22 },
    fileBox: {
        border: "2px dashed var(--border)",
        borderRadius: 12,
        padding: 18,
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 0.2s"
    }
};

const ROLES = [
    { value: "passenger", icon: "🧍", label: "נוסע" },
    { value: "driver", icon: "🚗", label: "נהג" },
    { value: "both", icon: "🔄", label: "גם וגם" }
];

function FieldErr({ msg }) {
    if (!msg) return null;
    return <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>⚠️ {msg}</p>;
}

function isTemporaryGooglePhone(phone) {
    return /^google-/i.test(String(phone || ""));
}

export default function CompleteProfilePage() {
    const { user, updateUser } = useAuth();
    const navigate = useNavigate();
    const phoneCheckSeq = useRef(0);
    const [form, setForm] = useState({
        fullName: user?.fullName || "",
        phone: isTemporaryGooglePhone(user?.phone) ? "" : user?.phone || "",
        role: ["passenger", "driver", "both"].includes(user?.role) ? user.role : "passenger",
        preferredLanguage: user?.preferredLanguage || "he"
    });
    const [errors, setErrors] = useState({});
    const [phoneChecking, setPhoneChecking] = useState(false);
    const [phoneInUse, setPhoneInUse] = useState(false);
    const [idPhotoFile, setIdPhotoFile] = useState(null);
    const [idPhotoPreview, setIdPhotoPreview] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [verification, setVerification] = useState(null);

    useEffect(() => {
        if (!loading && user && !user.needsProfileCompletion) {
            navigate("/", { replace: true });
        }
    }, [loading, navigate, user]);

    useEffect(() => {
        return () => {
            phoneCheckSeq.current += 1;
        };
    }, []);

    const set = (key, value) => {
        setForm(current => ({ ...current, [key]: value }));
        setErrors(current => ({ ...current, [key]: undefined }));

        if (key !== "phone") return;

        const digits = value.replace(/\D/g, "");
        phoneCheckSeq.current += 1;
        const checkId = phoneCheckSeq.current;
        setPhoneInUse(false);

        if (!digits) {
            setPhoneChecking(false);
            return;
        }
        if (!digits.match(/^05\d{0,8}$/)) {
            setPhoneChecking(false);
            setErrors(current => ({ ...current, phone: "מספר טלפון חייב להתחיל ב-05" }));
            return;
        }
        if (digits.length < 10) {
            setPhoneChecking(false);
            setErrors(current => ({ ...current, phone: `חסרות ${10 - digits.length} ספרות` }));
            return;
        }
        if (digits === String(user?.phone || "")) {
            setPhoneChecking(false);
            return;
        }
        if (digits.match(/^05\d{8}$/)) {
            setPhoneChecking(true);
            api.post("/users/check-phone", { phone: digits }, { skipAuthRedirect: true })
                .then(({ data }) => {
                    if (phoneCheckSeq.current !== checkId) return;
                    setPhoneInUse(Boolean(data.exists));
                    if (data.exists) {
                        setErrors(current => ({ ...current, phone: "מספר הטלפון כבר בשימוש" }));
                    }
                })
                .catch(() => {})
                .finally(() => {
                    if (phoneCheckSeq.current === checkId) setPhoneChecking(false);
                });
        }
    };

    const validate = () => {
        const nextErrors = {};
        if (!form.fullName.trim() || form.fullName.trim().length < 2) {
            nextErrors.fullName = "שם מלא חייב להכיל לפחות 2 תווים";
        }
        if (!form.phone.match(/^05\d{8}$/)) {
            nextErrors.phone = "מספר טלפון לא תקין";
        } else if (phoneChecking) {
            nextErrors.phone = "בודקים אם מספר הטלפון פנוי...";
        } else if (phoneInUse) {
            nextErrors.phone = "מספר הטלפון כבר בשימוש";
        }
        if (!form.role) nextErrors.role = "יש לבחור תפקיד";
        if (!["he", "en"].includes(form.preferredLanguage)) {
            nextErrors.preferredLanguage = "יש לבחור שפה";
        }
        if (!idPhotoFile) {
            nextErrors.idPhoto = "\u05D9\u05E9 \u05DC\u05D4\u05E2\u05DC\u05D5\u05EA \u05E6\u05D9\u05DC\u05D5\u05DD \u05EA\u05E2\u05D5\u05D3\u05EA \u05D6\u05D4\u05D5\u05EA";
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleIdPhotoFile = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIdPhotoFile(file);
        setErrors(current => ({ ...current, idPhoto: undefined }));

        const reader = new FileReader();
        reader.onload = (readerEvent) => setIdPhotoPreview(readerEvent.target.result);
        reader.readAsDataURL(file);
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!validate()) return;

        setLoading(true);
        setError("");
        setVerification({
            title: "מאשרים את תעודת הזהות שלך",
            subtitle: "האישור מתבצע מיד אחרי העלאת הצילום.",
            steps: [
                { label: "מעלה תעודת זהות", detail: "הקובץ נשמר באזור פרטי ומאובטח" },
                { label: "בודק איכות תמונה", detail: "מוודא שהצילום ברור וקריא" },
                { label: "מאשר את המסמך", detail: "האישור מיידי — אין המתנה לנציג" }
            ],
            successTitle: "תעודת הזהות אושרה",
            successText: "אפשר להמשיך לשלב הבא."
        });
        const verificationDelay = waitForAutoVerification();
        try {
            const { data } = await api.post(`/users/${user.userId}/complete-profile`, {
                fullName: form.fullName.trim(),
                phone: form.phone,
                role: form.role,
                preferredLanguage: form.preferredLanguage
            });

            const fd = new FormData();
            fd.append("idPhoto", idPhotoFile);
            const { data: uploadData } = await api.post("/uploads/id-photo", fd, {
                headers: { "Content-Type": "multipart/form-data" }
            });

            const { data: refreshedUser } = await api.get(`/users/${user.userId}`);
            updateUser({
                userId: refreshedUser.userId || data.userId,
                role: refreshedUser.role || data.role,
                fullName: refreshedUser.fullName || data.fullName,
                email: refreshedUser.email || data.email,
                phone: refreshedUser.phone || data.phone,
                preferredLanguage: refreshedUser.preferredLanguage || data.preferredLanguage,
                referralCode: refreshedUser.referralCode || data.referralCode,
                loyaltyPoints: refreshedUser.loyaltyPoints ?? data.loyaltyPoints,
                passengerId: refreshedUser.passengerId || data.passengerId,
                driverId: refreshedUser.driverId || data.driverId,
                idPhotoPath: refreshedUser.idPhotoPath || uploadData.url,
                idVerificationStatus: refreshedUser.idVerificationStatus || "approved",
                needsProfileCompletion: refreshedUser.needsProfileCompletion ?? false
            });
            await verificationDelay;
            navigate(form.role === "driver" || form.role === "both" ? "/driver-setup" : "/", { replace: true });
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בשמירת הפרטים");
        } finally {
            setLoading(false);
            setVerification(null);
        }
    };

    const submitLabel = form.role === "driver" || form.role === "both"
        ? "המשך למסמכי נהג"
        : "כניסה לאתר";

    return (
        <div style={s.page}>
            <AutoVerificationOverlay open={Boolean(verification)} {...(verification || {})} />
            <div style={s.card} className="fade-in">
                <div style={s.logo}>🚕</div>
                <h1 style={s.title}>השלמת פרופיל</h1>
                <p style={s.sub}>עוד כמה פרטים ונמשיך.</p>

                <form onSubmit={submit} noValidate>
                    <div style={s.group}>
                        <label style={s.label} htmlFor="complete-full-name">שם מלא *</label>
                        <input
                            id="complete-full-name"
                            value={form.fullName}
                            onChange={event => set("fullName", event.target.value)}
                            style={{ borderColor: errors.fullName ? "var(--danger)" : undefined }}
                            autoComplete="name"
                        />
                        <FieldErr msg={errors.fullName} />
                    </div>

                    <div style={s.group}>
                        <label style={s.label} htmlFor="complete-phone">טלפון *</label>
                        <div style={{ position: "relative" }}>
                            <input
                                id="complete-phone"
                                type="tel"
                                value={form.phone}
                                onChange={event => set("phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
                                inputMode="numeric"
                                maxLength={10}
                                placeholder="0501234567"
                                style={{ borderColor: errors.phone ? "var(--danger)" : undefined, paddingLeft: 36 }}
                                autoComplete="tel"
                            />
                            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>
                                {phoneChecking ? "⏳" : errors.phone ? "❌" : form.phone.match(/^05\d{8}$/) ? "✅" : ""}
                            </span>
                        </div>
                        <FieldErr msg={errors.phone} />
                    </div>

                    <div style={s.group}>
                        <label style={s.label}>תפקיד *</label>
                        <div style={s.roleGrid} role="radiogroup" aria-label="תפקיד">
                            {ROLES.map(role => (
                                <div
                                    key={role.value}
                                    style={s.roleCard(form.role === role.value)}
                                    role="radio"
                                    aria-checked={form.role === role.value}
                                    tabIndex={0}
                                    onClick={() => set("role", role.value)}
                                    onKeyDown={event => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            set("role", role.value);
                                        }
                                    }}>
                                    <div style={s.roleIcon}>{role.icon}</div>
                                    <div style={s.roleLabel}>{role.label}</div>
                                </div>
                            ))}
                        </div>
                        <FieldErr msg={errors.role} />
                    </div>

                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label} htmlFor="complete-language">שפה</label>
                            <select
                                id="complete-language"
                                value={form.preferredLanguage}
                                onChange={event => set("preferredLanguage", event.target.value)}
                                style={{ borderColor: errors.preferredLanguage ? "var(--danger)" : undefined }}>
                                <option value="he">עברית</option>
                                <option value="en">English</option>
                            </select>
                            <FieldErr msg={errors.preferredLanguage} />
                        </div>
                    </div>

                    {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

                    <div style={s.group}>
                        <label style={s.label}>צילום תעודת זהות *</label>
                        <label style={{
                            ...s.fileBox,
                            borderColor: errors.idPhoto ? "var(--danger)" : idPhotoPreview ? "var(--success)" : undefined
                        }}>
                            {idPhotoPreview ? (
                                <img
                                    src={idPhotoPreview}
                                    alt="תעודת זהות"
                                    style={{ maxHeight: 120, borderRadius: 8, objectFit: "cover" }}
                                />
                            ) : (
                                <div>
                                    <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
                                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                                        לחץ להעלאת צילום תעודת זהות
                                    </div>
                                </div>
                            )}
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleIdPhotoFile} />
                        </label>
                        <FieldErr msg={errors.idPhoto} />
                    </div>

                    <div style={s.navRow}>
                        <button type="submit" className="btn-primary" disabled={loading || phoneChecking}>
                            {loading ? "שומר..." : submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
