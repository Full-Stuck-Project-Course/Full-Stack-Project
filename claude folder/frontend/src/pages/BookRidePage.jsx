// src/pages/BookRidePage.jsx

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const s = {
    page: { padding: "40px 32px", maxWidth: 600, margin: "0 auto" },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    card: { background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.07)" },
    label: { display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 },
    group: { marginBottom: 20 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    tabs: { display: "flex", gap: 8, marginBottom: 28 },
    tab: (active) => ({
        padding: "8px 20px", borderRadius: 8, border: "2px solid",
        borderColor: active ? "#4f46e5" : "#dde1ea",
        background: active ? "#4f46e5" : "#fff",
        color: active ? "#fff" : "#666",
        fontWeight: 600, cursor: "pointer", fontSize: 14
    }),
    btn: { width: "100%", background: "#4f46e5", color: "#fff", padding: 13, borderRadius: 8, fontSize: 16, marginTop: 8 },
    priceBox: {
        background: "#f0f0ff", borderRadius: 10, padding: "14px 18px",
        marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center"
    }
};

const RIDE_TYPES = [
    { value: "ride", label: "🚕 נסיעה" },
    { value: "carpool", label: "🤝 קרפול" },
    { value: "delivery", label: "📦 משלוח" }
];

export default function BookRidePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [rideType, setRideType] = useState(params.get("type") || "ride");
    const [form, setForm] = useState({
        pickupAddress: "", pickupLat: 31.7683, pickupLng: 35.2137,
        destAddress: "", destLat: 32.0853, destLng: 34.7818,
        passengerCount: 1, scheduledTime: ""
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const estimatedPrice = () => {
        const base = rideType === "carpool" ? 15 : rideType === "delivery" ? 30 : 25;
        return `₪${base}–₪${base + 20}`;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const { data } = await api.post("/rides", {
                passengerId: user.passengerId || user.userId,
                rideType,
                pickupLocation: { address: form.pickupAddress, lat: form.pickupLat, lng: form.pickupLng },
                destinationLocation: { address: form.destAddress, lat: form.destLat, lng: form.destLng },
                passengerCount: form.passengerCount,
                scheduledTime: form.scheduledTime || null
            });
            navigate(`/ride/${data.ride._id}`);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה ביצירת הנסיעה");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.page}>
            <h1 style={s.title}>הזמן נסיעה</h1>

            <div style={s.tabs}>
                {RIDE_TYPES.map(t => (
                    <button key={t.value} style={s.tab(rideType === t.value)}
                        type="button" onClick={() => setRideType(t.value)}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={s.card}>
                <form onSubmit={handleSubmit}>
                    <div style={s.group}>
                        <label style={s.label}>📍 נקודת איסוף</label>
                        <input placeholder="הכנס כתובת איסוף" value={form.pickupAddress}
                            onChange={e => set("pickupAddress", e.target.value)} required />
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>🏁 יעד</label>
                        <input placeholder="הכנס כתובת יעד" value={form.destAddress}
                            onChange={e => set("destAddress", e.target.value)} required />
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>מספר נוסעים</label>
                            <select value={form.passengerCount} onChange={e => set("passengerCount", Number(e.target.value))}>
                                {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>זמן מתוכנן (אופציונלי)</label>
                            <input type="datetime-local" value={form.scheduledTime}
                                onChange={e => set("scheduledTime", e.target.value)} />
                        </div>
                    </div>

                    <div style={s.priceBox}>
                        <span style={{ color: "#666", fontSize: 14 }}>מחיר משוער</span>
                        <span style={{ fontWeight: 700, fontSize: 20, color: "#4f46e5" }}>{estimatedPrice()}</span>
                    </div>

                    {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}
                    <button type="submit" style={s.btn} disabled={loading}>
                        {loading ? "מחפש נהג..." : "הזמן עכשיו 🚕"}
                    </button>
                </form>
            </div>
        </div>
    );
}
