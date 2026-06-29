// src/pages/RatingPage.jsx

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

export default function RatingPage() {
    const { id }       = useParams();
    const navigate     = useNavigate();
    const { t }        = useLang();
    const TAGS = ["נסיעה נעימה", "נהיגה בטוחה", "ניקיון", "שיחה נעימה", "זמן הגעה", "מוזיקה טובה"];
    const [ride,       setRide]     = useState(null);
    const [stars,      setStars]    = useState(0);
    const [hovered,    setHovered]  = useState(0);
    const [comment,    setComment]  = useState("");
    const [tags,       setTags]     = useState([]);
    const [wouldAgain, setAgain]    = useState(true);
    const [complaint,  setComplaint] = useState("");
    const [showComplaint, setShowC] = useState(false);
    const [loading,    setLoading]  = useState(false);
    const [error,      setError]    = useState("");
    const [done,       setDone]     = useState(false);

    useEffect(() => {
        api.get(`/rides/${id}`).then(r => setRide(r.data)).catch(() => navigate("/"));
    }, [id]);

    const toggleTag = (tag) => setTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]);

    const submit = async () => {
        if (stars === 0) return setError("נא לתת דירוג");
        setError("");
        setLoading(true);
        try {
            await api.post("/ratings", {
                rideId:      id,
                rating:      stars,
                comment,
                tags,
                wouldRideAgain: wouldAgain,
                complaint:   complaint || undefined
            });
            setDone(true);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בשליחת הדירוג");
        } finally {
            setLoading(false);
        }
    };

    if (done) return (
        <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ textAlign: "center" }} className="fade-in">
                <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
                <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{"תודה על הדירוג!"}</h1>
                <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>{"הדירוג שלך עוזר לנהגים להשתפר ולנוסעים אחרים לבחור."}</p>
                <div style={{ background: "#fef3c7", borderRadius: 12, padding: 16, marginBottom: 20, display: "inline-block" }}>
                    <span style={{ fontWeight: 700 }}>{"✨ +10 נקודות נאמנות נצברו!"}</span>
                </div>
                <br />
                <button className="btn-primary" style={{ maxWidth: 280 }} onClick={() => navigate("/")}>
                    {"בית"} ←
                </button>
            </div>
        </div>
    );

    return (
        <div style={{ padding: "28px 20px", maxWidth: 500, margin: "0 auto" }} className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>🏁</div>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>{"הנסיעה הושלמה!"}</h1>
                <p style={{ color: "var(--text-muted)", marginTop: 4 }}>{"איך הייתה הנסיעה?"}</p>
            </div>

            {/* Driver card */}
            {ride?.driverId && (
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)", marginBottom: 20, display: "flex", gap: 14, alignItems: "center" }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24 }}>🧑</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{ride.driverId.userId?.fullName || "הנהג שלך"}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>⭐ {ride.driverId.ratingAverage} · {ride.driverId.totalRides} נסיעות</div>
                        {ride.driverId.preferredMusic && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>🎵 {ride.driverId.preferredMusic}</div>}
                    </div>
                </div>
            )}

            {/* Stars */}
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 14 }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12 }}>{"דירוג כוכבים"}</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                            <span key={n} className="star"
                                style={{ color: n <= (hovered || stars) ? "#f59e0b" : "#e2e8f0", fontSize: 36 }}
                                onMouseEnter={() => setHovered(n)}
                                onMouseLeave={() => setHovered(0)}
                                onClick={() => setStars(n)}
                                role="radio" aria-checked={stars === n}
                                tabIndex={0}
                                onKeyDown={e => e.key === "Enter" && setStars(n)}
                                aria-label={t("starsLabel", { n })}>
                                ★
                            </span>
                        ))}
                    </div>
                    {stars > 0 && (
                        <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)" }}>
                            {["", "לא טוב", "בסדר", "טוב", "מצוין", "מושלם!"][stars]}
                        </div>
                    )}
                </div>

                {/* Quick tags */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                    {TAGS.map(tag => (
                        <span key={tag}
                            onClick={() => toggleTag(tag)}
                            style={{
                                padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                                border: `1.5px solid ${tags.includes(tag) ? "var(--primary)" : "var(--border)"}`,
                                background: tags.includes(tag) ? "rgba(79,70,229,0.08)" : "var(--surface)",
                                color: tags.includes(tag) ? "var(--primary)" : "var(--text-muted)",
                                fontWeight: tags.includes(tag) ? 700 : 400
                            }}>
                            {tags.includes(tag) ? "✓ " : ""}{tag}
                        </span>
                    ))}
                </div>

                {/* Comment */}
                <textarea
                    placeholder={"הוסף תגובה" + "..."}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                    maxLength={500}
                    style={{ resize: "vertical", marginBottom: 12 }}
                />

                {/* Would ride again */}
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, marginBottom: 12 }}>
                    <input type="checkbox" checked={wouldAgain} onChange={e => setAgain(e.target.checked)} />
                    {"הייתי נוסע שוב עם נהג זה"}
                </label>

                {/* Complaint toggle */}
                <button type="button" onClick={() => setShowC(c => !c)}
                    style={{ background: "none", color: "var(--danger)", fontSize: 13, padding: 0, fontWeight: 500 }}>
                    ⚑ {"הגש תלונה"} {showC ? "▲" : "▼"}
                </button>
                {showC && (
                    <textarea
                        placeholder={"תאר את הבעיה..."}
                        value={complaint}
                        onChange={e => setComplaint(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        style={{ marginTop: 8, resize: "vertical", borderColor: "var(--danger)" }}
                    />
                )}
            </div>

            {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

            <button className="btn-primary" onClick={submit} disabled={loading}>
                {loading ? "טוען..." : `${"שלח"} ⭐`}
            </button>

            <button type="button" onClick={() => navigate("/")}
                style={{ width: "100%", background: "none", color: "var(--text-muted)", marginTop: 10, fontSize: 14 }}>
                {"דלג"}
            </button>
        </div>
    );
}
