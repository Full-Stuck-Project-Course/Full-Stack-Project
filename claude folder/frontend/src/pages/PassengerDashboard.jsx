// src/pages/PassengerDashboard.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

const s = {
    page: { padding: "28px 20px", maxWidth: 760, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 },
    stat: { background: "var(--surface)", borderRadius: 12, padding: "18px 16px", textAlign: "center", boxShadow: "var(--shadow)", border: "1px solid var(--border)" },
    statVal: { fontSize: 26, fontWeight: 800, color: "var(--primary)" },
    statLbl: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    rideRow: { padding: "12px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" },
    badgePoints: { background: "linear-gradient(135deg, #fef3c7, #fde68a)", border: "1px solid #f59e0b", borderRadius: 20, padding: "8px 18px", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }
};

export default function PassengerDashboard() {
    const { user }       = useAuth();
    const { t }          = useLang();
    const navigate       = useNavigate();
    const [passenger,    setPassenger]    = useState(null);
    const [upcoming,     setUpcoming]     = useState([]);
    const [pastRides,    setPastRides]    = useState([]);
    const [loading,      setLoading]      = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [passRes, ridesRes] = await Promise.all([
                    api.get("/passengers"),
                    api.get("/rides")
                ]);
                const p = passRes.data.find(p => p.userId === user?.userId || p.userId?._id === user?.userId);
                setPassenger(p);

                const allRides = ridesRes.data || [];
                const now = new Date();
                setUpcoming(allRides.filter(r =>
                    ["searching", "accepted", "driver_arriving", "in_progress"].includes(r.status) ||
                    (r.scheduledTime && new Date(r.scheduledTime) > now)
                ).slice(0, 5));
                setPastRides(allRides.filter(r => r.status === "completed").slice(0, 8));
            } finally { setLoading(false); }
        })();
    }, []);

    const cancelRide = async (rideId) => {
        if (!window.confirm("לבטל את הנסיעה?")) return;
        await api.put(`/rides/${rideId}/cancel`, { cancelledBy: "passenger" });
        setUpcoming(u => u.filter(r => r._id !== rideId));
    };

    if (loading) return <div className="spinner" />;

    return (
        <div style={s.page} className="fade-in">
            <h1 style={s.title}>{"לוח נוסע"}</h1>

            {/* Loyalty points */}
            {passenger && (
                <div style={{ marginBottom: 20 }}>
                    <span style={s.badgePoints}>✨ {passenger.loyaltyPoints || 0} {"נקודות נאמנות"}</span>
                </div>
            )}

            {/* Stats */}
            <div style={s.grid}>
                <div style={s.stat}>
                    <div style={s.statVal}>{passenger?.totalRides || 0}</div>
                    <div style={s.statLbl}>{"נסיעות"}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "#f59e0b" }}>⭐ {passenger?.ratingAverage || "—"}</div>
                    <div style={s.statLbl}>{"דירוג ממוצע"}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "#10b981" }}>₪{passenger?.totalSpent?.toFixed(0) || 0}</div>
                    <div style={s.statLbl}>{"סה״כ הוצאות"}</div>
                </div>
                <div style={s.stat}>
                    <div style={{ ...s.statVal, color: "var(--primary)" }}>{upcoming.length}</div>
                    <div style={s.statLbl}>{"נסיעות עתידיות"}</div>
                </div>
            </div>

            {/* Upcoming rides */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>📅 {"נסיעות עתידיות"}</div>
                {upcoming.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)" }}>
                        {"אין נסיעות להצגה"}
                        <br />
                        <button className="btn-primary" style={{ marginTop: 12, maxWidth: 180 }} onClick={() => navigate("/book")}>
                            {"הזמן נסיעה"}
                        </button>
                    </div>
                ) : upcoming.map(ride => (
                    <div key={ride._id} style={s.rideRow}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                                📍 {ride.pickupLocation?.address} → {ride.destinationLocation?.address}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                                {ride.scheduledTime
                                    ? `🕐 ${new Date(ride.scheduledTime).toLocaleString("he-IL")}`
                                    : ride.status === "searching" ? "🔍 מחפש נהג..." : "בתהליך"}
                                {ride.finalPrice > 0 && ` · ₪${ride.finalPrice}`}
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => navigate(`/ride/${ride._id}`)}
                                style={{ background: "var(--primary)", color: "#fff", padding: "7px 14px", borderRadius: 8, fontSize: 13 }}>
                                פרטים
                            </button>
                            {["searching", "accepted"].includes(ride.status) && (
                                <button onClick={() => cancelRide(ride._id)}
                                    style={{ background: "#fee2e2", color: "var(--danger)", padding: "7px 10px", borderRadius: 8, fontSize: 13 }}>
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Past rides */}
            {pastRides.length > 0 && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>📋 {"נסיעות קודמות"}</div>
                    {pastRides.map(ride => (
                        <div key={ride._id} style={s.rideRow}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                                    {ride.pickupLocation?.address} → {ride.destinationLocation?.address}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                                    {new Date(ride.completedAt || ride.updatedAt).toLocaleDateString("he-IL")}
                                    {ride.finalPrice > 0 && ` · ₪${ride.finalPrice}`}
                                </div>
                            </div>
                            <button onClick={() => navigate(`/rate/${ride._id}`)}
                                style={{ background: "none", color: "#f59e0b", fontSize: 20, padding: 0 }}
                                aria-label="דרג נסיעה">
                                ⭐
                            </button>
                        </div>
                    ))}
                    <button type="button" onClick={() => navigate("/history")}
                        style={{ background: "none", color: "var(--primary)", fontWeight: 600, fontSize: 14, marginTop: 8 }}>
                        {"היסטוריה"} ←
                    </button>
                </div>
            )}

            {/* Saved addresses */}
            {passenger && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📌 כתובות שמורות</div>
                    {(passenger.savedLocations || []).length > 0 ? (
                        <div>
                            {passenger.savedLocations.map((loc, i) => (
                                <div key={i} style={{ padding: "8px 0", borderBottom: i < passenger.savedLocations.length - 1 ? "1px solid var(--border)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{loc.name === "home" ? "🏠 בית" : loc.name === "work" ? "💼 עבודה" : `📍 ${loc.name}`}</div>
                                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{loc.address}</div>
                                    </div>
                                    <button onClick={() => {
                                        api.delete(`/passengers/${passenger._id}/saved-locations/${loc._id}`).then(() => {
                                            setPassenger(p => ({ ...p, savedLocations: p.savedLocations.filter((_, idx) => idx !== i) }));
                                        });
                                    }} style={{ background: "none", color: "var(--danger)", fontSize: 16, padding: 0 }}>✕</button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 10 }}>אין כתובות שמורות עדיין</div>
                    )}
                    <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>הוסף כתובת:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <select id="addr-name" style={{ width: 100 }} defaultValue="home">
                                <option value="home">🏠 בית</option>
                                <option value="work">💼 עבודה</option>
                                <option value="other">📍 אחר</option>
                            </select>
                            <input id="addr-address" placeholder="כתובת מלאה" style={{ flex: 1 }} />
                            <button onClick={async () => {
                                const name = document.getElementById("addr-name").value;
                                const address = document.getElementById("addr-address").value;
                                if (!address) return;
                                try {
                                    await api.post(`/passengers/${passenger._id}/saved-locations`, { name, address, lat: 0, lng: 0 });
                                    const { data: pData } = await api.get(`/passengers/${passenger._id}`);
                                    setPassenger(pData);
                                    document.getElementById("addr-address").value = "";
                                } catch {}
                            }} style={{ background: "var(--primary)", color: "#fff", padding: "8px 14px", whiteSpace: "nowrap" }}>
                                + הוסף
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preferences */}
            {passenger && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>⚙️ העדפות</div>
                    <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
                        <div>
                            <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 3 }}>העדפת נהג</div>
                            <div style={{ fontWeight: 600 }}>
                                {passenger.preferredDriverGender === "male" ? "זכר" : passenger.preferredDriverGender === "female" ? "נקבה" : "ללא העדפה"}
                            </div>
                        </div>
                        <div>
                            <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 3 }}>שיטת התאמה</div>
                            <div style={{ fontWeight: 600 }}>
                                {passenger.preferredMatching === "closest" ? "📍 הקרוב ביותר" : "⭐ דירוג גבוה"}
                            </div>
                        </div>
                    </div>
                    <button type="button" onClick={() => navigate("/profile")}
                        style={{ background: "none", color: "var(--primary)", fontWeight: 600, fontSize: 14, marginTop: 12 }}>
                        ✏️ ערוך העדפות
                    </button>
                </div>
            )}

            {/* Switch to driver */}
            {(user?.role === "passenger") && (
                <div style={{ ...s.card, textAlign: "center", background: "linear-gradient(135deg, #eef2ff, #fff)" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🚗</div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{"עבור למצב נהג"}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
                        הפוך לנהג והתחל להרוויח עם HailNow
                    </div>
                    <button style={{ background: "var(--primary)", color: "#fff", padding: "10px 24px", borderRadius: 10 }}
                        onClick={() => navigate("/driver-setup")}>
                        {"הגדרת פרופיל נהג"} →
                    </button>
                </div>
            )}
        </div>
    );
}
