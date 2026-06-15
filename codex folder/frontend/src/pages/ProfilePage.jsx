import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export default function ProfilePage() {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({});
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data } = await api.get(`/users/${user.userId}`);
                if (!active) return;
                setProfile(data);
                setForm({
                    fullName: data.fullName || "",
                    phone: data.phone || "",
                    preferredLanguage: data.preferredLanguage || "he",
                    profileImage: data.profileImage || "",
                    idDocumentImage: data.idDocumentImage || "",
                    supportLanguage: data.preferredLanguage || "he",
                    preferredDriverGender: data.preferredDriverGender || "any",
                    preferredMatching: data.preferredMatching || "closest"
                });
            } catch {
                setNotice("מצב דמו: הפרופיל נטען מהאחסון המקומי.");
                setProfile(user);
                setForm({
                    fullName: user.fullName || "",
                    phone: user.phone || "",
                    preferredLanguage: user.preferredLanguage || "he",
                    supportLanguage: "he",
                    preferredDriverGender: "any",
                    preferredMatching: "closest"
                });
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [user]);

    const set = (k, v) => setForm(current => ({ ...current, [k]: v }));
    const fileName = (event) => event.target.files?.[0]?.name || "";

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const { data } = await api.put(`/users/${user.userId}`, form);
            const nextUser = data.user || { ...user, ...form };
            login(nextUser, localStorage.getItem("token"));
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch {
            setNotice("השינויים נשמרו מקומית בלבד.");
            login({ ...user, ...form }, localStorage.getItem("token"));
            setSaved(true);
        }
    };

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;

    const roleLabel = profile?.role === "driver" ? "נהג" : profile?.role === "both" ? "נהג ונוסע" : "נוסע";
    const canDrive = profile?.role === "driver" || profile?.role === "both";

    return (
        <main className="page page-narrow" dir="rtl">
            <section className="panel">
                <div className="row between wrap" style={{ marginBottom: 20 }}>
                    <div className="row">
                        <div className="brand-mark">{profile?.fullName?.[0] || "HN"}</div>
                        <div>
                            <h1>הפרופיל שלי</h1>
                            <p className="muted">{profile?.email || user.email}</p>
                        </div>
                    </div>
                    <span className="pill">{roleLabel}</span>
                </div>

                {notice && <p className="pill" style={{ marginBottom: 16 }}>{notice}</p>}

                <form onSubmit={handleSave} className="stack">
                    <div className="grid two">
                        <div>
                            <label htmlFor="fullName">שם מלא</label>
                            <input id="fullName" value={form.fullName || ""} onChange={e => set("fullName", e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="phone">טלפון</label>
                            <input id="phone" value={form.phone || ""} onChange={e => set("phone", e.target.value)} />
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="preferredLanguage">שפת האפליקציה</label>
                            <select id="preferredLanguage" value={form.preferredLanguage || "he"} onChange={e => set("preferredLanguage", e.target.value)}>
                                <option value="he">עברית</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="supportLanguage">שפת תמיכה טכנית</label>
                            <select id="supportLanguage" value={form.supportLanguage || "he"} onChange={e => set("supportLanguage", e.target.value)}>
                                <option value="he">תמיכה בעברית</option>
                                <option value="en">Support in English</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="profileImage">תמונת פרופיל</label>
                            <input id="profileImage" type="file" accept="image/*" onChange={e => set("profileImage", fileName(e))} />
                            {form.profileImage && <p className="muted">{form.profileImage}</p>}
                        </div>
                        <div>
                            <label htmlFor="idDocumentImage">צילום תעודת זהות</label>
                            <input id="idDocumentImage" type="file" accept="image/*,.pdf" onChange={e => set("idDocumentImage", fileName(e))} />
                            {form.idDocumentImage && <p className="muted">{form.idDocumentImage}</p>}
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="preferredMatching">העדפת התאמה</label>
                            <select id="preferredMatching" value={form.preferredMatching || "closest"} onChange={e => set("preferredMatching", e.target.value)}>
                                <option value="closest">נהג קרוב</option>
                                <option value="highest_rated">נהג עם דירוג גבוה</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="preferredDriverGender">העדפת נהג/ת</label>
                            <select id="preferredDriverGender" value={form.preferredDriverGender || "any"} onChange={e => set("preferredDriverGender", e.target.value)}>
                                <option value="any">אין העדפה</option>
                                <option value="female">אישה</option>
                                <option value="male">גבר</option>
                            </select>
                        </div>
                    </div>

                    <button type="submit" className="primary-btn">
                        {saved ? "נשמר" : "שמירת שינויים"}
                    </button>
                </form>
            </section>

            <section className="panel" style={{ marginTop: 20 }}>
                <h2 className="section-title">מצב משתמש</h2>
                <div className="grid two">
                    <div className="panel compact" style={{ boxShadow: "none" }}>
                        <strong>נוסע</strong>
                        <p className="muted">נסיעות, קרפול, נקודות, תלונות ודירוג נהגים</p>
                    </div>
                    <div className="panel compact" style={{ boxShadow: "none" }}>
                        <strong>נהג</strong>
                        <p className="muted">רישיון נהיגה, רכב, שפות, תחביבים ודירוגים</p>
                    </div>
                </div>

                <button
                    className={canDrive ? "secondary-btn" : "primary-btn"}
                    style={{ marginTop: 16 }}
                    onClick={() => navigate(canDrive ? "/driver" : "/driver/onboarding")}
                >
                    {canDrive ? "מעבר ללוח נהג" : "השלמת פרטים כדי להפוך לנהג"}
                </button>
            </section>
        </main>
    );
}
