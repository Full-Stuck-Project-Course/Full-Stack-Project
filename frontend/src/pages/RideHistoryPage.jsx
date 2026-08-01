// src/pages/RideHistoryPage.jsx

import { useState, useEffect } from "react";
import { useNavigate } from "../routing";
import { useSelector, useDispatch } from "react-redux";
import { fetchRides, cancelRide as cancelRideThunk } from "../store/ridesSlice";

export default function RideHistoryPage() {
    const STATUS_LABELS = {
        completed:       { label: "הושלמה",      color: "#10b981", icon: "✅" },
        cancelled:       { label: "בוטלה",      color: "#ef4444", icon: "❌" },
        searching:       { label: "מחפש",      color: "#f59e0b", icon: "🔍" },
        accepted:        { label: "אושרה",       color: "#10b981", icon: "✅" },
        driver_arriving: { label: "נהג בדרך", color: "#3b82f6", icon: "🚗" },
        in_progress:     { label: "בנסיעה",     color: "#8b5cf6", icon: "🛣️" }
    };

    const FILTERS = [
        { key: "all",       label: "הכל" },
        { key: "completed", label: "✅ הושלמו" },
        { key: "cancelled", label: "❌ בוטלו" },
        { key: "scheduled", label: "📅 מתוכננות" }
    ];
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { items: rides, loading } = useSelector(state => state.rides);
    const [filter, setFilter] = useState("all");

    const totalSpent = rides.filter(r => r.status === "completed").reduce((sum, r) => sum + (r.finalPrice || 0), 0);

    useEffect(() => {
        dispatch(fetchRides());
    }, [dispatch]);

    const filtered = rides.filter(r => {
        if (filter === "all") return true;
        if (filter === "scheduled") return r.scheduledTime && new Date(r.scheduledTime) > new Date() && r.status === "searching";
        return r.status === filter;
    });

    const cancelRide = async (rideId, e) => {
        e.stopPropagation();
        if (!window.confirm("לבטל את הנסיעה?")) return;
        dispatch(cancelRideThunk({ rideId, cancelledBy: "passenger" }));
    };

    if (loading) return <div className="spinner" />;

    return (
        <div style={{ padding: "28px 20px", maxWidth: 680, margin: "0 auto" }} className="fade-in">
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{"היסטוריה"}</h1>

            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                    { label: "סה״כ נסיעות", val: rides.length,                                                  color: "var(--primary)" },
                    { label: "הושלמו",       val: rides.filter(r => r.status === "completed").length,            color: "var(--success)" },
                    { label: "סה״כ הוצאות",  val: `₪${totalSpent.toFixed(0)}`,                                  color: "var(--warning)" }
                ].map(st => (
                    <div key={st.label} style={{ background: "var(--surface)", borderRadius: 12, padding: "14px 12px", textAlign: "center", boxShadow: "var(--shadow)" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: st.color }}>{st.val}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{st.label}</div>
                    </div>
                ))}
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        style={{
                            padding: "7px 16px", borderRadius: 20, border: "2px solid",
                            borderColor: filter === f.key ? "var(--primary)" : "var(--border)",
                            background: filter === f.key ? "var(--primary)" : "var(--surface)",
                            color: filter === f.key ? "#fff" : "var(--text-muted)",
                            fontWeight: 600, fontSize: 13
                        }}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Ride list */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
                    <div>{"אין נסיעות להצגה"}</div>
                    <button className="btn-primary" style={{ marginTop: 16, maxWidth: 180 }} onClick={() => navigate("/book")}>
                        {"הזמן נסיעה"}
                    </button>
                </div>
            ) : (
                filtered.map(ride => {
                    const st = STATUS_LABELS[ride.status] || STATUS_LABELS.completed;
                    const isActive = ["searching", "accepted", "driver_arriving", "in_progress"].includes(ride.status);
                    return (
                        <div key={ride._id}
                            onClick={() => navigate(`/ride/${ride._id}`)}
                            style={{
                                background: "var(--surface)", borderRadius: 14, padding: 18,
                                boxShadow: "var(--shadow)", marginBottom: 10, cursor: "pointer",
                                border: `1px solid ${isActive ? st.color + "40" : "var(--border)"}`,
                                transition: "box-shadow 0.15s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow-lg)"}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = "var(--shadow)"}
                            role="button" tabIndex={0}
                            onKeyDown={e => e.key === "Enter" && navigate(`/ride/${ride._id}`)}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                                        📍 {ride.pickupLocation?.address} → {ride.destinationLocation?.address}
                                    </div>
                                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
                                        <span>{new Date(ride.createdAt).toLocaleDateString("he-IL")}</span>
                                        <span>👥 {ride.passengerCount}</span>
                                        {ride.finalPrice > 0 && (
                                            <span style={{ fontWeight: 700, color: "var(--primary)" }}>₪{ride.finalPrice}</span>
                                        )}
                                        <span>{ride.rideType === "carpool" ? "🤝 קרפול" : "🚕 נסיעה"}</span>
                                    </div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                                    <span style={{
                                        background: st.color + "18", color: st.color,
                                        padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap"
                                    }}>
                                        {st.icon} {st.label}
                                    </span>
                                    {ride.status === "completed" && (
                                        <button onClick={e => { e.stopPropagation(); navigate(`/rate/${ride._id}`); }}
                                            style={{ background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                                            ⭐ {"דרג"}
                                        </button>
                                    )}
                                    {ride.status === "searching" && (
                                        <button onClick={e => cancelRide(ride._id, e)}
                                            style={{ background: "#fee2e2", color: "var(--danger)", padding: "4px 10px", borderRadius: 8, fontSize: 12 }}>
                                            ✕ {"ביטול"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}
