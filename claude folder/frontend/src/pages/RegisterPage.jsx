// src/pages/RegisterPage.jsx

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f6fa" },
    card: { background: "#fff", borderRadius: 16, padding: "40px 36px", width: 440, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
    sub: { color: "#888", marginBottom: 24, fontSize: 14 },
    label: { display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 },
    group: { marginBottom: 16 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    btn: { width: "100%", background: "#4f46e5", color: "#fff", padding: "12px", borderRadius: 8, fontSize: 16, marginTop: 8 },
    footer: { textAlign: "center", marginTop: 18, fontSize: 14, color: "#666" },
    link: { color: "#4f46e5", fontWeight: 600 }
};

export default function RegisterPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        fullName: "", email: "", password: "", phone: "", role: "passenger", preferredLanguage: "he"
    });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await api.post("/users/register", form);
            navigate("/login");
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בהרשמה");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.page}>
            <div style={s.card}>
                <h1 style={s.title}>הרשמה</h1>
                <p style={s.sub}>צור חשבון חדש</p>
                <form onSubmit={handleSubmit}>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>שם מלא</label>
                            <input placeholder="ישראל ישראלי" value={form.fullName}
                                onChange={e => set("fullName", e.target.value)} required />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>טלפון</label>
                            <input placeholder="050-0000000" value={form.phone}
                                onChange={e => set("phone", e.target.value)} required />
                        </div>
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>אימייל</label>
                        <input type="email" placeholder="you@example.com" value={form.email}
                            onChange={e => set("email", e.target.value)} required />
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>סיסמה</label>
                        <input type="password" placeholder="לפחות 6 תווים" value={form.password}
                            onChange={e => set("password", e.target.value)} required />
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>תפקיד</label>
                            <select value={form.role} onChange={e => set("role", e.target.value)}>
                                <option value="passenger">נוסע</option>
                                <option value="driver">נהג</option>
                                <option value="both">נהג ונוסע</option>
                            </select>
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>שפה</label>
                            <select value={form.preferredLanguage} onChange={e => set("preferredLanguage", e.target.value)}>
                                <option value="he">עברית</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                    </div>
                    {error && <p className="error-msg">{error}</p>}
                    <button type="submit" style={s.btn} disabled={loading}>
                        {loading ? "נרשם..." : "הירשם"}
                    </button>
                </form>
                <p style={s.footer}>
                    יש לך חשבון? <Link to="/login" style={s.link}>התחבר</Link>
                </p>
            </div>
        </div>
    );
}
