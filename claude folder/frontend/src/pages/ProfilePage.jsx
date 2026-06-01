// src/pages/ProfilePage.jsx

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const s = {
    page: { padding: "40px 32px", maxWidth: 600, margin: "0 auto" },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    card: { background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", marginBottom: 20 },
    avatar: {
        width: 80, height: 80, borderRadius: "50%",
        background: "#4f46e5", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 32, color: "#fff",
        marginBottom: 16
    },
    label: { display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 },
    group: { marginBottom: 16 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    saveBtn: { background: "#4f46e5", color: "#fff", padding: "10px 28px", borderRadius: 8, fontSize: 15 },
    section: { fontWeight: 700, fontSize: 16, marginBottom: 14 }
};

export default function ProfilePage() {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState({});
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/users/${user.userId}`);
                setProfile(data);
                setForm({ fullName: data.fullName, phone: data.phone, preferredLanguage: data.preferredLanguage });
            } finally { setLoading(false); }
        })();
    }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async (e) => {
        e.preventDefault();
        await api.put(`/users/${user.userId}`, form);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;

    return (
        <div style={s.page}>
            <h1 style={s.title}>הפרופיל שלי</h1>

            <div style={s.card}>
                <div style={s.avatar}>{profile?.fullName?.[0] || "?"}</div>
                <div style={{ fontWeight: 700, fontSize: 20 }}>{profile?.fullName}</div>
                <div style={{ color: "#888", fontSize: 14, marginTop: 4 }}>{profile?.email}</div>
                <div style={{ marginTop: 8 }}>
                    <span style={{
                        background: "#4f46e5" + "18", color: "#4f46e5",
                        padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700
                    }}>
                        {profile?.role === "driver" ? "נהג" : profile?.role === "both" ? "נהג ונוסע" : "נוסע"}
                    </span>
                </div>
            </div>

            <div style={s.card}>
                <div style={s.section}>עריכת פרטים</div>
                <form onSubmit={handleSave}>
                    <div style={s.group}>
                        <label style={s.label}>שם מלא</label>
                        <input value={form.fullName || ""}
                            onChange={e => set("fullName", e.target.value)} />
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>טלפון</label>
                            <input value={form.phone || ""}
                                onChange={e => set("phone", e.target.value)} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>שפה מועדפת</label>
                            <select value={form.preferredLanguage || "he"}
                                onChange={e => set("preferredLanguage", e.target.value)}>
                                <option value="he">עברית</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" style={s.saveBtn}>
                        {saved ? "✓ נשמר!" : "שמור שינויים"}
                    </button>
                </form>
            </div>
        </div>
    );
}
