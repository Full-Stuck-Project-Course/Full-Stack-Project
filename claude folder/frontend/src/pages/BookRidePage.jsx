// src/pages/BookRidePage.jsx

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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
    stopRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 },
    driverCard: {
        background: "var(--surface)", borderRadius: 10, padding: "12px 16px",
        border: "1px solid var(--border)", marginBottom: 8,
        display: "flex", justifyContent: "space-between", alignItems: "center"
    },
    savedAddr: (sel) => ({
        padding: "8px 14px", borderRadius: 10, cursor: "pointer",
        border: `1.5px solid ${sel ? "var(--primary)" : "var(--border)"}`,
        background: sel ? "rgba(79,70,229,0.06)" : "var(--surface)",
        fontSize: 13, fontWeight: sel ? 700 : 400,
        color: sel ? "var(--primary)" : "var(--text-muted)"
    })
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

function toLocalDateTimeInputValue(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function hasCoordinates(loc) {
    return loc?.lat != null && loc?.lng != null && !(Number(loc.lat) === 0 && Number(loc.lng) === 0);
}

export default function BookRidePage() {
    const { user, updateUser } = useAuth();
    const userId       = user?.userId;
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
    const [pricePrediction, setPricePrediction] = useState(null);

    // Points redemption
    const [userPoints,    setUserPoints]    = useState(user?.loyaltyPoints || 0);
    const [redeemPoints,  setRedeemPoints]  = useState(false);
    const [pointsToUse,   setPointsToUse]   = useState(0);
    const pointsValue = pointsToUse * 0.1;

    // Saved addresses
    const [savedAddresses, setSavedAddresses] = useState([]);

    // Get user location
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => setUserLoc({ lat: 31.7683, lng: 35.2137 })
            );
        }
    }, []);

    // Fetch nearby drivers, saved addresses, points
    useEffect(() => {
        if (userLoc) {
            api.get("/maps/nearby-drivers", { params: { lat: userLoc.lat, lng: userLoc.lng, radius: 15 } })
                .then(r => setNearbyDrivers(r.data || []))
                .catch(() => {});
            api.get("/maps/best-departure").then(r => setBestTime(r.data)).catch(() => {});
        }
        // Fetch saved addresses
        api.get("/passengers").then(r => {
            const p = r.data.find(p => p.userId === userId || p.userId?._id === userId);
            if (p?.savedLocations) setSavedAddresses(p.savedLocations);
        }).catch(() => {});
        // Fetch current points
        if (userId) api.get(`/users/${userId}`).then(r => setUserPoints(r.data.loyaltyPoints || 0)).catch(() => {});
        // Price prediction
        api.get("/maps/price-prediction").then(r => setPricePrediction(r.data)).catch(() => {});
    }, [userLoc, userId]);

    // Calculate price
    const calcPrice = useCallback(async () => {
        if (!pickup.lat || !dest.lat) return;
        setPriceLoading(true);
        try {
            const { data } = await api.get("/maps/distance-price", {
                params: { origins: `${pickup.lat},${pickup.lng}`, destinations: `${dest.lat},${dest.lng}`, vehicleType, rideType, passengerCount }
            });
            setPriceData(data);
        } catch { setPriceData(null); }
        finally { setPriceLoading(false); }
    }, [pickup, dest, vehicleType, rideType, passengerCount]);

    useEffect(() => {
        const timer = setTimeout(calcPrice, 600);
        return () => clearTimeout(timer);
    }, [calcPrice]);

    useEffect(() => {
        if (rideType === "carpool" && passengerCount > 4) setPassCount(4);
    }, [rideType, passengerCount]);

    const addStop = () => setStops(s => [...s, { address: "", lat: null, lng: null }]);
    const removeStop = (i) => setStops(s => s.filter((_, idx) => idx !== i));
    const updateStop = (i, val) => setStops(s => s.map((st, idx) => idx === i ? { ...st, ...val } : st));

    const applySavedAddress = (addr, target) => {
        const loc = { address: addr.address || addr.name, lat: addr.lat, lng: addr.lng };
        if (target === "pickup") setPickup(loc);
        else setDest(loc);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!pickup.address) return setError("נא להזין כתובת איסוף");
        if (!dest.address)   return setError("נא להזין כתובת יעד");

        if (!hasCoordinates(pickup)) return setError("נא לבחור כתובת איסוף מהרשימה");
        if (!hasCoordinates(dest)) return setError("נא לבחור כתובת יעד מהרשימה");
        if (stops.some(stop => !stop.address || !hasCoordinates(stop))) {
            return setError("נא לבחור כל עצירת ביניים מהרשימה");
        }

        setLoading(true);
        try {
            const { data } = await api.post("/rides", {
                rideType,
                vehicleType,
                pickupLocation:      { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
                destinationLocation: { address: dest.address,   lat: dest.lat,   lng: dest.lng },
                passengerCount,
                scheduledTime: scheduledTime || null,
                pointsToRedeem: redeemPoints ? pointsToUse : 0
            });
            if (data.remainingPoints !== undefined) {
                setUserPoints(data.remainingPoints);
                updateUser({ loyaltyPoints: data.remainingPoints });
            }
            if (stops.length > 0) {
                await Promise.all(stops.map((stop, i) => api.post("/ride-stops", {
                    rideId: data.ride._id,
                    order: i + 1,
                    address: stop.address,
                    lat: stop.lat,
                    lng: stop.lng,
                    stopType: "waypoint"
                })));
            }
            navigate(`/ride/${data.ride._id}`);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה ביצירת הנסיעה");
        } finally { setLoading(false); }
    };

    const mapMarkers = nearbyDrivers.map(d => ({
        lat: d.currentLocation.lat, lng: d.currentLocation.lng,
        label: d.userId?.fullName || "נהג", rating: d.ratingAverage, distanceKm: d.distanceKm
    }));

    return (
        <div style={s.page}>
            <h1 style={s.title}>{"הזמן נסיעה"}</h1>

            {/* Best departure + price prediction */}
            {bestTime && bestTime.currentDemand === "high" && (
                <div style={{ background: "#fef3c7", borderRadius: 10, padding: "10px 16px", marginBottom: 10, fontSize: 13, color: "#92400e" }}>
                    ⏰ {"הזמן הטוב ביותר לנסיעה"}: {bestTime.suggestions?.[0]?.time} — {bestTime.suggestions?.[0]?.reason}
                </div>
            )}
            {pricePrediction?.cheaperSoon && (
                <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#065f46", border: "1px solid #86efac" }}>
                    💡 {pricePrediction.cheaperMessage}
                </div>
            )}

            {/* Ride type tabs */}
            <div style={s.tabs} role="tablist">
                {RIDE_TYPES.map(rt => (
                    <button key={rt.value} style={s.tab(rideType === rt.value)} type="button" onClick={() => setRideType(rt.value)} role="tab" aria-selected={rideType === rt.value}>{rt.label}</button>
                ))}
            </div>

            <form onSubmit={handleSubmit}>
                <div style={s.card}>
                    {/* Saved addresses */}
                    {savedAddresses.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ ...s.label, fontSize: 13 }}>{"📌 כתובות שמורות"}</label>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {savedAddresses.map((addr, i) => (
                                    <div key={i} style={{ display: "flex", gap: 4 }}>
                                        <span style={s.savedAddr(pickup.address === addr.address)}
                                            onClick={() => applySavedAddress(addr, "pickup")}>
                                            📍 {addr.name || addr.address}
                                        </span>
                                        <span style={s.savedAddr(dest.address === addr.address)}
                                            onClick={() => applySavedAddress(addr, "dest")}>
                                            🏁
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pickup */}
                    <div style={s.group}>
                        <label style={s.label}>📍 {"נקודת איסוף"}</label>
                        <AddressInput placeholder={"הכנס כתובת איסוף"} value={pickup.address}
                            onChange={v => setPickup(p => ({ ...p, address: v }))}
                            onPlaceSelected={loc => setPickup(loc)} />
                    </div>

                    {/* Stops */}
                    {stops.map((stop, i) => (
                        <div key={i} style={s.stopRow}>
                            <div style={{ flex: 1 }}>
                                <AddressInput placeholder={`עצירה ${i + 1}`} value={stop.address}
                                    onChange={v => updateStop(i, { address: v })}
                                    onPlaceSelected={loc => updateStop(i, loc)} />
                            </div>
                            <button type="button" onClick={() => removeStop(i)}
                                style={{ background: "#fee2e2", color: "var(--danger)", padding: "8px 12px", borderRadius: 8, flexShrink: 0 }}>✕</button>
                        </div>
                    ))}
                    <button type="button" onClick={addStop}
                        style={{ background: "var(--border)", color: "var(--text-muted)", padding: "7px 14px", fontSize: 13, marginBottom: 12 }}>+ {"הוסף עצירה"}</button>

                    {/* Destination */}
                    <div style={s.group}>
                        <label style={s.label}>🏁 {"יעד"}</label>
                        <AddressInput placeholder={"הכנס כתובת יעד"} value={dest.address}
                            onChange={v => setDest(p => ({ ...p, address: v }))}
                            onPlaceSelected={loc => setDest(loc)} />
                    </div>

                    {/* Vehicle type */}
                    <div style={s.group}>
                        <label style={s.label}>{"סוג רכב"}</label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {VEHICLE_TYPES.map(vt => (
                                <button key={vt.value} type="button" style={s.tab(vehicleType === vt.value)} onClick={() => setVehicleType(vt.value)}>{vt.label}</button>
                            ))}
                        </div>
                    </div>

                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>{"נוסעים"}</label>
                            <select value={passengerCount} onChange={e => setPassCount(Number(e.target.value))}>
                                {Array.from({ length: rideType === "carpool" ? 4 : 6 }, (_, i) => i + 1)
                                    .map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>{"זמן מתוכנן"} ({"אופציונלי"})</label>
                            <input type="datetime-local" value={scheduledTime}
                                onChange={e => setSched(e.target.value)} min={toLocalDateTimeInputValue()} />
                        </div>
                    </div>

                    {/* Price display */}
                    <div style={s.priceBox}>
                        {priceLoading ? (
                            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{"מחשב מחיר..."}</div>
                        ) : priceData ? (
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                    <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{"מחיר משוער"}</span>
                                    <div style={{ textAlign: "left" }}>
                                        {redeemPoints && pointsToUse > 0 && (
                                            <span style={{ fontSize: 14, color: "var(--text-muted)", textDecoration: "line-through", marginLeft: 8 }}>₪{priceData.price}</span>
                                        )}
                                        <span style={{ fontWeight: 800, fontSize: 24, color: "var(--primary)" }}>
                                            ₪{Math.max(0, priceData.price - pointsValue).toFixed(0)}
                                        </span>
                                    </div>
                                </div>
                                {rideType === "carpool" && passengerCount > 1 && (
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--success)" }}>
                                        <span>{"מחיר משוער לנוסע"}</span>
                                        <span style={{ fontWeight: 700 }}>₪{Math.ceil(Math.max(0, priceData.price - pointsValue) / passengerCount)}</span>
                                    </div>
                                )}
                                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                                    <span>📏 {priceData.distanceText || `${priceData.distanceKm} ק"מ`}</span>
                                    <span>⏱️ {priceData.durationText || `${priceData.durationMinutes} דקות`}</span>
                                    {priceData.surgeMultiplier > 1 && <span style={{ color: "var(--warning)" }}>🔥 ×{priceData.surgeMultiplier}</span>}
                                </div>

                                {/* Points redemption */}
                                {userPoints > 0 && (
                                    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, marginBottom: 8 }}>
                                            <input type="checkbox" checked={redeemPoints} onChange={e => {
                                                setRedeemPoints(e.target.checked);
                                                if (!e.target.checked) setPointsToUse(0);
                                                else setPointsToUse(Math.min(userPoints, priceData.price * 10));
                                            }} />
                                            ✨ פדה נקודות נאמנות ({userPoints} נקודות = ₪{(userPoints * 0.1).toFixed(1)})
                                        </label>
                                        {redeemPoints && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <input type="range" min={0} max={Math.min(userPoints, Math.ceil(priceData.price * 10))}
                                                    value={pointsToUse}
                                                    onChange={e => setPointsToUse(Number(e.target.value))}
                                                    style={{ flex: 1 }} />
                                                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--success)", minWidth: 60, textAlign: "left" }}>
                                                    -₪{(pointsToUse * 0.1).toFixed(1)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{"הזן כתובות לחישוב המחיר"}</div>
                        )}
                    </div>
                </div>

                {error && <p className="error-msg" role="alert">⚠️ {error}</p>}
                <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                    {loading ? "מחפש נהג..." : `${"הזמן עכשיו"} 🚕`}
                </button>
            </form>

            {/* Nearby drivers map */}
            <div style={{ ...s.card, marginTop: 24 }}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 16 }}>
                    🗺️ {"נהגים בסביבה"} ({nearbyDrivers.length})
                </div>
                <MapComponent
                    center={userLoc || { lat: 31.7683, lng: 35.2137 }}
                    zoom={13} height={280}
                    markers={mapMarkers}
                    passengerMarker={userLoc} />
                {nearbyDrivers.length === 0 && (
                    <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "12px 0", fontSize: 14 }}>{"אין נהגים זמינים כרגע"}</div>
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
                                    <div style={{ fontSize: 11, color: "var(--success)" }}>{"● זמין"}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
