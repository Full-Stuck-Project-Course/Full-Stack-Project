import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import GoogleRideMap from "../components/GoogleRideMap";
import { demandAlerts, distanceKm } from "../utils/pricing";

const driverLocation = { lat: 32.0814, lng: 34.7812 };

const demoRequests = [
    {
        _id: "local-1",
        passengerName: "נועה",
        pickupLocation: { address: "רכבת מרכז", lat: 32.0838, lng: 34.7986 },
        destinationLocation: { address: "אוניברסיטת תל אביב", lat: 32.1133, lng: 34.8044 },
        passengerCount: 1,
        rideType: "ride",
        finalPrice: 46,
        scheduledTime: null,
        rating: 4.9
    },
    {
        _id: "local-2",
        passengerName: "Amit",
        pickupLocation: { address: "דיזנגוף סנטר", lat: 32.0755, lng: 34.7753 },
        destinationLocation: { address: "בר אילן", lat: 32.0684, lng: 34.8432 },
        passengerCount: 3,
        rideType: "carpool",
        finalPrice: 64,
        scheduledTime: new Date(Date.now() + 1000 * 60 * 40).toISOString(),
        rating: 4.7
    },
    {
        _id: "local-3",
        passengerName: "ליאור",
        pickupLocation: { address: "נמל תל אביב", lat: 32.0979, lng: 34.7748 },
        destinationLocation: { address: "רמת החייל", lat: 32.1091, lng: 34.8391 },
        passengerCount: 2,
        rideType: "ride",
        finalPrice: 58,
        scheduledTime: null,
        rating: 5
    }
];

export default function DriverDashboard() {
    const { user } = useAuth();
    const [driver, setDriver] = useState(null);
    const [openRides, setOpenRides] = useState(demoRequests);
    const [status, setStatus] = useState("available");
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [driverRes, ridesRes] = await Promise.all([
                    api.get("/drivers/available"),
                    api.get("/rides", { params: { status: "searching" } })
                ]);
                if (!active) return;
                const currentDriver = driverRes.data.find(d => d.userId?._id === user.userId || d.userId === user.userId);
                setDriver(currentDriver || null);
                if (ridesRes.data?.length) setOpenRides(ridesRes.data);
            } catch {
                setNotice("מצב דמו: אין חיבור פעיל למסד הנתונים, מוצגות בקשות מקומיות.");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [user.userId]);

    const sortedRequests = useMemo(() => {
        return openRides
            .map(ride => ({
                ...ride,
                distanceToDriver: distanceKm(driverLocation, {
                    lat: ride.pickupLocation?.lat || driverLocation.lat,
                    lng: ride.pickupLocation?.lng || driverLocation.lng
                })
            }))
            .sort((a, b) => a.distanceToDriver - b.distanceToDriver);
    }, [openRides]);

    const requestMarkers = sortedRequests.map(request => ({
        title: request.pickupLocation?.address,
        location: {
            lat: request.pickupLocation?.lat || driverLocation.lat,
            lng: request.pickupLocation?.lng || driverLocation.lng
        }
    }));

    const changeStatus = async (nextStatus) => {
        setStatus(nextStatus);
        if (!driver?._id) return;
        try {
            await api.put(`/drivers/${driver._id}/status`, { status: nextStatus });
        } catch {
            setNotice("הסטטוס עודכן מקומית בלבד.");
        }
    };

    const acceptRide = async (rideId) => {
        if (!driver?._id || rideId.startsWith("local")) {
            setOpenRides(current => current.filter(ride => ride._id !== rideId));
            setNotice("הנסיעה התקבלה במצב דמו.");
            return;
        }

        await api.put(`/rides/${rideId}/accept`, { driverId: driver._id });
        setOpenRides(current => current.filter(ride => ride._id !== rideId));
    };

    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;

    return (
        <main className="page" dir="rtl">
            <section className="hero">
                <div className="panel">
                    <div className="row between wrap" style={{ marginBottom: 16 }}>
                        <div>
                            <h1>לוח נהג HailNow</h1>
                            <p className="muted">בקשות נסיעה סמוכות, רווחים, דירוגים וקנסות</p>
                        </div>
                        <span className="pill">{sortedRequests.length} בקשות פתוחות</span>
                    </div>
                    <GoogleRideMap
                        pickup={driverLocation}
                        destination={driverLocation}
                        drivers={[]}
                        requests={requestMarkers}
                        mode="driver"
                    />
                </div>

                <div className="panel stack">
                    <h2 className="section-title">סטטוס נהג</h2>
                    <div className="tab-row">
                        {[
                            ["available", "זמין"],
                            ["busy", "עסוק"],
                            ["offline", "לא מחובר"]
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                className={`tab-btn ${status === value ? "active" : ""}`}
                                onClick={() => changeStatus(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="grid three">
                        <div className="panel compact" style={{ boxShadow: "none" }}>
                            <strong>₪{driver?.totalEarnings || 1248}</strong>
                            <p className="muted">הכנסות</p>
                        </div>
                        <div className="panel compact" style={{ boxShadow: "none" }}>
                            <strong>{driver?.ratingAverage || 4.9}</strong>
                            <p className="muted">דירוג כולל</p>
                        </div>
                        <div className="panel compact" style={{ boxShadow: "none" }}>
                            <strong>₪35</strong>
                            <p className="muted">קנסות השבוע</p>
                        </div>
                    </div>

                    <h2 className="section-title">התרעות ביקוש</h2>
                    {demandAlerts().map(alert => (
                        <div key={alert.area} className="panel compact" style={{ boxShadow: "none" }}>
                            <div className="row between">
                                <strong>{alert.area}</strong>
                                <span className="pill">{alert.distanceKm} ק״מ</span>
                            </div>
                            <p className="muted">{alert.message}</p>
                        </div>
                    ))}
                </div>
            </section>

            {notice && <p className="pill" style={{ marginBottom: 16 }}>{notice}</p>}

            <section className="panel">
                <h2 className="section-title">בקשות סמוכות מסודרות לפי קרבה</h2>
                <div className="grid auto">
                    {sortedRequests.map(ride => (
                        <article key={ride._id} className="panel compact" style={{ boxShadow: "none" }}>
                            <div className="row between wrap">
                                <strong>{ride.passengerName || "נוסע"}</strong>
                                <span className="pill">{ride.distanceToDriver.toFixed(1)} ק״מ ממך</span>
                            </div>
                            <p className="muted" style={{ marginTop: 10 }}>
                                {ride.pickupLocation?.address} → {ride.destinationLocation?.address}
                            </p>
                            <div className="row wrap" style={{ marginTop: 12 }}>
                                <span className="pill">{ride.passengerCount} נוסעים</span>
                                <span className="pill">{ride.rideType === "carpool" ? "קרפול" : "נסיעה"}</span>
                                <span className="pill">דירוג נוסע {ride.rating || 5}</span>
                                <span className="pill">₪{ride.finalPrice || ride.basePrice || 45}</span>
                            </div>
                            {ride.scheduledTime && (
                                <p className="muted" style={{ marginTop: 10 }}>
                                    מוזמן ל: {new Date(ride.scheduledTime).toLocaleString("he-IL")}
                                </p>
                            )}
                            <div className="row wrap" style={{ marginTop: 14 }}>
                                <button className="primary-btn" onClick={() => acceptRide(ride._id)} disabled={status !== "available"}>
                                    קבלת נסיעה
                                </button>
                                <button className="secondary-btn" onClick={() => setOpenRides(current => current.filter(item => item._id !== ride._id))}>
                                    דחייה
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}
