// src/pages/RatingPage.jsx

import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "../routing";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const RATING_DIRECTIONS = {
    PASSENGER_TO_DRIVER: "passenger_to_driver",
    DRIVER_TO_PASSENGER: "driver_to_passenger"
};

const DRIVER_TAGS = [
    "נסיעה נעימה",
    "נהיגה בטוחה",
    "ניקיון",
    "שיחה נעימה",
    "זמן הגעה",
    "מוזיקה טובה"
];

const PASSENGER_TAGS = [
    "הגעה בזמן",
    "תקשורת טובה",
    "כיבד את הרכב",
    "התנהגות נעימה",
    "קל לאיסוף",
    "ישמור על כללי הנסיעה"
];

const COPY = {
    [RATING_DIRECTIONS.PASSENGER_TO_DRIVER]: {
        doneTitle: "תודה על הדירוג!",
        doneText: "הדירוג שלך עוזר לנהגים להשתפר ולנוסעים אחרים לבחור.",
        targetFallback: "הנהג שלך",
        targetTitle: "פרטי הנהג",
        targetIcon: "🧑",
        headline: "הנסיעה הושלמה!",
        subtitle: "איך הייתה הנסיעה?",
        commentPlaceholder: "הוסף תגובה...",
        wouldAgain: "הייתי נוסע שוב עם נהג זה",
        complaintToggle: "הגש תלונה",
        complaintPlaceholder: "תאר את הבעיה...",
        submit: "שלח",
        skip: "דלג",
        home: "בית",
        successRoute: "/",
        rewardText: "+10 נקודות נאמנות נצברו!"
    },
    [RATING_DIRECTIONS.DRIVER_TO_PASSENGER]: {
        doneTitle: "תודה על דירוג הנוסע!",
        doneText: "הדירוג שלך עוזר לשמור על נסיעות נעימות ובטוחות לנהגים.",
        targetFallback: "הנוסע",
        targetTitle: "פרטי הנוסע",
        targetIcon: "👤",
        headline: "הנסיעה הושלמה!",
        subtitle: "איך הייתה החוויה עם הנוסע?",
        commentPlaceholder: "הוסף הערה על הנוסע...",
        wouldAgain: "הייתי מסיע נוסע זה שוב",
        complaintToggle: "דווח על בעיה",
        complaintPlaceholder: "תאר את הבעיה עם הנוסע...",
        submit: "שלח דירוג נוסע",
        skip: "דלג",
        home: "לוח נהג",
        successRoute: "/driver",
        rewardText: ""
    }
};

function getStarAriaLabel(n) {
    return n === 1 ? "כוכב אחד" : `${n} כוכבים`;
}

function getRatingText(stars) {
    return ["", "לא טוב", "בסדר", "טוב", "מצוין", "מושלם!"][stars];
}

export default function RatingPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const requestedDirection = searchParams.get("direction");
    const isDriverRatingPassenger =
        requestedDirection === RATING_DIRECTIONS.DRIVER_TO_PASSENGER ||
        (!requestedDirection && user?.role === "driver");
    const direction = isDriverRatingPassenger
        ? RATING_DIRECTIONS.DRIVER_TO_PASSENGER
        : RATING_DIRECTIONS.PASSENGER_TO_DRIVER;
    const copy = COPY[direction];
    const quickTags = isDriverRatingPassenger ? PASSENGER_TAGS : DRIVER_TAGS;

    const [ride, setRide] = useState(null);
    const [stars, setStars] = useState(0);
    const [hovered, setHovered] = useState(0);
    const [comment, setComment] = useState("");
    const [tags, setTags] = useState([]);
    const [wouldAgain, setAgain] = useState(true);
    const [complaint, setComplaint] = useState("");
    const [showComplaint, setShowC] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    useEffect(() => {
        api.get(`/rides/${id}`).then(r => setRide(r.data)).catch(() => navigate("/"));
    }, [id, navigate]);

    useEffect(() => {
        setTags([]);
        setStars(0);
        setHovered(0);
        setComment("");
        setComplaint("");
        setShowC(false);
        setAgain(true);
        setError("");
    }, [direction]);

    const target = isDriverRatingPassenger ? ride?.passengerId : ride?.driverId;
    const targetName = target?.userId?.fullName || copy.targetFallback;
    const targetRating = target?.ratingAverage;
    const targetRides = target?.totalRides;

    const toggleTag = (tag) => setTags(prev =>
        prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]
    );

    const handleStarKeyDown = (event, n) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setStars(n);
        }
    };

    const submit = async () => {
        if (stars === 0) return setError("נא לתת דירוג");
        setError("");
        setLoading(true);
        try {
            await api.post("/ratings", {
                rideId: id,
                direction,
                rating: stars,
                comment,
                tags,
                wouldRideAgain: wouldAgain,
                complaint: complaint || undefined
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
                <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{copy.doneTitle}</h1>
                <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>{copy.doneText}</p>
                {!isDriverRatingPassenger && (
                    <div style={{ background: "#fef3c7", borderRadius: 12, padding: 16, marginBottom: 20, display: "inline-block" }}>
                        <span style={{ fontWeight: 700 }}>✨ {copy.rewardText}</span>
                    </div>
                )}
                <br />
                <button className="btn-primary" style={{ maxWidth: 280 }} onClick={() => navigate(copy.successRoute)}>
                    {copy.home} ←
                </button>
            </div>
        </div>
    );

    return (
        <div style={{ padding: "28px 20px", maxWidth: 500, margin: "0 auto" }} className="fade-in">
            <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 44, marginBottom: 8 }}>🏁</div>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>{copy.headline}</h1>
                <p style={{ color: "var(--text-muted)", marginTop: 4 }}>{copy.subtitle}</p>
            </div>

            {target && (
                <div style={{ background: "var(--surface)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)", marginBottom: 20, display: "flex", gap: 14, alignItems: "center" }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24 }}>{copy.targetIcon}</div>
                    <div>
                        <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 2 }}>{copy.targetTitle}</div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{targetName}</div>
                        {(targetRating || targetRides) && (
                            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                                ⭐ {targetRating || 5} · {targetRides || 0} נסיעות
                            </div>
                        )}
                        {!isDriverRatingPassenger && ride?.driverId?.preferredMusic && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>🎵 {ride.driverId.preferredMusic}</div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 14 }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12 }}>דירוג כוכבים</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 6 }} role="radiogroup" aria-label="דירוג כוכבים">
                        {[1, 2, 3, 4, 5].map(n => (
                            <span key={n} className="star"
                                style={{ color: n <= (hovered || stars) ? "#f59e0b" : "#e2e8f0", fontSize: 36 }}
                                onMouseEnter={() => setHovered(n)}
                                onMouseLeave={() => setHovered(0)}
                                onClick={() => setStars(n)}
                                role="radio" aria-checked={stars === n}
                                tabIndex={0}
                                onKeyDown={e => handleStarKeyDown(e, n)}
                                aria-label={getStarAriaLabel(n)}>
                                ★
                            </span>
                        ))}
                    </div>
                    {stars > 0 && (
                        <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)" }}>
                            {getRatingText(stars)}
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                    {quickTags.map(tag => (
                        <button key={tag} type="button"
                            onClick={() => toggleTag(tag)}
                            style={{
                                padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                                border: `1.5px solid ${tags.includes(tag) ? "var(--primary)" : "var(--border)"}`,
                                background: tags.includes(tag) ? "rgba(79,70,229,0.08)" : "var(--surface)",
                                color: tags.includes(tag) ? "var(--primary)" : "var(--text-muted)",
                                fontWeight: tags.includes(tag) ? 700 : 400
                            }}>
                            {tags.includes(tag) ? "✓ " : ""}{tag}
                        </button>
                    ))}
                </div>

                <textarea
                    placeholder={copy.commentPlaceholder}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                    maxLength={500}
                    style={{ resize: "vertical", marginBottom: 12 }}
                />

                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, marginBottom: 12 }}>
                    <input type="checkbox" checked={wouldAgain} onChange={e => setAgain(e.target.checked)} />
                    {copy.wouldAgain}
                </label>

                <button type="button" onClick={() => setShowC(c => !c)}
                    style={{ background: "none", color: "var(--danger)", fontSize: 13, padding: 0, fontWeight: 500 }}>
                    ⚑ {copy.complaintToggle} {showComplaint ? "▲" : "▼"}
                </button>
                {showComplaint && (
                    <textarea
                        placeholder={copy.complaintPlaceholder}
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
                {loading ? "טוען..." : `${copy.submit} ⭐`}
            </button>

            <button type="button" onClick={() => navigate(copy.successRoute)}
                style={{ width: "100%", background: "none", color: "var(--text-muted)", marginTop: 10, fontSize: 14 }}>
                {copy.skip}
            </button>
        </div>
    );
}
