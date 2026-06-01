// src/pages/RideHistoryPage.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const STATUS_COLORS = {
    completed: "#10b981", cancelled: "#ef4444", in_progress: "#8b5cf6",
    searching: "#f59e0b", accepted: "#3b82f6", driver_arriving: "#3b82f6"
};

const STATUS_HE = {
    completed: "הושלם", cancelled: "בוטל", in_progress: "בתהליך",
    searching: "מחפש", accepted: "נקבע נהג", driver_arriving: "נהג בדרך"
};

const s = {
    page: { padding: "40px 32px", maxWidth: 700, margin: "0 auto" },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    card: {
        background: "#fff", borderRadius: 12, padding: "18px 22px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 12,
        cursor: "pointer", transition: "box-shadow 0.15s"
    },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    badge: (status) => ({
        background: (STATUS_COLORS[status] || "#888") + "18",
        color: STATUS_COLORS[status] || "#888",
        padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700
    }),
    route: { fontSize: 14, color: "#555", marginBottom: 6 },
    meta: { display: "flex", gap: 20, fontSize: 13, color: "#999" },
    empty: { textAlign: "center", padding: 60, color: "#aaa", fontSize: 16 }
};

export default function RideHistoryPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/rides", {
                    params: { passengerId: user.passengerId || user.userId }
                });
                setRides(data);
            } finally { setLoading(false); }
        })();
    }, []);

    const filtered = filter === "all" ? rides : rides.filter(r => r.status === filter);

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;

    return (
        <div style={s.page}>
            <h1 style={s.title}>היסטוריית נסיעות</h1>

            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {["all", "completed", "cancelled"].map(f => (
                    <button key={f}
                        style={{ padding: "6px 16px", borderRadius: 20, border: "2px solid",
                            borderColor: filter === f ? "#4f46e5" : "#dde1ea",
                            background: filter === f ? "#4f46e5" : "#fff",
                            color: filter === f ? "#fff" : "#666", fontSize: 13, fontWeight: 600 }}
                        onClick={() => setFilter(f)}>
                        {f === "all" ? "הכל" : f === "completed" ? "הושלמו" : "בוטלו"}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div style={s.empty}>אין נסיעות להצגה</div>
            ) : filtered.map(ride => (
                <div key={ride._id} style={s.card}
                    onClick={() => navigate(`/ride/${ride._id}`)}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 18px rgba(0,0,0,0.12)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"}>
                    <div style={s.header}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>
                            {ride.pickupLocation?.address} → {ride.destinationLocation?.address}
                        </span>
                        <span style={s.badge(ride.status)}>{STATUS_HE[ride.status]}</span>
                    </div>
                    <div style={s.meta}>
                        <span>📅 {new Date(ride.createdAt).toLocaleDateString("he-IL")}</span>
                        <span>💰 {ride.finalPrice ? `₪${ride.finalPrice}` : "—"}</span>
                        <span>👥 {ride.passengerCount} נוסעים</span>
                        <span>{ride.rideType === "carpool" ? "🤝 קרפול" : ride.rideType === "delivery" ? "📦 משלוח" : "🚕 נסיעה"}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
