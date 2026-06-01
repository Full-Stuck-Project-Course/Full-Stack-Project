// src/pages/DriverDashboard.jsx

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const s = {
    page: { padding: "40px 32px", maxWidth: 800, margin: "0 auto" },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 28 },
    statCard: { background: "#fff", borderRadius: 12, padding: "20px 16px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
    statVal: { fontSize: 28, fontWeight: 800, color: "#4f46e5" },
    statLabel: { fontSize: 13, color: "#888", marginTop: 4 },
    section: { fontWeight: 700, fontSize: 17, marginBottom: 12, marginTop: 24 },
    card: { background: "#fff", borderRadius: 12, padding: "18px 22px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 12 },
    statusRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    statusBtns: { display: "flex", gap: 8, marginTop: 16 },
    statusBtn: (active, color) => ({
        padding: "8px 18px", borderRadius: 8, border: "2px solid",
        borderColor: active ? color : "#dde1ea",
        background: active ? color : "#fff",
        color: active ? "#fff" : "#666",
        fontWeight: 600, fontSize: 14, cursor: "pointer"
    }),
    rideCard: { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 12 },
    acceptBtn: { background: "#10b981", color: "#fff", padding: "10px 22px", borderRadius: 8, fontSize: 14, fontWeight: 700 }
};

const STATUS_OPTIONS = [
    { value: "available", label: "🟢 זמין", color: "#10b981" },
    { value: "busy",      label: "🟡 עסוק", color: "#f59e0b" },
    { value: "offline",   label: "🔴 לא מחובר", color: "#6b7280" }
];

export default function DriverDashboard() {
    const { user } = useAuth();
    const [driver, setDriver] = useState(null);
    const [openRides, setOpenRides] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [driverRes, ridesRes] = await Promise.all([
                api.get("/drivers/available"),
                api.get("/rides", { params: { status: "searching" } })
            ]);
            setOpenRides(ridesRes.data);
            setDriver(driverRes.data.find(d => d.userId?._id === user.userId) || null);
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const setStatus = async (status) => {
        if (!driver) return;
        await api.put(`/drivers/${driver._id}/status`, { status });
        setDriver(d => ({ ...d, status }));
    };

    const acceptRide = async (rideId) => {
        if (!driver) return;
        await api.put(`/rides/${rideId}/accept`, { driverId: driver._id });
        fetchData();
    };

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;

    return (
        <div style={s.page}>
            <h1 style={s.title}>לוח בקרה — נהג</h1>

            {driver && (
                <div style={s.grid}>
                    <div style={s.statCard}>
                        <div style={s.statVal}>{driver.totalRides}</div>
                        <div style={s.statLabel}>נסיעות סה"כ</div>
                    </div>
                    <div style={s.statCard}>
                        <div style={s.statVal}>⭐ {driver.ratingAverage}</div>
                        <div style={s.statLabel}>דירוג ממוצע</div>
                    </div>
                    <div style={s.statCard}>
                        <div style={s.statVal}>₪{driver.totalEarnings}</div>
                        <div style={s.statLabel}>הכנסות</div>
                    </div>
                    <div style={s.statCard}>
                        <div style={s.statVal}>{openRides.length}</div>
                        <div style={s.statLabel}>בקשות פתוחות</div>
                    </div>
                </div>
            )}

            <div style={s.card}>
                <div style={s.statusRow}>
                    <span style={{ fontWeight: 700 }}>סטטוס זמינות</span>
                    <span style={{ fontSize: 13, color: "#888" }}>מתעדכן בזמן אמת</span>
                </div>
                <div style={s.statusBtns}>
                    {STATUS_OPTIONS.map(opt => (
                        <button key={opt.value}
                            style={s.statusBtn(driver?.status === opt.value, opt.color)}
                            onClick={() => setStatus(opt.value)}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={s.section}>🔔 בקשות נסיעה פתוחות ({openRides.length})</div>

            {openRides.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "#aaa" }}>אין בקשות כרגע</div>
            ) : openRides.map(ride => (
                <div key={ride._id} style={s.rideCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                                {ride.pickupLocation?.address} → {ride.destinationLocation?.address}
                            </div>
                            <div style={{ fontSize: 13, color: "#888" }}>
                                👥 {ride.passengerCount} נוסעים &nbsp;·&nbsp;
                                {ride.rideType === "carpool" ? "🤝 קרפול" : "🚕 נסיעה"}
                                {ride.scheduledTime && ` · 🕐 ${new Date(ride.scheduledTime).toLocaleString("he-IL")}`}
                            </div>
                        </div>
                        {driver?.status === "available" && (
                            <button style={s.acceptBtn} onClick={() => acceptRide(ride._id)}>
                                קבל נסיעה ✓
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
