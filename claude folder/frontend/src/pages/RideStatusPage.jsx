// src/pages/RideStatusPage.jsx

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";
import MapComponent from "../components/MapComponent";
import { io } from "socket.io-client";

const STATUS_LABELS = {
    searching:       { label: "מחפש נהג...",      color: "#f59e0b", icon: "🔍", cls: "status-searching"    },
    accepted:        { label: "נהג נמצא!",         color: "#10b981", icon: "✅", cls: "status-accepted"     },
    driver_arriving: { label: "הנהג בדרך אליך",    color: "#3b82f6", icon: "🚗", cls: "status-accepted"     },
    in_progress:     { label: "הנסיעה בעיצומה",    color: "#8b5cf6", icon: "🛣️", cls: "status-in-progress"  },
    completed:       { label: "הנסיעה הושלמה",     color: "#10b981", icon: "🏁", cls: "status-completed"    },
    cancelled:       { label: "הנסיעה בוטלה",      color: "#ef4444", icon: "❌", cls: "status-cancelled"    }
};

const s = {
    page: { padding: "28px 20px", maxWidth: 620, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    row: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" },
    lbl: { color: "var(--text-muted)", fontSize: 14 },
    val: { fontWeight: 600, fontSize: 14 },
    sosBtn: {
        width: "100%", background: "var(--danger)", color: "#fff",
        padding: 14, borderRadius: 10, fontSize: 16, fontWeight: 800,
        marginBottom: 10, animation: "none"
    },
    chatBox: { background: "#f8fafc", borderRadius: 10, padding: 12, maxHeight: 200, overflowY: "auto", marginBottom: 10 },
    msgBubble: (own) => ({
        marginBottom: 8, display: "flex",
        justifyContent: own ? "flex-end" : "flex-start"
    }),
    bubble: (own) => ({
        background: own ? "var(--primary)" : "var(--border)",
        color: own ? "#fff" : "var(--text)",
        borderRadius: own ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
        padding: "8px 14px", maxWidth: "72%", fontSize: 14
    })
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
    const socketRef = useRef(null);
    const chatEndRef = useRef(null);

    const fetchRide = async () => {
        try {
            const { data } = await api.get(`/rides/${id}`);
            setRide(data);
        } catch { navigate("/"); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchRide();
        const poll = setInterval(fetchRide, 6000);

        // Socket.io for real-time
        const socket = io("http://localhost:5000");
        socketRef.current = socket;
        socket.emit("join-ride", id);
        socket.on("location-update", ({ lat, lng }) => setDriverLoc({ lat, lng }));
        socket.on("new-message", (msg) => {
            setMessages(m => [...m, msg]);
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
                    rideId: id, userId: user?.userId,
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
            userId: "admin",
            type: "system",
            title: "תלונה על נסיעה",
            body: `נסיעה ${id}: ${reason}`,
            rideId: id
        }).catch(() => {});
        alert("תלונתך נקלטה. צוות שלנו יבדוק בהקדם.");
    };

    if (loading) return <div className="spinner" aria-label={t("loading")} />;
    if (!ride)   return null;

    const st = STATUS_LABELS[ride.status] || STATUS_LABELS.searching;
    const inRide = ["accepted", "driver_arriving", "in_progress"].includes(ride.status);
    const pickupLoc = ride.pickupLocation?.lat ? { lat: ride.pickupLocation.lat, lng: ride.pickupLocation.lng } : null;

    return (
        <div style={s.page} className="fade-in">
            <h1 style={s.title}>{t("rideStatus")}</h1>

            {/* Status badge */}
            <div style={s.card}>
                <div className={`badge ${st.cls}`} style={{ marginBottom: 16, padding: "10px 18px", fontSize: 15 }}>
                    {st.icon} {st.label}
                </div>

                {[
                    ["📍 " + t("pickup"),      ride.pickupLocation?.address],
                    ["🏁 " + t("destination"), ride.destinationLocation?.address],
                    [t("rideType"),            ride.rideType === "carpool" ? "🤝 קרפול" : "🚕 נסיעה"],
                    [t("totalPrice"),          ride.finalPrice ? `₪${ride.finalPrice}` : "טרם נקבע"],
                    [t("passengers"),          ride.passengerCount],
                    ...(ride.scheduledTime ? [[t("scheduledTime"), new Date(ride.scheduledTime).toLocaleString("he-IL")]] : []),
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
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>🧑‍✈️ {t("driverInfo")}</div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
                        <div style={{
                            width: 52, height: 52, borderRadius: "50%", background: "var(--primary)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#fff", fontSize: 22
                        }}>🧑</div>
                        <div>
                            <div style={{ fontWeight: 700 }}>{ride.driverId.userId?.fullName || "הנהג שלך"}</div>
                            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                                ⭐ {ride.driverId.ratingAverage} · {ride.driverId.totalRides} נסיעות
                            </div>
                            {ride.driverId.preferredMusic && (
                                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>🎵 {ride.driverId.preferredMusic}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Map */}
            {(pickupLoc || driverLoc) && (
                <div style={{ marginBottom: 14 }}>
                    <MapComponent
                        center={driverLoc || pickupLoc}
                        zoom={14}
                        height={260}
                        driverMarker={driverLoc}
                        passengerMarker={pickupLoc}
                    />
                </div>
            )}

            {/* SOS Emergency */}
            {inRide && (
                <button style={{ ...s.sosBtn, background: sosClicked ? "#991b1b" : "var(--danger)" }}
                    onClick={handleSOS}
                    aria-label="כפתור חירום SOS">
                    🚨 {t("emergencySOS")}
                </button>
            )}

            {/* Chat */}
            {ride.driverId && inRide && (
                <div style={s.card}>
                    <button type="button" onClick={() => setChatOpen(o => !o)}
                        style={{ background: "none", padding: 0, color: "var(--primary)", fontWeight: 700, fontSize: 14, marginBottom: chatOpen ? 12 : 0 }}>
                        💬 {t("chat")} {chatOpen ? "▲" : "▼"}
                    </button>
                    {chatOpen && (
                        <>
                            <div style={s.chatBox} role="log" aria-live="polite">
                                {messages.length === 0 && (
                                    <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 12 }}>
                                        אין הודעות עדיין
                                    </div>
                                )}
                                {messages.map((msg, i) => (
                                    <div key={i} style={s.msgBubble(msg.sender === user?.userId)}>
                                        <div style={s.bubble(msg.sender === user?.userId)}>
                                            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>{msg.senderName}</div>
                                            {msg.message}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    placeholder={t("sendMessage")}
                                    value={chatText}
                                    onChange={e => setChatText(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && sendMessage()}
                                    style={{ flex: 1 }}
                                />
                                <button onClick={sendMessage}
                                    style={{ background: "var(--primary)", color: "#fff", padding: "10px 16px" }}>
                                    שלח
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Actions */}
            {["searching", "accepted", "driver_arriving"].includes(ride.status) && (
                <button onClick={cancelRide}
                    style={{ width: "100%", background: "#fee2e2", color: "var(--danger)", padding: 12, borderRadius: 10, fontSize: 15, marginBottom: 10 }}>
                    {t("cancelRide")}
                </button>
            )}

            {ride.status === "completed" && (
                <button className="btn-primary"
                    onClick={() => navigate(`/rate/${id}`)}>
                    ⭐ {t("rateRide")} →
                </button>
            )}

            {inRide && (
                <button type="button" onClick={reportComplaint}
                    style={{ width: "100%", background: "none", color: "var(--text-muted)", padding: 10, fontSize: 13, marginTop: 6 }}>
                    ⚑ {t("complaint")}
                </button>
            )}
        </div>
    );
}
