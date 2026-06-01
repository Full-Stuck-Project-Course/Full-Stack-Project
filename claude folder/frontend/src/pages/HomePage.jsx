// src/pages/HomePage.jsx

import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const s = {
    page: { padding: "40px 32px", maxWidth: 900, margin: "0 auto" },
    welcome: { fontSize: 28, fontWeight: 700, marginBottom: 6 },
    sub: { color: "#666", marginBottom: 36, fontSize: 16 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 },
    card: {
        background: "#fff", borderRadius: 14, padding: "28px 24px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)", cursor: "pointer",
        transition: "transform 0.15s, box-shadow 0.15s",
        textAlign: "center"
    },
    icon: { fontSize: 40, marginBottom: 12 },
    cardTitle: { fontWeight: 700, fontSize: 17, marginBottom: 6 },
    cardDesc: { color: "#888", fontSize: 13 }
};

const actions = [
    { icon: "🚕", title: "הזמן נסיעה", desc: "הזמן נסיעה מהירה לכל יעד", path: "/book" },
    { icon: "🤝", title: "שיתוף נסיעה", desc: "מצא נוסעים לאותו כיוון", path: "/book?type=carpool" },
    { icon: "📦", title: "משלוח", desc: "שלח חבילה בקלות", path: "/book?type=delivery" },
    { icon: "📋", title: "היסטוריה", desc: "כל הנסיעות שלך", path: "/history" },
];

export default function HomePage() {
    const { user } = useAuth();
    const navigate = useNavigate();

    return (
        <div style={s.page}>
            <h1 style={s.welcome}>שלום 👋</h1>
            <p style={s.sub}>לאן תרצה לנסוע היום?</p>

            <div style={s.grid}>
                {actions.map(a => (
                    <div key={a.path} style={s.card}
                        onClick={() => navigate(a.path)}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = "translateY(-4px)";
                            e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = "";
                            e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)";
                        }}>
                        <div style={s.icon}>{a.icon}</div>
                        <div style={s.cardTitle}>{a.title}</div>
                        <div style={s.cardDesc}>{a.desc}</div>
                    </div>
                ))}

                {(user?.role === "driver" || user?.role === "both") && (
                    <div style={{ ...s.card, background: "#4f46e5", color: "#fff" }}
                        onClick={() => navigate("/driver")}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = ""; }}>
                        <div style={s.icon}>🚗</div>
                        <div style={s.cardTitle}>לוח נהג</div>
                        <div style={{ ...s.cardDesc, color: "rgba(255,255,255,0.8)" }}>נהל את הנסיעות שלך</div>
                    </div>
                )}
            </div>
        </div>
    );
}
