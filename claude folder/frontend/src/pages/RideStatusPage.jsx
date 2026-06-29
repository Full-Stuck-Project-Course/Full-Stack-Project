// src/pages/RideStatusPage.jsx

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";
import MapComponent from "../components/MapComponent";
import { createSocket } from "../api/socket";

const s = {
    page: { padding: "28px 20px", maxWidth: 620, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    row: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" },
    lbl: { color: "var(--text-muted)", fontSize: 14 },
    val: { fontWeight: 600, fontSize: 14 },
    sosBtn: { width: "100%", background: "var(--danger)", color: "#fff", padding: 14, borderRadius: 10, fontSize: 16, fontWeight: 800, marginBottom: 10 },
    chatBox: { background: "#f8fafc", borderRadius: 10, padding: 12, maxHeight: 200, overflowY: "auto", marginBottom: 10 },
    etaBanner: {
        background: "linear-gradient(135deg, #dbeafe, #f0f9ff)",
        borderRadius: 12, padding: "14px 18px", marginBottom: 14,
        border: "1px solid #93c5fd", display: "flex", alignItems: "center", gap: 12
    },
    bubble: (own) => ({
        background: own ? "var(--primary)" : "var(--border)",
        color: own ? "#fff" : "var(--text)",
        borderRadius: own ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
        padding: "8px 14px", maxWidth: "72%", fontSize: 14
    })
};

const STATUS_LABELS = {
    searching:       { label: "מחפש נהג",  icon: "🔍", cls: "status-searching" },
    accepted:        { label: "אושרה",     icon: "✅", cls: "status-accepted" },
    driver_arriving: { label: "נהג בדרך",  icon: "🚗", cls: "status-driver-arriving" },
    in_progress:     { label: "בנסיעה",    icon: "🛣️", cls: "status-in-progress" },
    completed:       { label: "הושלמה",    icon: "✅", cls: "status-completed" },
    cancelled:       { label: "בוטלה",     icon: "❌", cls: "status-cancelled" }
};

export default function RideStatusPage() {
    const { id }       = useParams();
    const navigate     = useNavigate();
    const { user }     = useAuth();
    const { t }        = useLang();
    const [ride,       setRide]       = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [driverLoc,  setDriverLoc]  = useState(null);
    const [messages,   setMessages]   = useState([]);
    const [chatText,   setChatText]   = useState("");
    const [chatOpen,   setChatOpen]   = useState(false);
    const [sosClicked, setSosClicked] = useState(false);
    const [eta,        setEta]        = useState(null);
    const [nearbyDrivers, setNearbyDrivers] = useState([]);
    const [userLoc,    setUserLoc]    = useState(null);
    const socketRef = useRef(null);
    const chatEndRef = useRef(null);
    const prevStatus = useRef(null);

    // Get user location
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => {}
            );
        }
    }, []);

    const fetchRide = async () => {
        try {
            const { data } = await api.get(`/rides/${id}`);
            setRide(data);

            // Status-change notifications
            if (prevStatus.current && prevStatus.current !== data.status) {
                if (data.status === "driver_arriving") {
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("HailNow 🚕", { body: "הנהג בדרך אליך!" });
                    }
                }
                if (data.status === "cancelled" && data.cancelledBy === "system") {
                    alert("הנסיעה בוטלה אוטומטית — לא נמצא נהג תוך 30 דקות.");
                }
            }
            prevStatus.current = data.status;
        } catch { navigate("/"); }
        finally { setLoading(false); }
    };

    // Fetch nearby drivers for passenger map
    useEffect(() => {
        if (!userLoc) return;
        api.get("/maps/nearby-drivers", { params: { lat: userLoc.lat, lng: userLoc.lng, radius: 10 } })
            .then(r => setNearbyDrivers(r.data || []))
            .catch(() => {});
    }, [userLoc]);

    // Calculate driver ETA
    useEffect(() => {
        if (!driverLoc || !ride?.pickupLocation?.lat) return;
        if (!["accepted", "driver_arriving"].includes(ride?.status)) return;

        api.get("/maps/driver-eta", {
            params: {
                driverLat: driverLoc.lat, driverLng: driverLoc.lng,
                passengerLat: ride.pickupLocation.lat, passengerLng: ride.pickupLocation.lng
            }
        }).then(r => setEta(r.data)).catch(() => {});
    }, [driverLoc, ride?.pickupLocation?.lat, ride?.status]);

    useEffect(() => {
        fetchRide();
        const poll = setInterval(fetchRide, 6000);

        if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();

        const socket = createSocket();
        socketRef.current = socket;
        socket.emit("join-ride", id);

        socket.on("location-update", ({ lat, lng }) => setDriverLoc({ lat, lng }));
        socket.on("new-message", (msg) => {
            setMessages(m => [...m, msg]);
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        });
        socket.on("ride-cancelled", ({ reason }) => {
            if (reason === "auto_timeout") {
                alert("הנסיעה בוטלה אוטומטית — לא נמצא נהג תוך 30 דקות.");
                fetchRide();
            }
        });

        return () => { clearInterval(poll); socket.disconnect(); };
    }, [id]);

    const cancelRide = async () => {
        if (!window.confirm("האם לבטל את הנסיעה?")) return;
        await api.put(`/rides/${id}/cancel`, { cancelledBy: "passenger" });
        fetchRide();
    };

    const handleSOS = () => {
        setSosClicked(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                socketRef.current?.emit("sos", {
                    rideId: id,
                    lat: pos.coords.latitude, lng: pos.coords.longitude
                });
            });
        }
        alert("🚨 בקשת חירום נשלחה! עזרה בדרך.");
    };

    const sendMessage = () => {
        if (!chatText.trim()) return;
        socketRef.current?.emit("chat-message", {
            rideId: id, message: chatText,
            sender: user?.userId, senderName: user?.fullName || "נוסע"
        });
        setMessages(m => [...m, { message: chatText, sender: user?.userId, senderName: "אני", timestamp: new Date() }]);
        setChatText("");
    };

    const reportComplaint = async () => {
        const reason = window.prompt("תאר את הבעיה:");
        if (!reason) return;
        await api.post("/notifications", {
            userId: user?.userId, type: "system",
            title: "תלונה על נסיעה", body: `נסיעה ${id}: ${reason}`, rideId: id
        }).catch(() => {});
        alert("תלונתך נקלטה. צוות שלנו יבדוק בהקדם.");
    };

    if (loading) return <div className="spinner" aria-label={"טוען..."} />;
    if (!ride)   return null;

    const st = STATUS_LABELS[ride.status] || STATUS_LABELS.searching;
    const inRide = ["accepted", "driver_arriving", "in_progress"].includes(ride.status);
    const pickupLoc = ride.pickupLocation?.lat ? { lat: ride.pickupLocation.lat, lng: ride.pickupLocation.lng } : null;

    // Map markers: nearby drivers for passenger
    const driverMarkers = ride.status === "searching"
        ? nearbyDrivers.filter(d => d.currentLocation?.lat).map(d => ({
            lat: d.currentLocation.lat, lng: d.currentLocation.lng,
            label: d.userId?.fullName || "נהג", rating: d.ratingAverage, distanceKm: d.distanceKm
        }))
        : [];

    return (
        <div style={s.page} className="fade-in">
            <h1 style={s.title}>{"סטטוס נסיעה"}</h1>

            {/* ETA banner */}
            {eta && ["accepted", "driver_arriving"].includes(ride.status) && (
                <div style={s.etaBanner} role="alert">
                    <div style={{ fontSize: 32 }}>🚗</div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: "#1e40af" }}>
                            הנהג במרחק {eta.etaText || `כ-${eta.etaMinutes} דקות`}
                        </div>
                        <div style={{ fontSize: 13, color: "#3b82f6" }}>
                            📏 {eta.distanceKm} ק"מ ממך
                            {eta.etaMinutes <= 2 && " · 🎉 הנהג כמעט הגיע!"}
                        </div>
                    </div>
                </div>
            )}

            {/* Status badge */}
            <div style={s.card}>
                <div className={`badge ${st.cls}`} style={{ marginBottom: 16, padding: "10px 18px", fontSize: 15 }}>
                    {st.icon} {st.label}
                </div>

                {[
                    ["📍 " + "נקודת איסוף",      ride.pickupLocation?.address],
                    ["🏁 " + "יעד", ride.destinationLocation?.address],
                    ["סוג נסיעה",            ride.rideType === "carpool" ? "🤝 קרפול" : "🚕 נסיעה"],
                    ["מחיר כולל",          ride.finalPrice ? `₪${ride.finalPrice}` : "טרם נקבע"],
                    ["נוסעים",          ride.passengerCount],
                    ...(ride.scheduledTime ? [["זמן מתוכנן", new Date(ride.scheduledTime).toLocaleString("he-IL")]] : []),
                ].map(([label, val]) => (
                    <div key={label} style={s.row}>
                        <span style={s.lbl}>{label}</span>
                        <span style={s.val}>{val}</span>
                    </div>
                ))}
            </div>

            {/* Driver info */}
            {ride.driverId && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>🧑‍✈️ {"פרטי הנהג"}</div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22 }}>🧑</div>
                        <div>
                            <div style={{ fontWeight: 700 }}>{ride.driverId.userId?.fullName || "הנהג שלך"}</div>
                            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>⭐ {ride.driverId.ratingAverage} · {ride.driverId.totalRides} נסיעות</div>
                            {ride.driverId.preferredMusic && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>🎵 {ride.driverId.preferredMusic}</div>}
                            {ride.driverId.hobbies?.length > 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>🎯 {ride.driverId.hobbies.join(", ")}</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* Map — shows driver location + nearby drivers (when searching) + passenger */}
            <div style={{ marginBottom: 14 }}>
                <MapComponent
                    center={driverLoc || pickupLoc || userLoc || { lat: 31.7683, lng: 35.2137 }}
                    zoom={14} height={280}
                    driverMarker={driverLoc}
                    passengerMarker={pickupLoc || userLoc}
                    markers={driverMarkers}
                />
                {ride.status === "searching" && nearbyDrivers.length > 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>
                        🚕 {nearbyDrivers.length} נהגים בסביבה
                    </div>
                )}
            </div>

            {/* SOS Emergency */}
            {inRide && (
                <button style={{ ...s.sosBtn, background: sosClicked ? "#991b1b" : "var(--danger)" }}
                    onClick={handleSOS} aria-label="כפתור חירום SOS">
                    🚨 {"SOS חירום"}
                </button>
            )}

            {/* Chat */}
            {ride.driverId && inRide && (
                <div style={s.card}>
                    <button type="button" onClick={() => setChatOpen(o => !o)}
                        style={{ background: "none", padding: 0, color: "var(--primary)", fontWeight: 700, fontSize: 14, marginBottom: chatOpen ? 12 : 0 }}>
                        💬 {"צ'אט עם הנהג"} {chatOpen ? "▲" : "▼"}
                    </button>
                    {chatOpen && (
                        <>
                            <div style={s.chatBox} role="log" aria-live="polite">
                                {messages.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 12 }}>אין הודעות עדיין</div>}
                                {messages.map((msg, i) => (
                                    <div key={i} style={{ marginBottom: 8, display: "flex", justifyContent: msg.sender === user?.userId ? "flex-end" : "flex-start" }}>
                                        <div style={s.bubble(msg.sender === user?.userId)}>
                                            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>{msg.senderName}</div>
                                            {msg.message}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input placeholder={"שלח הודעה"} value={chatText}
                                    onChange={e => setChatText(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && sendMessage()} style={{ flex: 1 }} />
                                <button onClick={sendMessage}
                                    style={{ background: "var(--primary)", color: "#fff", padding: "10px 16px" }}>שלח</button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Actions */}
            {["searching", "accepted", "driver_arriving"].includes(ride.status) && (
                <button onClick={cancelRide}
                    style={{ width: "100%", background: "#fee2e2", color: "var(--danger)", padding: 12, borderRadius: 10, fontSize: 15, marginBottom: 10 }}>
                    {"בטל נסיעה"}
                </button>
            )}
            {ride.status === "completed" && (
                <button className="btn-primary" onClick={() => navigate(`/rate/${id}`)}>⭐ {"דרג נסיעה"} →</button>
            )}
            {inRide && (
                <button type="button" onClick={reportComplaint}
                    style={{ width: "100%", background: "none", color: "var(--text-muted)", padding: 10, fontSize: 13, marginTop: 6 }}>
                    ⚑ {"הגש תלונה"}
                </button>
            )}
        </div>
    );
}
