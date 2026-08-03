// src/pages/DriverDashboard.jsx

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "../routing";
import api from "../api/axios";
import MapComponent from "../components/MapComponent";
import { createSocket } from "../api/socket";

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
    alert: { background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: "12px 16px", marginBottom: 10, fontSize: 14 },
    popup: {
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        background: "var(--surface)", borderRadius: 16, padding: "18px 22px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.2)", border: "2px solid var(--primary)",
        zIndex: 500, minWidth: 320, maxWidth: 420, animation: "fadeIn 0.3s ease"
    }
};

export default function DriverDashboard() {
    const { user }      = useAuth();
    const userId        = user?.userId;

    const STATUS_OPTS = [
        { value: "available", label: "🟢 זמין",     color: "#10b981" },
        { value: "busy",      label: "🟡 עסוק",     color: "#f59e0b" },
        { value: "offline",   label: "🔴 לא מחובר", color: "#6b7280" }
    ];
    const navigate      = useNavigate();
    const [driver,      setDriver]      = useState(null);
    const [openRides,   setOpenRides]   = useState([]);
    const [alerts,      setAlerts]      = useState([]);
    const [ratings,     setRatings]     = useState([]);
    const [demand,      setDemand]      = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [driverLoc,   setDriverLoc]   = useState(null);
    const [popup,       setPopup]       = useState(null);
    const [vehicle,     setVehicle]     = useState(null);
    const [statusError, setStatusError] = useState("");
    const [statusSaving, setStatusSaving] = useState(false);
    const socketRef = useRef(null);
    const driverId = driver?._id;

    const fetchAll = useCallback(async () => {
        try {
            const [availRes, ridesRes] = await Promise.all([
                api.get("/drivers"),
                api.get("/rides", { params: { status: "searching" } })
            ]);
            const found = availRes.data.find(d => d.userId?._id === userId || d.userId === userId);
            setDriver(found || null);
            setOpenRides(ridesRes.data || []);

            if (found) {
                api.get(`/vehicles/driver/${found._id}`).then(r => {
                    if (r.data?.length > 0) setVehicle(r.data[0]);
                }).catch(() => {});
                const [alertRes, ratingRes] = await Promise.all([
                    api.get(`/driver-alerts/driver/${found._id}`).catch(() => ({ data: [] })),
                    api.get(`/ratings/driver/${found._id}`).catch(() => ({ data: [] }))
                ]);
                setAlerts(alertRes.data || []);
                setRatings(ratingRes.data?.slice(0, 5) || []);
            }

            api.get("/maps/demand").then(r => setDemand(r.data)).catch(() => {});
        } finally { setLoading(false); }
    }, [userId]);

    useEffect(() => {
        fetchAll();
        const poll = setInterval(fetchAll, 15000);

        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(pos => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setDriverLoc(loc);
            });
            return () => { clearInterval(poll); navigator.geolocation.clearWatch(watchId); };
        }
        return () => clearInterval(poll);
    }, [fetchAll]);

    // Update driver location on server
    useEffect(() => {
        if (driverId && driverLoc) {
            api.put(`/drivers/${driverId}/location`, { lat: driverLoc.lat, lng: driverLoc.lng }).catch(() => {});
        }
    }, [driverLoc, driverId]);

    // Socket.io for real-time ride request popups
    useEffect(() => {
        const socket = createSocket();
        socketRef.current = socket;
        if (driverId) socket.emit("join-driver", driverId);

        socket.on("nearby-ride-request", (data) => {
            setPopup(data);
            setTimeout(() => setPopup(null), 15000);
        });

        return () => socket.disconnect();
    }, [driverId]);

    const setStatus = async (status) => {
        if (!driver) return;
        if (status === "available" && !driver.isVerified) {
            setStatusError("אי אפשר לעבור לזמין לפני השלמת אימות המסמכים.");
            return;
        }

        try {
            setStatusError("");
            setStatusSaving(true);
            await api.put(`/drivers/${driver._id}/status`, { status });
            setDriver(d => ({ ...d, status }));
        } catch (err) {
            const serverMessage = err.response?.data?.error;
            setStatusError(
                serverMessage === "Driver must be verified before becoming available"
                    ? "אי אפשר לעבור לזמין לפני השלמת אימות המסמכים."
                    : serverMessage || "לא ניתן לעדכן סטטוס כרגע."
            );
        } finally {
            setStatusSaving(false);
        }
    };

    const acceptRide = async (rideId) => {
        if (!driver) return;
        try {
            await api.put(`/rides/${rideId}/accept`, { vehicleId: vehicle?._id || null });
            setPopup(null);
            navigate(`/ride/${rideId}`);
        } catch (err) {
            alert(err.response?.data?.error || "שגיאה");
        }
    };

    const dismissAlert = async (alertId) => {
        await api.put(`/driver-alerts/${alertId}/read`);
        setAlerts(a => a.filter(x => x._id !== alertId));
    };

    const sortedRides = driver && driverLoc
        ? [...openRides].sort((a, b) => {
            const distA = a.pickupLocation?.lat ? Math.sqrt((a.pickupLocation.lat - driverLoc.lat) ** 2 + (a.pickupLocation.lng - driverLoc.lng) ** 2) : 999;
            const distB = b.pickupLocation?.lat ? Math.sqrt((b.pickupLocation.lat - driverLoc.lat) ** 2 + (b.pickupLocation.lng - driverLoc.lng) ** 2) : 999;
            return distA - distB;
        })
        : openRides;

    // Map markers: all ride requests + demand hotspots
    const requestMarkers = openRides
        .filter(r => r.pickupLocation?.lat)
        .map(r => ({
            lat: r.pickupLocation.lat,
            lng: r.pickupLocation.lng,
            label: `📍 ${r.pickupLocation.address}`,
            rideId: r._id,
            type: "request"
        }));

    // Demand hotspot markers
    const hotspotMarkers = (demand?.hotspots || []).map(h => ({
        lat: h.lat, lng: h.lng,
        label: `🔥 אזור ביקוש (${h.count} בקשות)`,
        type: "hotspot"
    }));

    if (loading) return <div className="spinner" />;

    if (!driver) return (
        <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🚗</div>
            <h2 style={{ marginBottom: 12 }}>עדיין לא רשום כנהג</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>השלם את הרשמת הנהג כדי להתחיל לקבל נסיעות.</p>
            <button className="btn-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/driver-setup")}>
                {"הגדרת פרופיל נהג"} →
            </button>
        </div>
    );

    return (
        <div style={s.page}>
            <h1 style={s.title}>{"לוח נהג"}</h1>

            {/* Demand alert */}
            {demand && (
                <div style={{ ...s.alert, background: demand.demand === "high" ? "#fef3c7" : "#f0fdf4", borderColor: demand.demand === "high" ? "#f59e0b" : "#86efac" }}>
                    {demand.demand === "high" ? "🔥" : "💤"} {demand.message}
                    {demand.surgeMultiplier > 1 && ` · מכפיל מחיר: ×${demand.surgeMultiplier}`}
                    {demand.hotspots?.length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                            📍 אזורים חמים: {demand.hotspots.slice(0, 3).map((h, i) => `(${h.count} בקשות)`).join(" · ")}
                        </div>
                    )}
                </div>
            )}

            {/* Stats */}
            <div style={s.grid}>
                <div style={s.stat}>
                    <div style={s.statVal}>{driver.totalRides}</div>
                    <div style={s.statLbl}>{"נסיעות"}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "#f59e0b" }}>⭐ {driver.ratingAverage?.toFixed(1)}</div>
                    <div style={s.statLbl}>{"דירוג ממוצע"}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "#10b981" }}>₪{driver.totalEarnings?.toFixed(0)}</div>
                    <div style={s.statLbl}>{"הכנסות"}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "#ef4444" }}>₪{driver.totalFines || 0}</div>
                    <div style={s.statLbl}>{"קנסות"}</div>
                </div>
                <div style={s.stat}>
                    <div style={s.statVal}>{openRides.length}</div>
                    <div style={s.statLbl}>{"בקשות פתוחות"}</div>
                </div>
            </div>

            {/* Status */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>{"סטטוס זמינות"}</div>
                {!driver.isVerified && (
                    <div className="error-msg" style={{ marginBottom: 10 }}>
                        פרופיל הנהג עדיין לא מאומת. אפשר להיות עסוק או לא מחובר, אבל אי אפשר להיות זמין לקבלת נסיעות עד השלמת אימות המסמכים.
                    </div>
                )}
                {statusError && <div className="error-msg" style={{ marginBottom: 10 }}>{statusError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                    {STATUS_OPTS.map(opt => {
                        const disabled = statusSaving || (opt.value === "available" && !driver.isVerified);
                        return (
                            <button key={opt.value}
                                disabled={disabled}
                                style={{ ...s.statusBtn(driver.status === opt.value, opt.color), opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                                onClick={() => setStatus(opt.value)}>
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Driver alerts */}
            {alerts.filter(a => !a.isRead).length > 0 && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>🔔 {"התראות"} ({alerts.filter(a => !a.isRead).length})</div>
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
                            <button onClick={() => acceptRide(ride._id)}
                                style={{ background: "var(--success)", color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                                {"קבל נסיעה"} ✓
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Map — driver location + all request locations + demand hotspots */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>
                    🗺️ מפת בקשות וביקוש ({requestMarkers.length} בקשות פתוחות)
                </div>
                <MapComponent
                    center={driverLoc || { lat: 31.7683, lng: 35.2137 }}
                    zoom={13}
                    height={320}
                    driverMarker={driverLoc}
                    markers={[...requestMarkers, ...hotspotMarkers]}
                />
                {demand?.hotspots?.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>
                        🔥 = אזור ביקוש גבוה &nbsp;|&nbsp; 📍 = בקשת נסיעה
                    </div>
                )}
            </div>

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

            {/* Popup for nearby ride requests */}
            {popup && (
                <div style={s.popup} className="fade-in" role="alert">
                    <div style={{ fontWeight: 800, color: "var(--primary)", marginBottom: 8, fontSize: 16 }}>
                        🚨 בקשת נסיעה חדשה!
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>📍 {popup.pickup?.address}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>🏁 {popup.destination?.address}</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                        <span>📏 {popup.distanceFromDriver} ק"מ ממך</span>
                        <span>👥 {popup.passengerCount}</span>
                        {popup.finalPrice > 0 && <span style={{ fontWeight: 700, color: "var(--success)" }}>₪{popup.finalPrice}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => acceptRide(popup.rideId)}
                            style={{ flex: 2, background: "var(--success)", color: "#fff", padding: "10px 18px", borderRadius: 10, fontWeight: 700 }}>
                            {"קבל נסיעה"} ✓
                        </button>
                        <button onClick={() => setPopup(null)}
                            style={{ flex: 1, background: "var(--border)", color: "var(--text-muted)", padding: "10px 14px", borderRadius: 10 }}>
                            דחה
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
