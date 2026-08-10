// src/pages/RideStatusPage.jsx

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "../routing";
import { useAuth } from "../context/AuthContext";
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
    chatToggle: { position: "relative", display: "inline-flex", alignItems: "center", gap: 8, background: "none", padding: 0, color: "var(--primary)", fontWeight: 700, fontSize: 14 },
    chatBadge: { minWidth: 20, height: 20, borderRadius: 999, background: "var(--danger)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, padding: "0 6px" },
    chatUnreadLine: { color: "var(--danger)", fontSize: 13, fontWeight: 700, marginBottom: 12 },
    chatToast: { position: "fixed", top: 18, right: 18, zIndex: 50, width: "min(360px, calc(100vw - 32px))", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-lg)", padding: 14, display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 12, alignItems: "start", direction: "rtl" },
    chatToastIcon: { width: 34, height: 34, borderRadius: "50%", background: "rgba(79,70,229,0.10)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
    chatToastTitle: { fontWeight: 800, fontSize: 14, marginBottom: 3 },
    chatToastPreview: { color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, marginBottom: 10 },
    chatToastButton: { background: "var(--primary)", color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 800 },
    chatToastClose: { background: "none", color: "var(--text-muted)", padding: 0, fontSize: 20, lineHeight: 1 },
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

function isAssignedDriverUser(ride, user) {
    return Boolean(ride?.driverId && (
        ride.driverId?._id === user?.driverId ||
        ride.driverId?.userId?._id === user?.userId
    ));
}

function getChatPeerInfo(ride, user) {
    const driverView = isAssignedDriverUser(ride, user);
    const peerRole = driverView ? "הנוסע" : "הנהג";
    const peerName = driverView
        ? ride?.passengerId?.userId?.fullName
        : ride?.driverId?.userId?.fullName;

    return {
        title: `צ'אט עם ${peerRole}${peerName ? ` - ${peerName}` : ""}`,
        senderFallback: driverView ? "נהג" : "נוסע"
    };
}

function getIncomingChatNoticeTitle(ride, user) {
    return isAssignedDriverUser(ride, user)
        ? "מחכה לך הודעה חדשה מהנוסע"
        : "מחכה לך הודעה חדשה מהנהג";
}

function messagePreview(message) {
    const text = String(message || "").trim();
    return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function getRideParticipantInfo(ride) {
    return [
        {
            key: "passenger",
            title: "פרטי הנוסע",
            icon: "👤",
            name: ride?.passengerId?.userId?.fullName || "הנוסע",
            meta: ride?.passengerId
                ? `⭐ ${ride.passengerId.ratingAverage || 5} · ${ride.passengerId.totalRides || 0} נסיעות`
                : "פרטי הנוסע יופיעו כאן",
            muted: !ride?.passengerId
        },
        {
            key: "driver",
            title: "פרטי הנהג",
            icon: "🧑‍✈️",
            name: ride?.driverId?.userId?.fullName || "טרם שובץ נהג",
            meta: ride?.driverId
                ? `⭐ ${ride.driverId.ratingAverage || 5} · ${ride.driverId.totalRides || 0} נסיעות`
                : "נעדכן כשהנהג יקבל את הנסיעה",
            extra: [
                ride?.driverId?.preferredMusic ? `🎵 ${ride.driverId.preferredMusic}` : "",
                ride?.driverId?.hobbies?.length > 0 ? `🎯 ${ride.driverId.hobbies.join(", ")}` : ""
            ].filter(Boolean),
            muted: !ride?.driverId
        }
    ];
}

export default function RideStatusPage() {
    const { id }       = useParams();
    const navigate     = useNavigate();
    const { user }     = useAuth();
    const [ride,       setRide]       = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [driverLoc,  setDriverLoc]  = useState(null);
    const [messages,   setMessages]   = useState([]);
    const [chatText,   setChatText]   = useState("");
    const [chatOpen,   setChatOpen]   = useState(false);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [chatNotice, setChatNotice] = useState(null);
    const [sosClicked, setSosClicked] = useState(false);
    const [eta,        setEta]        = useState(null);
    const [nearbyDrivers, setNearbyDrivers] = useState([]);
    const [userLoc,    setUserLoc]    = useState(null);
    const socketRef = useRef(null);
    const chatEndRef = useRef(null);
    const chatOpenRef = useRef(false);
    const chatNoticeTitleRef = useRef("מחכה לך הודעה חדשה");
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

    useEffect(() => {
        chatOpenRef.current = chatOpen;
        if (!chatOpen) return;

        setUnreadMessages(0);
        setChatNotice(null);
        window.setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 0);
    }, [chatOpen]);

    useEffect(() => {
        chatNoticeTitleRef.current = getIncomingChatNoticeTitle(ride, user);
    }, [ride, user]);

    useEffect(() => {
        if (!chatNotice) return undefined;

        const timer = window.setTimeout(() => {
            setChatNotice(current => current?.id === chatNotice.id ? null : current);
        }, 9000);
        return () => window.clearTimeout(timer);
    }, [chatNotice]);

    const openChat = useCallback(() => {
        setChatOpen(true);
        setUnreadMessages(0);
        setChatNotice(null);
        window.setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 0);
    }, []);

    const fetchRide = useCallback(async () => {
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
    }, [id, navigate]);

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
    }, [driverLoc, ride?.pickupLocation?.lat, ride?.pickupLocation?.lng, ride?.status]);

    useEffect(() => {
        fetchRide();
        const poll = setInterval(fetchRide, 6000);

        if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();

        const socket = createSocket();
        socketRef.current = socket;
        socket.emit("join-ride", id);

        socket.on("location-update", ({ lat, lng }) => setDriverLoc({ lat, lng }));
        socket.on("new-message", (msg) => {
            const incoming = String(msg.sender || "") !== String(user?.userId || "");
            setMessages(m => [...m, msg]);
            window.setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 0);
            if (incoming && !chatOpenRef.current) {
                setUnreadMessages(count => count + 1);
                setChatNotice({
                    id: Date.now(),
                    title: chatNoticeTitleRef.current,
                    senderName: msg.senderName || "",
                    preview: messagePreview(msg.message)
                });
            }
        });
        socket.on("ride-cancelled", ({ reason }) => {
            if (reason === "auto_timeout") {
                alert("הנסיעה בוטלה אוטומטית — לא נמצא נהג תוך 30 דקות.");
                fetchRide();
            }
        });
        socket.on("sos-alert", ({ userId }) => {
            if (String(userId || "") !== String(user?.userId || "")) {
                alert("🚨 התקבלה התראת SOS בנסיעה זו.");
            }
        });

        return () => { clearInterval(poll); socket.disconnect(); };
    }, [id, fetchRide, user?.userId]);

    const cancelRide = async () => {
        if (!window.confirm("האם לבטל את הנסיעה?")) return;
        await api.put(`/rides/${id}/cancel`, { cancelledBy: "passenger" });
        fetchRide();
    };

    const handleSOS = () => {
        if (!navigator.geolocation) {
            alert("לא ניתן לשלוח SOS ללא מיקום מהמכשיר.");
            return;
        }

        setSosClicked(true);
        navigator.geolocation.getCurrentPosition(
            pos => {
                const socket = socketRef.current;
                if (!socket) {
                    setSosClicked(false);
                    alert("לא ניתן לשלוח בקשת חירום כרגע.");
                    return;
                }

                socket.timeout(5000).emit("sos", {
                    rideId: id,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                }, (error, response) => {
                    if (error) {
                        setSosClicked(false);
                        alert("לא התקבל אישור לשליחת SOS. נסה שוב.");
                        return;
                    }

                    if (response?.ok) {
                        console.info("SOS sent", response);
                        alert("🚨 בקשת חירום נשלחה! עזרה בדרך.");
                    } else {
                        setSosClicked(false);
                        alert(response?.error || "לא ניתן לשלוח בקשת חירום כרגע.");
                    }
                });
            },
            () => {
                setSosClicked(false);
                alert("לא ניתן לשלוח SOS ללא מיקום מהמכשיר.");
            }
        );
    };

    const sendMessage = () => {
        if (!chatText.trim()) return;
        socketRef.current?.emit("chat-message", {
            rideId: id, message: chatText,
            sender: user?.userId, senderName: user?.fullName || getChatPeerInfo(ride, user).senderFallback
        });
        setChatText("");
    };

    const reportComplaint = async () => {
        const reason = window.prompt("תאר את הבעיה:");
        if (!reason) return;
        await api.post("/notifications/complaint", {
            rideId: id,
            body: reason
        }).catch(() => {});
        alert("תלונתך נקלטה. צוות שלנו יבדוק בהקדם.");
    };

    const updateRideStep = async (step) => {
        await api.put(`/rides/${id}/${step}`);
        fetchRide();
    };

    if (loading) return <div className="spinner" aria-label={"טוען..."} />;
    if (!ride)   return null;

    const st = STATUS_LABELS[ride.status] || STATUS_LABELS.searching;
    const inRide = ["accepted", "driver_arriving", "in_progress"].includes(ride.status);
    const pickupLoc = ride.pickupLocation?.lat ? { lat: ride.pickupLocation.lat, lng: ride.pickupLocation.lng } : null;
    const isAssignedDriver = ride.driverId && (
        ride.driverId?._id === user?.driverId ||
        ride.driverId?.userId?._id === user?.userId ||
        user?.role === "admin"
    );
    const chatPeer = getChatPeerInfo(ride, user);
    const participantInfo = getRideParticipantInfo(ride);
    // Whether this viewer has already confirmed the ride ended.
    const myCompletionConfirmed = isAssignedDriver
        ? Boolean(ride.driverCompletedAt)
        : Boolean(ride.passengerCompletedAt);

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

            {chatNotice && !chatOpen && (
                <div style={s.chatToast} role="status" aria-live="polite">
                    <div style={s.chatToastIcon}>💬</div>
                    <div>
                        <div style={s.chatToastTitle}>{chatNotice.title}</div>
                        <div style={s.chatToastPreview}>
                            {chatNotice.senderName ? `${chatNotice.senderName}: ` : ""}{chatNotice.preview}
                        </div>
                        <button type="button" onClick={openChat} style={s.chatToastButton}>
                            פתח צ'אט
                        </button>
                    </div>
                    <button type="button" aria-label="סגור התראת הודעה" onClick={() => setChatNotice(null)} style={s.chatToastClose}>
                        ×
                    </button>
                </div>
            )}

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
                    ["📍 נקודת איסוף", ride.pickupLocation?.address],
                    ["🏁 יעד", ride.destinationLocation?.address],
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

            {/* Participants */}
            <div style={s.card}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>👥 פרטי המשתתפים</div>
                <div style={{ display: "grid", gap: 10 }}>
                    {participantInfo.map(participant => (
                        <div key={participant.key}
                            style={{
                                display: "flex", gap: 14, alignItems: "center",
                                padding: 12, borderRadius: 10, border: "1px solid var(--border)",
                                background: participant.muted ? "#f8fafc" : "var(--surface)"
                            }}>
                            <div style={{ width: 52, height: 52, borderRadius: "50%", background: participant.muted ? "#94a3b8" : "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22 }}>
                                {participant.icon}
                            </div>
                            <div>
                                <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 2 }}>{participant.title}</div>
                                <div style={{ fontWeight: 700, color: participant.muted ? "var(--text-muted)" : "var(--text)" }}>{participant.name}</div>
                                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{participant.meta}</div>
                                {participant.extra?.map(item => (
                                    <div key={item} style={{ fontSize: 12, color: "var(--text-muted)" }}>{item}</div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

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
                    <button type="button" onClick={chatOpen ? () => setChatOpen(false) : openChat}
                        style={{ ...s.chatToggle, marginBottom: chatOpen ? 12 : unreadMessages > 0 ? 8 : 0 }}>
                        <span>💬 {chatPeer.title}</span>
                        {!chatOpen && unreadMessages > 0 && (
                            <span style={s.chatBadge} aria-label={`${unreadMessages} הודעות חדשות`}>
                                {unreadMessages > 9 ? "9+" : unreadMessages}
                            </span>
                        )}
                        <span aria-hidden="true">{chatOpen ? "▲" : "▼"}</span>
                    </button>
                    {!chatOpen && unreadMessages > 0 && (
                        <div style={s.chatUnreadLine} role="status">
                            מחכה לך הודעה חדשה. לחץ לפתיחת הצ'אט.
                        </div>
                    )}
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
            {isAssignedDriver && ["accepted", "driver_arriving"].includes(ride.status) && (
                <button className="btn-primary" onClick={() => updateRideStep("start")} style={{ marginBottom: 10 }}>
                    התחל נסיעה
                </button>
            )}
            {/* A ride ends only when both sides confirm it did. */}
            {ride.status === "in_progress" && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>סיום הנסיעה</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                        הנסיעה נסגרת רק כששני הצדדים מאשרים.
                    </div>

                    <div style={{ display: "grid", gap: 6, marginBottom: 12, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>🚗 הנהג</span>
                            <span style={{ fontWeight: 700, color: ride.driverCompletedAt ? "var(--success)" : "var(--text-muted)" }}>
                                {ride.driverCompletedAt ? "✅ אישר" : "⏳ ממתין לאישור"}
                            </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>🧍 הנוסע</span>
                            <span style={{ fontWeight: 700, color: ride.passengerCompletedAt ? "var(--success)" : "var(--text-muted)" }}>
                                {ride.passengerCompletedAt ? "✅ אישר" : "⏳ ממתין לאישור"}
                            </span>
                        </div>
                    </div>

                    {myCompletionConfirmed ? (
                        <div role="status" style={{ background: "#d1fae5", color: "#065f46", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>
                            ✅ אישרת. ממתינים לאישור {isAssignedDriver ? "הנוסע" : "הנהג"}.
                        </div>
                    ) : (
                        <button className="btn-primary" onClick={() => updateRideStep("complete")} style={{ width: "100%" }}>
                            אשר שהנסיעה הסתיימה
                        </button>
                    )}
                </div>
            )}
            {["searching", "accepted", "driver_arriving"].includes(ride.status) && (
                <button onClick={cancelRide}
                    style={{ width: "100%", background: "#fee2e2", color: "var(--danger)", padding: 12, borderRadius: 10, fontSize: 15, marginBottom: 10 }}>
                    {"בטל נסיעה"}
                </button>
            )}
            {ride.status === "completed" && (
                <button className="btn-primary" onClick={() => navigate(isAssignedDriver ? `/rate/${id}?direction=driver_to_passenger` : `/payment/${id}`)}>
                    ⭐ {isAssignedDriver ? "דרג נוסע" : "המשך לתשלום"} →
                </button>
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
