// src/pages/LoginPage.jsx

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const s = {
    page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f6fa" },
    card: { background: "#fff", borderRadius: 16, padding: "40px 36px", width: 400, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" },
    title: { fontSize: 26, fontWeight: 700, marginBottom: 6, color: "#1a1a2e" },
    sub: { color: "#888", marginBottom: 28, fontSize: 14 },
    label: { display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 },
    group: { marginBottom: 18 },
    btn: { width: "100%", background: "#4f46e5", color: "#fff", padding: "12px", borderRadius: 8, fontSize: 16, marginTop: 4 },
    footer: { textAlign: "center", marginTop: 20, fontSize: 14, color: "#666" },
    link: { color: "#4f46e5", fontWeight: 600 }
};

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: "", password: "" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const { data } = await api.post("/users/login", form);
            login({ userId: data.userId, role: data.role }, data.token);
            navigate("/");
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בהתחברות");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.page}>
            <div style={s.card}>
                <div style={{ textAlign: "center", fontSize: 40, marginBottom: 12 }}>🚗</div>
                <h1 style={s.title}>ברוך הבא</h1>
                <p style={s.sub}>היכנס לחשבון שלך</p>
                <form onSubmit={handleSubmit}>
                    <div style={s.group}>
                        <label style={s.label}>אימייל</label>
                        <input type="email" placeholder="you@example.com"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })} required />
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>סיסמה</label>
                        <input type="password" placeholder="••••••••"
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })} required />
                    </div>
                    {error && <p className="error-msg">{error}</p>}
                    <button type="submit" style={s.btn} disabled={loading}>
                        {loading ? "מתחבר..." : "התחבר"}
                    </button>
                </form>
                <p style={s.footer}>
                    אין לך חשבון? <Link to="/register" style={s.link}>הירשם כאן</Link>
                </p>
            </div>
        </div>
    );
}
