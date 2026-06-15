// src/pages/BookRidePage.jsx

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";
import MapComponent, { AddressInput } from "../components/MapComponent";

const s = {
    page: { padding: "28px 20px", maxWidth: 680, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 16, border: "1px solid var(--border)" },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 18 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    tabs: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
    tab: (a) => ({
        padding: "8px 18px", borderRadius: 24, border: "2px solid",
        borderColor: a ? "var(--primary)" : "var(--border)",
        background: a ? "var(--primary)" : "var(--surface)",
        color: a ? "#fff" : "var(--text-muted)",
        fontWeight: 700, cursor: "pointer", fontSize: 14
    }),
    priceBox: {
        background: "linear-gradient(135deg, #eef2ff, #f5f3ff)",
        borderRadius: 12, padding: "16px 20px", marginTop: 16,
        border: "1px solid #c7d2fe"
    },
    stopRow: {
        display: "flex", gap: 8, alignItems: "center", marginBottom: 8
    },
    driverCard: {
        background: "var(--surface)", borderRadius: 10, padding: "12px 16px",
        border: "1px solid var(--border)", marginBottom: 8,
        display: "flex", justifyContent: "space-between", alignItems: "center"
    }
};

const RIDE_TYPES = [
    { value: "ride",    label: "🚕 נסיעה" },
    { value: "carpool", label: "🤝 קרפול" }
];

const VEHICLE_TYPES = [
    { value: "regular", label: "🚗 רגיל" },
    { value: "comfort", label: "🛋️ קומפורט" },
    { value: "luxury",  label: "✨ יוקרה" },
    { value: "van",     label: "🚐 מיניוואן" }
];

export default function BookRidePage() {
    const { user }     = useAuth();
    const { t }        = useLang();
    const navigate     = useNavigate();
    const [params]     = useSearchParams();

    const [rideType,     setRideType]     = useState(params.get("type") || "ride");
    const [vehicleType,  setVehicleType]  = useState("regular");
    const [pickup,       setPickup]       = useState({ address: "", lat: null, lng: null });
    const [dest,         setDest]         = useState({ address: "", lat: null, lng: null });
    const [stops,        setStops]        = useState([]);
    const [passengerCount, setPassCount]  = useState(1);
    const [scheduledTime,  setSched]      = useState("");
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState("");
    const [priceData,    setPriceData]    = useState(null);
    const [priceLoading, setPriceLoading] = useState(false);
    const [nearbyDrivers, setNearbyDrivers] = useState([]);
    const [userLoc,       setUserLoc]     = useState(null);
    const [bestTime,      setBestTime]    = useState(null);
    const [splitPayment,  setSplitPayment] = useState(false);

    // Get user location
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => setUserLoc({ lat: 31.7683, lng: 35.2137 })
            );
        }
    }, []);

    // Fetch nearby drivers when user location available
    useEffect(() => {
        if (!userLoc) return;
        api.get("/maps/nearby-drivers", { params: { lat: userLoc.lat, lng: userLoc.lng, radius: 15 } })
            .then(r => setNearbyDrivers(r.data || []))
            .catch(() => {});
        api.get("/maps/best-departure")
            .then(r => setBestTime(r.data))
            .catch(() => {});
    }, [userLoc]);

    // Calculate price when locations change
    const calcPrice = useCallback(async () => {
        if (!pickup.lat || !dest.lat) return;
        setPriceLoading(true);
        try {
            const origins      = `${pickup.lat},${pickup.lng}`;
            const destinations = `${dest.lat},${dest.lng}`;
            const { data } = await api.get("/maps/distance-price", {
                params: { origins, destinations, vehicleType, rideType, passengerCount }
            });
            setPriceData(data);
        } catch {
            setPriceData(null);
        } finally {
            setPriceLoading(false);
        }
    }, [pickup, dest, vehicleType, rideType, passengerCount]);

    useEffect(() => {
        const timer = setTimeout(calcPrice, 600);
        return () => clearTimeout(timer);
    }, [calcPrice]);

    const addStop = () => setStops(s => [...s, { address: "", lat: null, lng: null }]);
    const removeStop = (i) => setStops(s => s.filter((_, idx) => idx !== i));
    const updateStop = (i, val) => setStops(s => s.map((st, idx) => idx === i ? { ...st, ...val } : st));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!pickup.address) return setError("נא להזין כתובת איסוף");
        if (!dest.address)   return setError("נא להזין כתובת יעד");

        setLoading(true);
        try {
            const { data } = await api.post("/rides", {
                passengerId: user.userId,
                rideType,
                vehicleType,
                pickupLocation:      { address: pickup.address, lat: pickup.lat || 31.7683, lng: pickup.lng || 35.2137 },
                destinationLocation: { address: dest.address,   lat: dest.lat   || 32.0853, lng: dest.lng   || 34.7818 },
                passengerCount,
                scheduledTime: scheduledTime || null,
                basePrice:  priceData?.price || 0,
                finalPrice: priceData?.price || 0,
                distanceKm: priceData?.distanceKm || 0,
                estimatedDurationMinutes: priceData?.durationMinutes || 0,
                surgeMultiplier: priceData?.surgeMultiplier || 1
            });
            navigate(`/ride/${data.ride._id}`);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה ביצירת הנסיעה");
        } finally {
            setLoading(false);
        }
    };

    const mapMarkers = nearbyDrivers.map(d => ({
        lat: d.currentLocation.lat,
        lng: d.currentLocation.lng,
        label: d.userId?.fullName || "נהג",
        rating: d.ratingAverage,
        distanceKm: d.distanceKm
    }));

    return (
        <div style={s.page}>
            <h1 style={s.title}>{t("bookRide")}</h1>

            {/* Best departure time */}
            {bestTime && bestTime.currentDemand === "high" && (
                <div style={{ background: "#fef3c7", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
                    ⏰ {t("bestTime")}: {bestTime.suggestions?.[0]?.time} — {bestTime.suggestions?.[0]?.reason}
                </div>
            )}

            {/* Ride type tabs */}
            <div style={s.tabs} role="tablist">
                {RIDE_TYPES.map(rt => (
                    <button key={rt.value} style={s.tab(rideType === rt.value)}
                        type="button" onClick={() => setRideType(rt.value)}
                        role="tab" aria-selected={rideType === rt.value}>
                        {rt.label}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit}>
                <div style={s.card}>
                    {/* Pickup */}
                    <div style={s.group}>
                        <label style={s.label}>📍 {t("pickup")}</label>
                        <AddressInput
                            placeholder="הכנס כתובת איסוף"
                            value={pickup.address}
                            onChange={v => setPickup(p => ({ ...p, address: v }))}
                            onPlaceSelected={loc => setPickup(loc)}
                        />
                    </div>

                    {/* Stops */}
                    {stops.map((stop, i) => (
                        <div key={i} style={s.stopRow}>
                            <div style={{ flex: 1 }}>
                                <AddressInput
                                    placeholder={`עצירה ${i + 1}`}
                                    value={stop.address}
                                    onChange={v => updateStop(i, { address: v })}
                                    onPlaceSelected={loc => updateStop(i, loc)}
                                />
                            </div>
                            <button type="button" onClick={() => removeStop(i)}
                                style={{ background: "#fee2e2", color: "var(--danger)", padding: "8px 12px", borderRadius: 8, flexShrink: 0 }}>
                                ✕
                            </button>
                        </div>
                    ))}

                    <button type="button" onClick={addStop}
                        style={{ background: "var(--border)", color: "var(--text-muted)", padding: "7px 14px", fontSize: 13, marginBottom: 12 }}>
                        + {t("addStop")}
                    </button>

                    {/* Destination */}
                    <div style={s.group}>
                        <label style={s.label}>🏁 {t("destination")}</label>
                        <AddressInput
                            placeholder="הכנס כתובת יעד"
                            value={dest.address}
                            onChange={v => setDest(p => ({ ...p, address: v }))}
                            onPlaceSelected={loc => setDest(loc)}
                        />
                    </div>

                    {/* Vehicle type */}
                    <div style={s.group}>
                        <label style={s.label}>{t("vehicleType")}</label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {VEHICLE_TYPES.map(vt => (
                                <button key={vt.value} type="button"
                                    style={s.tab(vehicleType === vt.value)}
                                    onClick={() => setVehicleType(vt.value)}>
                                    {vt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>{t("passengers")}</label>
                            <select value={passengerCount} onChange={e => setPassCount(Number(e.target.value))}>
                                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>{t("scheduledTime")} ({t("optional")})</label>
                            <input type="datetime-local" value={scheduledTime}
                                onChange={e => setSched(e.target.value)}
                                min={new Date().toISOString().slice(0, 16)}
                            />
                        </div>
                    </div>

                    {/* Split payment toggle */}
                    {rideType === "carpool" && passengerCount > 1 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                                <input type="checkbox" checked={splitPayment}
                                    onChange={e => setSplitPayment(e.target.checked)} />
                                {t("splitPayment")} ({passengerCount} נוסעים)
                            </label>
                        </div>
                    )}

                    {/* Price display */}
                    <div style={s.priceBox}>
                        {priceLoading ? (
                            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>מחשב מחיר...</div>
                        ) : priceData ? (
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                    <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("estimatedPrice")}</span>
                                    <span style={{ fontWeight: 800, fontSize: 24, color: "var(--primary)" }}>₪{priceData.price}</span>
                                </div>
                                {splitPayment && passengerCount > 1 && (
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--success)" }}>
                                        <span>{t("perPerson")}</span>
                                        <span style={{ fontWeight: 700 }}>₪{priceData.pricePerPerson}</span>
                                    </div>
                                )}
                                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                                    <span>📏 {priceData.distanceText}</span>
                                    <span>⏱️ {priceData.durationText}</span>
                                    {priceData.surgeMultiplier > 1 && (
                                        <span style={{ color: "var(--warning)" }}>🔥 ×{priceData.surgeMultiplier}</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                                הזן כתובות לחישוב המחיר
                            </div>
                        )}
                    </div>
                </div>

                {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

                <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                    {loading ? "מחפש נהג..." : `${t("bookNow")} 🚕`}
                </button>
            </form>

            {/* Nearby drivers map */}
            <div style={{ ...s.card, marginTop: 24 }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 16 }}>
                    🗺️ {t("nearbyDrivers")} ({nearbyDrivers.length})
                </div>
                <MapComponent
                    center={userLoc || { lat: 31.7683, lng: 35.2137 }}
                    zoom={13}
                    height={280}
                    markers={mapMarkers}
                    passengerMarker={userLoc}
                />
                {nearbyDrivers.length === 0 && (
                    <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "12px 0", fontSize: 14 }}>
                        {t("noDrivers")}
                    </div>
                )}
                {nearbyDrivers.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        {nearbyDrivers.slice(0, 3).map((d, i) => (
                            <div key={d._id || i} style={s.driverCard}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{d.userId?.fullName || "נהג"}</div>
                                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>📏 {d.distanceKm} ק"מ ממך</div>
                                </div>
                                <div style={{ textAlign: "left" }}>
                                    <div style={{ fontSize: 14, fontWeight: 700 }}>⭐ {d.ratingAverage}</div>
                                    <div style={{ fontSize: 11, color: "var(--success)" }}>● זמין</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
