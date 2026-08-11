// src/pages/HomePage.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "../routing";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { extractItems } from "../api/pagination";

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

const ACTIVE_RIDE_STATUSES = ["searching", "accepted", "driver_arriving", "in_progress"];

const rideStatusText = {
    searching: "מחפש נהג",
    accepted: "אושר",
    driver_arriving: "הנהג בדרך",
    in_progress: "בנסיעה"
};

function rideStatusLabel(ride) {
    if (ride?.rideType === "carpool" && ride?.status === "accepted" && ride?.driverId) {
        return rideStatusText.driver_arriving;
    }
    return rideStatusText[ride?.status] || ride?.status;
}

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
    const userId     = user?.userId;
    const navigate   = useNavigate();
    const [demand, setDemand] = useState(null);
    const [passenger, setPassenger] = useState(null);
    const [activeRides, setActiveRides] = useState([]);

    const isDriver    = user?.role === "driver" || user?.role === "both";
    const isPassenger = user?.role === "passenger" || user?.role === "both";

    const [referralCode, setReferralCode] = useState(user?.referralCode || "");

    useEffect(() => {
        api.get("/maps/demand").then(r => setDemand(r.data)).catch(() => {});
        // Fetch user profile for referral code
        if (userId) api.get(`/users/${userId}`).then(r => {
            if (r.data.referralCode) setReferralCode(r.data.referralCode);
        }).catch(() => {});
        if (isPassenger) {
            api.get("/passengers").then(r => {
                const p = r.data.find(p => p.userId === userId || p.userId?._id === userId);
                setPassenger(p);
            }).catch(() => {});
        }
        if (userId) {
            api.get("/rides", { params: { limit: 20 } }).then(r => {
                setActiveRides(extractItems(r.data)
                    .filter(ride => ACTIVE_RIDE_STATUSES.includes(ride.status))
                    .slice(0, 3));
            }).catch(() => setActiveRides([]));
        }
    }, [isPassenger, userId]);

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

            {activeRides.length > 0 && (
                <div style={{ ...s.demandBox, borderColor: "var(--primary)", background: "linear-gradient(135deg, rgba(79,70,229,0.08), #fff)" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>נסיעה פעילה</div>
                    <div style={{ display: "grid", gap: 10 }}>
                        {activeRides.map(ride => (
                            <div key={ride._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {ride.pickupLocation?.address} → {ride.destinationLocation?.address}
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                                        {rideStatusLabel(ride)}
                                        {ride.finalPrice > 0 && ` · ₪${ride.finalPrice}`}
                                    </div>
                                </div>
                                <button type="button" onClick={() => navigate(`/ride/${ride._id}`)}
                                    style={{ background: "var(--primary)", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                                    חזור לנסיעה
                                </button>
                            </div>
                        ))}
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
                        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--warning)" }}>{passenger.savedLocations?.length || 0}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{"כתובות שמורות"}</div>
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
