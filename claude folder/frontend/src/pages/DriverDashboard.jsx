// src/pages/DriverDashboard.jsx

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import MapComponent from "../components/MapComponent";
import { io } from "socket.io-client";

const s = {
    page: { padding: "28px 20px", maxWidth: 860, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 },
    stat: { background: "var(--surface)", borderRadius: 12, padding: "18px 16px", textAlign: "center", boxShadow: "var(--shadow)", border: "1px solid var(--border)" },
    statVal: { fontSize: 26, fontWeight: 800, color: "var(--primary)" },
    statLbl: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    rideReq: { background: "var(--bg)", borderRadius: 10, padding: "14px 16px", marginBottom: 10, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" },
    statusBtn: (a, c) => ({
        padding: "8px 18px", borderRadius: 24, border: "2px solid",
        borderColor: a ? c : "var(--border)",
        background: a ? c : "var(--surface)",
        color: a ? "#fff" : "var(--text-muted)",
        fontWeight: 700, fontSize: 14, cursor: "pointer"
    }),
    alert: { background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: "12px 16px", marginBottom: 10, fontSize: 14 }
};

const STATUS_OPTS = [
    { value: "available", label: "🟢 זמין",       color: "#10b981" },
    { value: "busy",      label: "🟡 עסוק",       color: "#f59e0b" },
    { value: "offline",   label: "🔴 לא מחובר",   color: "#6b7280" }
];

export default function DriverDashboard() {
    const { user }      = useAuth();
    const { t }         = useLang();
    const navigate      = useNavigate();
    const [driver,      setDriver]      = useState(null);
    const [openRides,   setOpenRides]   = useState([]);
    const [alerts,      setAlerts]      = useState([]);
    const [ratings,     setRatings]     = useState([]);
    const [demand,      setDemand]      = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [driverLoc,   setDriverLoc]   = useState(null);
    const socketRef = useRef(null);

    const fetchAll = async () => {
        try {
            const [availRes, ridesRes] = await Promise.all([
                api.get("/drivers"),
                api.get("/rides", { params: { status: "searching" } })
            ]);
            const found = availRes.data.find(d => d.userId?._id === user?.userId || d.userId === user?.userId);
            setDriver(found || null);
            setOpenRides(ridesRes.data || []);

            if (found) {
                const [alertRes, ratingRes] = await Promise.all([
                    api.get(`/driver-alerts/driver/${found._id}`).catch(() => ({ data: [] })),
                    api.get(`/ratings/driver/${found._id}`).catch(() => ({ data: [] }))
                ]);
                setAlerts(alertRes.data || []);
                setRatings(ratingRes.data?.slice(0, 5) || []);
            }

            api.get("/maps/demand").then(r => setDemand(r.data)).catch(() => {});
        } finally { setLoading(false); }
    };

    useEffect(() => {
        fetchAll();
        const poll = setInterval(fetchAll, 15000);

        // Get driver location
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(pos => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setDriverLoc(loc);
                if (driver) {
                    api.put(`/drivers/${driver._id}/location`, { lat: loc.lat, lng: loc.lng }).catch(() => {});
                }
            });
            return () => { clearInterval(poll); navigator.geolocation.clearWatch(watchId); };
        }
        return () => clearInterval(poll);
    }, [driver?._id]);

    useEffect(() => {
        const socket = io("http://localhost:5000");
        socketRef.current = socket;
        if (driver) socket.emit("join-driver", driver._id);
        return () => socket.disconnect();
    }, [driver?._id]);

    const setStatus = async (status) => {
        if (!driver) return;
        await api.put(`/drivers/${driver._id}/status`, { status });
        setDriver(d => ({ ...d, status }));
    };

    const acceptRide = async (rideId) => {
        if (!driver) return;
        try {
            await api.put(`/rides/${rideId}/accept`, { driverId: driver._id });
            navigate(`/ride/${rideId}`);
        } catch (err) {
            alert(err.response?.data?.error || "שגיאה");
        }
    };

    const dismissAlert = async (alertId) => {
        await api.put(`/driver-alerts/${alertId}/read`);
        setAlerts(a => a.filter(x => x._id !== alertId));
    };

    // Sort open rides by proximity to driver
    const sortedRides = driver && driverLoc
        ? [...openRides].sort((a, b) => {
            const distA = a.pickupLocation?.lat ? Math.sqrt((a.pickupLocation.lat - driverLoc.lat) ** 2 + (a.pickupLocation.lng - driverLoc.lng) ** 2) : 999;
            const distB = b.pickupLocation?.lat ? Math.sqrt((b.pickupLocation.lat - driverLoc.lat) ** 2 + (b.pickupLocation.lng - driverLoc.lng) ** 2) : 999;
            return distA - distB;
        })
        : openRides;

    if (loading) return <div className="spinner" />;

    if (!driver) return (
        <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🚗</div>
            <h2 style={{ marginBottom: 12 }}>עדיין לא רשום כנהג</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>השלם את הרשמת הנהג כדי להתחיל לקבל נסיעות.</p>
            <button className="btn-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/driver-setup")}>
                {t("driverSetup")} →
            </button>
        </div>
    );

    return (
        <div style={s.page}>
            <h1 style={s.title}>{t("driverDash")}</h1>

            {/* Demand alert */}
            {demand && (
                <div style={{ ...s.alert, background: demand.demand === "high" ? "#fef3c7" : "#f0fdf4", borderColor: demand.demand === "high" ? "#f59e0b" : "#86efac" }}>
                    {demand.demand === "high" ? "🔥" : "💤"} {demand.message}
                    {demand.surgeMultiplier > 1 && ` · מכפיל מחיר: ×${demand.surgeMultiplier}`}
                </div>
            )}

            {/* Stats */}
            <div style={s.grid}>
                <div style={s.stat}>
                    <div style={s.statVal}>{driver.totalRides}</div>
                    <div style={s.statLbl}>{t("totalRides")}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "#f59e0b" }}>⭐ {driver.ratingAverage?.toFixed(1)}</div>
                    <div style={s.statLbl}>{t("avgRating")}</div>
                </div>
                <div style={{ ...s.stat }}>
                    <div style={{ ...s.statVal, color: "#10b981" }}>₪{driver.totalEarnings?.toFixed(0)}</div>
                    <div style={s.statLbl}>{t("earnings")}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "#ef4444" }}>₪{driver.totalFines || 0}</div>
                    <div style={s.statLbl}>קנסות</div>
                </div>
                <div style={s.stat}>
                    <div style={s.statVal}>{openRides.length}</div>
                    <div style={s.statLbl}>{t("openRequests")}</div>
                </div>
            </div>

            {/* Status */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>סטטוס זמינות</div>
                <div style={{ display: "flex", gap: 8 }}>
                    {STATUS_OPTS.map(opt => (
                        <button key={opt.value}
                            style={s.statusBtn(driver.status === opt.value, opt.color)}
                            onClick={() => setStatus(opt.value)}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Driver alerts */}
            {alerts.filter(a => !a.isRead).length > 0 && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>🔔 התראות ({alerts.filter(a => !a.isRead).length})</div>
                    {alerts.filter(a => !a.isRead).map(alert => (
                        <div key={alert._id} style={{ ...s.alert, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{alert.title}</div>
                                <div style={{ fontSize: 13, color: "#92400e" }}>{alert.message}</div>
                            </div>
                            <button type="button" onClick={() => dismissAlert(alert._id)}
                                style={{ background: "none", padding: 0, fontSize: 18, color: "#92400e" }}>✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Open ride requests */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>
                    🔔 בקשות נסיעה ({sortedRides.length})
                </div>

                {sortedRides.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)" }}>
                        אין בקשות כרגע
                    </div>
                ) : sortedRides.map(ride => (
                    <div key={ride._id} style={s.rideReq}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                                📍 {ride.pickupLocation?.address}
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
                                🏁 {ride.destinationLocation?.address}
                            </div>
                            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)" }}>
                                <span>👥 {ride.passengerCount} נוסעים</span>
                                <span>{ride.rideType === "carpool" ? "🤝 קרפול" : "🚕 נסיעה"}</span>
                                {ride.finalPrice > 0 && <span style={{ fontWeight: 700, color: "var(--success)" }}>₪{ride.finalPrice}</span>}
                                {ride.scheduledTime && <span>🕐 {new Date(ride.scheduledTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>}
                            </div>
                        </div>
                        {driver.status === "available" && (
                            <button
                                onClick={() => acceptRide(ride._id)}
                                style={{ background: "var(--success)", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                                {t("acceptRide")} ✓
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Location map */}
            {driverLoc && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>📍 המיקום שלך</div>
                    <MapComponent
                        center={driverLoc}
                        zoom={14}
                        height={220}
                        driverMarker={driverLoc}
                        markers={sortedRides.filter(r => r.pickupLocation?.lat).map(r => ({
                            lat: r.pickupLocation.lat,
                            lng: r.pickupLocation.lng,
                            label: r.pickupLocation.address
                        }))}
                    />
                </div>
            )}

            {/* Recent ratings */}
            {ratings.length > 0 && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>⭐ דירוגים אחרונים</div>
                    {ratings.map((r, i) => (
                        <div key={r._id || i} style={{ padding: "10px 0", borderBottom: i < ratings.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                                {[1,2,3,4,5].map(n => (
                                    <span key={n} style={{ color: n <= r.rating ? "#f59e0b" : "#e2e8f0", fontSize: 16 }}>★</span>
                                ))}
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(r.createdAt).toLocaleDateString("he-IL")}</span>
                            </div>
                            {r.comment && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>"{r.comment}"</div>}
                        </div>
                    ))}
                </div>
            )}

            <button type="button" onClick={() => navigate("/driver-setup")}
                style={{ background: "none", color: "var(--primary)", fontWeight: 600, fontSize: 14, padding: 0, marginTop: 8 }}>
                ⚙️ עריכת פרופיל נהג
            </button>
        </div>
    );
}
