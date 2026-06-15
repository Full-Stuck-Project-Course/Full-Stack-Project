import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import GoogleRideMap from "../components/GoogleRideMap";
import { sampleDrivers } from "../utils/pricing";

const statusLabels = {
    searching: "מחפש נהג",
    accepted: "נהג נמצא",
    driver_arriving: "הנהג בדרך אליך",
    in_progress: "הנסיעה בעיצומה",
    completed: "הנסיעה הושלמה",
    cancelled: "הנסיעה בוטלה"
};

const fallbackRide = {
    status: "in_progress",
    rideType: "ride",
    pickupLocation: { address: "דיזנגוף סנטר, תל אביב", lat: 32.0755, lng: 34.7753 },
    destinationLocation: { address: "אוניברסיטת בר אילן", lat: 32.0684, lng: 34.8432 },
    finalPrice: 58,
    passengerCount: 2,
    cancellationFee: 7,
    driverId: {
        _id: "driver-1",
        ratingAverage: 4.95,
        totalRides: 328,
        preferredMusic: "ישראלי רגוע",
        hobbies: ["טיולים"]
    }
};

export default function RideStatusPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showChat, setShowChat] = useState(false);
    const [rating, setRating] = useState(5);
    const [complaint, setComplaint] = useState("");
    const [feedback, setFeedback] = useState("");
    const [notice, setNotice] = useState("");

    const fetchRide = async () => {
        try {
            const { data } = await api.get(`/rides/${id}`);
            setRide(data);
        } catch {
            setRide(fallbackRide);
            setNotice("מצב דמו: פרטי הנסיעה מוצגים מקומית.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRide();
        const interval = setInterval(fetchRide, 5000);
        return () => clearInterval(interval);
    }, [id]);

    const cancelRide = async () => {
        const confirmed = window.confirm(`לבטל את הנסיעה? ייתכן קנס ביטול של ₪${ride.cancellationFee || 0}`);
        if (!confirmed) return;
        try {
            await api.put(`/rides/${id}/cancel`, {
                cancelledBy: "passenger",
                cancellationReason: "Passenger cancelled from HailNow",
                cancellationFee: ride.cancellationFee || 0
            });
            fetchRide();
        } catch {
            setRide(current => ({ ...current, status: "cancelled" }));
        }
    };

    const completeDemo = () => setRide(current => ({ ...current, status: "completed" }));

    const submitRating = async () => {
        try {
            await api.post("/ratings", {
                rideId: id,
                passengerId: ride.passengerId?._id || ride.passengerId || "000000000000000000000000",
                driverId: ride.driverId?._id || ride.driverId || "000000000000000000000000",
                rating,
                comment: feedback,
                complaint
            });
        } catch {
            setNotice("הדירוג נשמר במצב דמו.");
        }
        navigate("/history");
    };

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;
    if (!ride) return null;

    const driver = sampleDrivers[0];
    const isActive = ["searching", "accepted", "driver_arriving", "in_progress"].includes(ride.status);

    return (
        <main className="page" dir="rtl">
            <section className="hero">
                <div className="panel">
                    <div className="row between wrap" style={{ marginBottom: 16 }}>
                        <div>
                            <h1>סטטוס נסיעה</h1>
                            <p className="muted">{statusLabels[ride.status] || statusLabels.searching}</p>
                        </div>
                        <span className="pill">מיקום בזמן אמת</span>
                    </div>
                    <GoogleRideMap
                        pickup={ride.pickupLocation}
                        destination={ride.destinationLocation}
                        drivers={[driver]}
                        selectedDriverId={driver.id}
                    />
                </div>

                <div className="panel stack">
                    {notice && <p className="pill">{notice}</p>}
                    <div className="row between">
                        <span>איסוף</span>
                        <strong>{ride.pickupLocation?.address}</strong>
                    </div>
                    <div className="row between">
                        <span>יעד</span>
                        <strong>{ride.destinationLocation?.address}</strong>
                    </div>
                    <div className="row between">
                        <span>סוג נסיעה</span>
                        <strong>{ride.rideType === "carpool" ? "קרפול" : "נסיעה"}</strong>
                    </div>
                    <div className="row between">
                        <span>מחיר</span>
                        <strong>₪{ride.finalPrice || ride.basePrice || 0}</strong>
                    </div>
                    <div className="row between">
                        <span>נוסעים</span>
                        <strong>{ride.passengerCount}</strong>
                    </div>

                    <div className="panel compact" style={{ boxShadow: "none" }}>
                        <h2 className="section-title">פרטי נהג</h2>
                        <p><strong>{driver.name}</strong> · {driver.vehicle}</p>
                        <p className="muted">דירוג {driver.rating} · {driver.licensePlate}</p>
                        <p className="muted">מוזיקה/תחביב לשיחה: {driver.music}, {driver.hobby}</p>
                    </div>

                    {isActive && (
                        <div className="grid two">
                            <button className="secondary-btn" onClick={() => window.location.href = "tel:100"}>שיחה עם הנהג</button>
                            <button className="secondary-btn" onClick={() => setShowChat(!showChat)}>צ׳אט</button>
                            <button className="success-btn" onClick={() => navigator.clipboard?.writeText(window.location.href)}>שיתוף נסיעה</button>
                            <button className="danger-btn" onClick={() => alert("כפתור חירום הופעל. במוצר אמיתי תישלח התראה למוקד ולאיש קשר.")}>חירום</button>
                        </div>
                    )}

                    {showChat && (
                        <div className="panel compact" style={{ boxShadow: "none" }}>
                            <p><strong>נהג:</strong> אני בדרך, מגיע בעוד 3 דקות.</p>
                            <textarea placeholder="כתבי הודעה לנהג..." />
                            <button className="primary-btn" type="button">שליחה</button>
                        </div>
                    )}

                    {["searching", "accepted", "driver_arriving"].includes(ride.status) && (
                        <button className="danger-btn" onClick={cancelRide}>ביטול נסיעה עם בדיקת קנס</button>
                    )}

                    {ride.status !== "completed" && ride.status !== "cancelled" && (
                        <button className="primary-btn" onClick={completeDemo}>סיום נסיעה והמשך לדירוג</button>
                    )}
                </div>
            </section>

            {ride.status === "completed" && (
                <section className="panel page-narrow" style={{ marginTop: 20 }}>
                    <h2 className="section-title">דירוג הנהג</h2>
                    <div className="tab-row" style={{ marginBottom: 16 }}>
                        {[1, 2, 3, 4, 5].map(star => (
                            <button
                                key={star}
                                type="button"
                                className={`tab-btn ${rating === star ? "active" : ""}`}
                                onClick={() => setRating(star)}
                            >
                                {star}
                            </button>
                        ))}
                    </div>
                    <div className="stack">
                        <textarea value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="משוב על הנהיגה, ניקיון, יחס או מסלול" />
                        <textarea value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="תלונה על הנהג במהלך/אחרי הנסיעה, אם יש" />
                        <button className="primary-btn" onClick={submitRating}>שליחת דירוג</button>
                    </div>
                </section>
            )}
        </main>
    );
}
