// src/pages/HomePage.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

const s = {
    page: { padding: "32px 24px", maxWidth: 960, margin: "0 auto" },
    welcome: { fontSize: 28, fontWeight: 800, marginBottom: 4, color: "var(--text)" },
    sub: { color: "var(--text-muted)", marginBottom: 28, fontSize: 15 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginBottom: 32 },
    card: {
        background: "var(--surface)", borderRadius: 16, padding: "26px 20px",
        boxShadow: "var(--shadow)", cursor: "pointer",
        transition: "transform 0.15s, box-shadow 0.15s",
        textAlign: "center", border: "1px solid var(--border)"
    },
    icon: { fontSize: 38, marginBottom: 10 },
    cardTitle: { fontWeight: 700, fontSize: 16, marginBottom: 4 },
    cardDesc: { color: "var(--text-muted)", fontSize: 13 },
    demandBox: {
        background: "var(--surface)", borderRadius: 14, padding: 20,
        boxShadow: "var(--shadow)", border: "1px solid var(--border)",
        marginBottom: 24
    },
    pointsBadge: {
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "linear-gradient(135deg, #fef3c7, #fde68a)",
        border: "1px solid #f59e0b", borderRadius: 20,
        padding: "6px 16px", marginBottom: 20, fontWeight: 700, fontSize: 14
    },
    statsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 },
    stat: { background: "var(--surface)", borderRadius: 12, padding: 16, textAlign: "center", boxShadow: "var(--shadow)" }
};

function hover(el, enter) {
    if (enter) {
        el.style.transform = "translateY(-4px)";
        el.style.boxShadow = "var(--shadow-lg)";
    } else {
        el.style.transform = "";
        el.style.boxShadow = "var(--shadow)";
    }
}

export default function HomePage() {
    const { user }   = useAuth();
    const { t }      = useLang();
    const navigate   = useNavigate();
    const [demand, setDemand] = useState(null);
    const [passenger, setPassenger] = useState(null);

    const isDriver    = user?.role === "driver" || user?.role === "both";
    const isPassenger = user?.role === "passenger" || user?.role === "both";

    const [referralCode, setReferralCode] = useState(user?.referralCode || "");

    useEffect(() => {
        api.get("/maps/demand").then(r => setDemand(r.data)).catch(() => {});
        // Fetch user profile for referral code
        api.get(`/users/${user?.userId}`).then(r => {
            if (r.data.referralCode) setReferralCode(r.data.referralCode);
        }).catch(() => {});
        if (isPassenger) {
            api.get("/passengers").then(r => {
                const p = r.data.find(p => p.userId === user?.userId || p.userId?._id === user?.userId);
                setPassenger(p);
            }).catch(() => {});
        }
    }, []);

    const actions = [
        { icon: "🚕", title: "הזמן נסיעה",     desc: "הזמן נסיעה מהירה לכל יעד",          path: "/book",          color: "var(--primary)" },
        { icon: "🤝", title: "קרפול",       desc: "חסוך כסף עם קרפול",                  path: "/book?type=carpool" },
        { icon: "📋", title: "היסטוריה",       desc: "כל הנסיעות שלך",                     path: "/history" },
        ...(isPassenger ? [{ icon: "⭐", title: "לוח נוסע", desc: "נקודות, נסיעות עתידיות", path: "/passenger" }] : []),
        ...(isDriver    ? [{ icon: "🚗", title: "לוח נהג",   desc: "נהל את הנסיעות שלך",    path: "/driver", featured: true }] : []),
    ];

    return (
        <div style={s.page}>
            {/* Header */}
            <h1 style={s.welcome}>{"שלום"}, {user?.fullName?.split(" ")[0] || "שלום"} 👋</h1>
            <p style={s.sub}>{"לאן תרצה לנסוע היום?"}</p>

            {/* Loyalty points */}
            {passenger?.loyaltyPoints > 0 && (
                <div style={s.pointsBadge} aria-label={`${passenger.loyaltyPoints} נקודות נאמנות`}>
                    ✨ {passenger.loyaltyPoints} {"נקודות נאמנות"}
                </div>
            )}

            {/* Demand alert for drivers */}
            {isDriver && demand && demand.demand === "high" && (
                <div style={{
                    ...s.demandBox,
                    background: "linear-gradient(135deg, #fef3c7, #fff)",
                    borderColor: "#f59e0b"
                }} role="alert">
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#92400e", marginBottom: 4 }}>
                        🔥 {demand.message}
                    </div>
                    <div style={{ fontSize: 13, color: "#b45309" }}>
                        {demand.openRequests} {"בקשות פתוחות"} · מכפיל מחיר: ×{demand.surgeMultiplier}
                    </div>
                </div>
            )}

            {/* Quick stats */}
            {passenger && (
                <div style={s.statsRow}>
                    <div style={s.stat}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>{passenger.totalRides || 0}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{"נסיעות"}</div>
                    </div>
                    <div style={s.stat}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--warning)" }}>⭐ {passenger.ratingAverage || "—"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{"דירוג ממוצע"}</div>
                    </div>
                    <div style={s.stat}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--success)" }}>{passenger.loyaltyPoints || 0}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{"נקודות נאמנות"}</div>
                    </div>
                </div>
            )}

            {/* Action cards */}
            <div style={s.grid}>
                {actions.map(a => (
                    <div key={a.path} style={{
                        ...s.card,
                        ...(a.featured ? { background: "var(--primary)", color: "#fff" } : {})
                    }}
                        onClick={() => navigate(a.path)}
                        onMouseEnter={e => hover(e.currentTarget, true)}
                        onMouseLeave={e => hover(e.currentTarget, false)}
                        role="button" tabIndex={0}
                        onKeyDown={e => e.key === "Enter" && navigate(a.path)}
                        aria-label={a.title}>
                        <div style={s.icon}>{a.icon}</div>
                        <div style={s.cardTitle}>{a.title}</div>
                        <div style={{ ...s.cardDesc, ...(a.featured ? { color: "rgba(255,255,255,0.8)" } : {}) }}>{a.desc}</div>
                    </div>
                ))}
            </div>

            {/* Referral section */}
            <div style={{ ...s.demandBox, background: "linear-gradient(135deg, #f0fdf4, #fff)", borderColor: "var(--success)" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>🎁 {"הפנה חבר"}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                    {"הזמן חברים ל-HailNow וקבל נקודות נאמנות על כל חבר שמצטרף!"}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input readOnly value={referralCode || "טוען..."} style={{ flex: 1, fontWeight: 700, letterSpacing: 2 }} />
                    <button
                        onClick={() => { navigator.clipboard?.writeText(referralCode || ""); alert("קוד הועתק!"); }}
                        style={{ background: "var(--success)", color: "#fff", padding: "10px 16px", whiteSpace: "nowrap" }}>
                        העתק
                    </button>
                </div>
            </div>
        </div>
    );
}
