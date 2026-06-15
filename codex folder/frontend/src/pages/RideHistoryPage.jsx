import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const demoRides = [
    {
        _id: "history-1",
        status: "completed",
        pickupLocation: { address: "דיזנגוף סנטר" },
        destinationLocation: { address: "בר אילן" },
        finalPrice: 58,
        passengerCount: 2,
        rideType: "ride",
        loyaltyPoints: 19,
        cancellationFee: 0,
        rating: 5,
        createdAt: new Date().toISOString()
    },
    {
        _id: "history-2",
        status: "cancelled",
        pickupLocation: { address: "נמל תל אביב" },
        destinationLocation: { address: "רכבת מרכז" },
        finalPrice: 0,
        passengerCount: 1,
        rideType: "carpool",
        loyaltyPoints: 0,
        cancellationFee: 6,
        rating: null,
        createdAt: new Date(Date.now() - 86400000).toISOString()
    }
];

const statusLabels = {
    completed: "הושלם",
    cancelled: "בוטל",
    in_progress: "בתהליך",
    searching: "מחפש נהג",
    accepted: "נקבע נהג",
    driver_arriving: "נהג בדרך"
};

export default function RideHistoryPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data } = await api.get("/rides", {
                    params: { passengerId: user.passengerId || user.userId }
                });
                if (active) setRides(data);
            } catch {
                if (active) {
                    setRides(demoRides);
                    setNotice("מצב דמו: מוצגת היסטוריה מקומית.");
                }
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [user]);

    const filtered = filter === "all" ? rides : rides.filter(r => r.status === filter);

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;

    return (
        <main className="page page-narrow" dir="rtl">
            <section className="panel">
                <div className="row between wrap" style={{ marginBottom: 20 }}>
                    <div>
                        <h1>היסטוריית נסיעות</h1>
                        <p className="muted">נסיעות קודמות, קרפול, נקודות וקנסות ביטול</p>
                    </div>
                    <span className="pill">{filtered.length} רשומות</span>
                </div>

                {notice && <p className="pill" style={{ marginBottom: 16 }}>{notice}</p>}

                <div className="tab-row" style={{ marginBottom: 22 }}>
                    {["all", "completed", "cancelled"].map(f => (
                        <button key={f} className={`tab-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                            {f === "all" ? "הכל" : f === "completed" ? "הושלמו" : "בוטלו"}
                        </button>
                    ))}
                </div>

                <div className="stack">
                    {filtered.length === 0 ? (
                        <p className="muted">אין נסיעות להצגה</p>
                    ) : filtered.map(ride => (
                        <article
                            key={ride._id}
                            className="panel compact"
                            style={{ boxShadow: "none", cursor: "pointer" }}
                            onClick={() => navigate(`/ride/${ride._id}`)}
                        >
                            <div className="row between wrap">
                                <strong>{ride.pickupLocation?.address} → {ride.destinationLocation?.address}</strong>
                                <span className="pill">{statusLabels[ride.status] || ride.status}</span>
                            </div>
                            <div className="row wrap" style={{ marginTop: 12 }}>
                                <span className="pill">{new Date(ride.createdAt).toLocaleDateString("he-IL")}</span>
                                <span className="pill">₪{ride.finalPrice || 0}</span>
                                <span className="pill">{ride.passengerCount} נוסעים</span>
                                <span className="pill">{ride.rideType === "carpool" ? "קרפול" : "נסיעה"}</span>
                                <span className="pill">{ride.loyaltyPoints || Math.round((ride.finalPrice || 0) / 3)} נקודות</span>
                                {ride.cancellationFee > 0 && <span className="pill">קנס ₪{ride.cancellationFee}</span>}
                                {ride.rating && <span className="pill">דירוג {ride.rating}</span>}
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}
