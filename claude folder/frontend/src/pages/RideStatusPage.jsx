// src/pages/RideStatusPage.jsx

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";

const STATUS_LABELS = {
    searching:       { label: "מחפש נהג...",      color: "#f59e0b", icon: "🔍" },
    accepted:        { label: "נהג נמצא!",         color: "#10b981", icon: "✅" },
    driver_arriving: { label: "הנהג בדרך אליך",    color: "#3b82f6", icon: "🚗" },
    in_progress:     { label: "הנסיעה בעיצומה",    color: "#8b5cf6", icon: "🛣️" },
    completed:       { label: "הנסיעה הושלמה",     color: "#10b981", icon: "🏁" },
    cancelled:       { label: "הנסיעה בוטלה",      color: "#ef4444", icon: "❌" }
};

const s = {
    page: { padding: "40px 32px", maxWidth: 600, margin: "0 auto" },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    card: { background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", marginBottom: 16 },
    statusBadge: (color) => ({
        display: "inline-flex", alignItems: "center", gap: 8,
        background: color + "18", color, padding: "10px 18px",
        borderRadius: 30, fontWeight: 700, fontSize: 16, marginBottom: 20
    }),
    row: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" },
    label: { color: "#888", fontSize: 14 },
    value: { fontWeight: 600, fontSize: 14 },
    cancelBtn: { width: "100%", background: "#fee2e2", color: "#ef4444", padding: 12, borderRadius: 8, fontSize: 15, marginTop: 8 }
};

export default function RideStatusPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchRide = async () => {
        try {
            const { data } = await api.get(`/rides/${id}`);
            setRide(data);
        } catch { navigate("/"); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchRide();
        const interval = setInterval(fetchRide, 5000);
        return () => clearInterval(interval);
    }, [id]);

    const cancelRide = async () => {
        if (!window.confirm("האם לבטל את הנסיעה?")) return;
        await api.put(`/rides/${id}/cancel`, { cancelledBy: "passenger" });
        fetchRide();
    };

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;
    if (!ride) return null;

    const st = STATUS_LABELS[ride.status] || STATUS_LABELS.searching;

    return (
        <div style={s.page}>
            <h1 style={s.title}>סטטוס נסיעה</h1>

            <div style={s.card}>
                <div style={s.statusBadge(st.color)}>
                    <span>{st.icon}</span> {st.label}
                </div>

                {[
                    ["📍 איסוף", ride.pickupLocation?.address],
                    ["🏁 יעד",   ride.destinationLocation?.address],
                    ["סוג נסיעה", ride.rideType === "carpool" ? "קרפול" : ride.rideType === "delivery" ? "משלוח" : "נסיעה"],
                    ["מחיר סופי", ride.finalPrice ? `₪${ride.finalPrice}` : "טרם נקבע"],
                    ["נוסעים",   ride.passengerCount],
                ].map(([label, val]) => (
                    <div key={label} style={s.row}>
                        <span style={s.label}>{label}</span>
                        <span style={s.value}>{val}</span>
                    </div>
                ))}
            </div>

            {ride.driverId && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>🧑‍✈️ פרטי הנהג</div>
                    <div style={s.row}>
                        <span style={s.label}>דירוג</span>
                        <span style={s.value}>⭐ {ride.driverId.ratingAverage || "—"}</span>
                    </div>
                    <div style={s.row}>
                        <span style={s.label}>נסיעות</span>
                        <span style={s.value}>{ride.driverId.totalRides || 0}</span>
                    </div>
                </div>
            )}

            {["searching", "accepted", "driver_arriving"].includes(ride.status) && (
                <button style={s.cancelBtn} onClick={cancelRide}>ביטול נסיעה</button>
            )}

            {ride.status === "completed" && (
                <button style={{ width: "100%", background: "#4f46e5", color: "#fff", padding: 12, borderRadius: 8, fontSize: 15 }}
                    onClick={() => navigate("/history")}>
                    לדירוג הנסיעה ←
                </button>
            )}
        </div>
    );
}
