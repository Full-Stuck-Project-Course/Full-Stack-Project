import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import GoogleRideMap from "../components/GoogleRideMap";
import { geocodeAddress, getDistanceMatrix } from "../utils/googleMaps";
import { estimateRidePrice, sampleDrivers, sortDrivers } from "../utils/pricing";

const defaultPickup = { lat: 32.0809, lng: 34.7806 };
const defaultDestination = { lat: 32.1093, lng: 34.8555 };

export default function BookRidePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [rideType, setRideType] = useState(params.get("type") === "carpool" ? "carpool" : "ride");
    const [form, setForm] = useState({
        pickupAddress: "דיזנגוף סנטר, תל אביב",
        destAddress: "אוניברסיטת בר אילן",
        pickup: defaultPickup,
        destination: defaultDestination,
        passengerCount: 1,
        splitCount: 1,
        scheduledTime: "",
        trafficLevel: "medium",
        vehicleType: "regular",
        preferredMatching: "closest",
        preferredGender: "any",
        preferredLanguage: "both",
        stop1: "",
        stop2: ""
    });
    const [selectedDriverId, setSelectedDriverId] = useState(sampleDrivers[0].id);
    const [quote, setQuote] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const set = (key, val) => setForm(current => ({ ...current, [key]: val }));

    const filteredDrivers = useMemo(() => {
        return sampleDrivers
            .filter(driver => form.preferredGender === "any" || driver.gender === form.preferredGender)
            .filter(driver => form.preferredLanguage === "both" || driver.languages.includes(form.preferredLanguage));
    }, [form.preferredGender, form.preferredLanguage]);

    const sortedDrivers = useMemo(() => {
        return sortDrivers(filteredDrivers, form.pickup, form.preferredMatching);
    }, [filteredDrivers, form.pickup, form.preferredMatching]);

    const selectedDriver = sortedDrivers.find(driver => driver.id === selectedDriverId) || sortedDrivers[0] || sampleDrivers[0];
    const stopCount = [form.stop1, form.stop2].filter(Boolean).length;

    const calculate = async () => {
        setLoading(true);
        setError("");
        try {
            const pickup = await geocodeAddress(form.pickupAddress, form.pickup);
            const destination = await geocodeAddress(form.destAddress, form.destination);
            set("pickup", pickup);
            set("destination", destination);

            const [googleTrip, googleDriverToPickup] = await Promise.all([
                getDistanceMatrix(pickup, destination),
                getDistanceMatrix(selectedDriver.location, pickup)
            ]);

            let nextQuote;
            try {
                const { data } = await api.post("/pricing/estimate", {
                    pickupLocation: pickup,
                    destinationLocation: destination,
                    driverLocation: selectedDriver.location,
                    passengerCount: form.passengerCount,
                    paymentSplitCount: form.splitCount,
                    stopCount,
                    rideType,
                    trafficLevel: form.trafficLevel,
                    vehicleType: form.vehicleType
                });
                nextQuote = {
                    tripKm: data.distanceKm,
                    driverKm: data.driverToPickupKm,
                    durationMinutes: data.estimatedDurationMinutes,
                    trafficMultiplier: data.surgeMultiplier,
                    carMultiplier: 1,
                    total: data.finalPrice,
                    perPassenger: data.perPassengerPrice,
                    cancellationFee: data.cancellationFee,
                    points: data.loyaltyPoints,
                    bestDeparture: data.bestDepartureTip
                };
            } catch {
                nextQuote = estimateRidePrice({
                    driver: selectedDriver,
                    pickup,
                    destination,
                    passengerCount: form.passengerCount,
                    splitCount: form.splitCount,
                    stopCount,
                    rideType,
                    trafficLevel: form.trafficLevel,
                    vehicleType: form.vehicleType,
                    googleTrip,
                    googleDriverToPickup
                });
            }

            setQuote(nextQuote);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const activeQuote = quote || estimateRidePrice({
            driver: selectedDriver,
            pickup: form.pickup,
            destination: form.destination,
            passengerCount: form.passengerCount,
            splitCount: form.splitCount,
            stopCount,
            rideType,
            trafficLevel: form.trafficLevel,
            vehicleType: form.vehicleType
        });

        setLoading(true);
        setError("");
        try {
            const { data } = await api.post("/rides", {
                passengerId: user.passengerId || user.userId,
                rideType,
                pickupLocation: { address: form.pickupAddress, ...form.pickup },
                destinationLocation: { address: form.destAddress, ...form.destination },
                passengerCount: Number(form.passengerCount),
                scheduledTime: form.scheduledTime || null,
                distanceKm: activeQuote.tripKm,
                estimatedDurationMinutes: activeQuote.durationMinutes,
                basePrice: activeQuote.total,
                finalPrice: activeQuote.total,
                surgeMultiplier: activeQuote.trafficMultiplier,
                cancellationFee: activeQuote.cancellationFee,
                stops: [form.stop1, form.stop2].filter(Boolean).map(address => ({ address })),
                paymentSplitCount: Number(form.splitCount),
                perPassengerPrice: activeQuote.perPassenger,
                loyaltyPoints: activeQuote.points,
                bestDepartureTip: activeQuote.bestDeparture,
                driverPreference: {
                    matching: form.preferredMatching,
                    gender: form.preferredGender,
                    language: form.preferredLanguage
                }
            });
            navigate(`/ride/${data.ride._id}`);
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה ביצירת הנסיעה");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="page" dir="rtl">
            <section className="hero">
                <div className="panel">
                    <div className="row between wrap" style={{ marginBottom: 16 }}>
                        <div>
                            <h1>הזמנת נסיעה</h1>
                            <p className="muted">מחיר לפי מרחק, עומס, מיקום נהג וסוג רכב</p>
                        </div>
                        <span className="pill">{sortedDrivers.length} נהגים בסביבה</span>
                    </div>

                    <GoogleRideMap
                        pickup={form.pickup}
                        destination={form.destination}
                        drivers={sortedDrivers}
                        selectedDriverId={selectedDriver.id}
                        onDriverSelect={setSelectedDriverId}
                    />
                </div>

                <form className="panel stack" onSubmit={handleSubmit}>
                    <div className="tab-row">
                        <button type="button" className={`tab-btn ${rideType === "ride" ? "active" : ""}`} onClick={() => setRideType("ride")}>
                            נסיעה פרטית
                        </button>
                        <button type="button" className={`tab-btn ${rideType === "carpool" ? "active" : ""}`} onClick={() => setRideType("carpool")}>
                            קרפול מוזל
                        </button>
                    </div>

                    <div>
                        <label htmlFor="pickupAddress">נקודת איסוף</label>
                        <input id="pickupAddress" value={form.pickupAddress} onChange={e => set("pickupAddress", e.target.value)} />
                    </div>
                    <div>
                        <label htmlFor="destAddress">יעד</label>
                        <input id="destAddress" value={form.destAddress} onChange={e => set("destAddress", e.target.value)} />
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="passengerCount">מספר נוסעים</label>
                            <select id="passengerCount" value={form.passengerCount} onChange={e => set("passengerCount", Number(e.target.value))}>
                                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="splitCount">פיצול תשלום</label>
                            <select id="splitCount" value={form.splitCount} onChange={e => set("splitCount", Number(e.target.value))}>
                                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} משלמים</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="vehicleType">סוג רכב</label>
                            <select id="vehicleType" value={form.vehicleType} onChange={e => set("vehicleType", e.target.value)}>
                                <option value="regular">רגיל</option>
                                <option value="comfort">נוח</option>
                                <option value="luxury">יוקרתי</option>
                                <option value="van">גדול</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="trafficLevel">עומס</label>
                            <select id="trafficLevel" value={form.trafficLevel} onChange={e => set("trafficLevel", e.target.value)}>
                                <option value="low">נמוך</option>
                                <option value="medium">בינוני</option>
                                <option value="high">גבוה</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="preferredMatching">בחירת נהג לפי</label>
                            <select id="preferredMatching" value={form.preferredMatching} onChange={e => set("preferredMatching", e.target.value)}>
                                <option value="closest">קרבה</option>
                                <option value="highest_rated">דירוג</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="preferredGender">העדפת נהג/ת</label>
                            <select id="preferredGender" value={form.preferredGender} onChange={e => set("preferredGender", e.target.value)}>
                                <option value="any">אין העדפה</option>
                                <option value="female">אישה</option>
                                <option value="male">גבר</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="preferredLanguage">שפת נהג</label>
                            <select id="preferredLanguage" value={form.preferredLanguage} onChange={e => set("preferredLanguage", e.target.value)}>
                                <option value="both">עברית/English</option>
                                <option value="he">עברית</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="scheduledTime">הזמנה לזמן מסוים</label>
                            <input id="scheduledTime" type="datetime-local" value={form.scheduledTime} onChange={e => set("scheduledTime", e.target.value)} />
                        </div>
                    </div>

                    <div className="grid two">
                        <div>
                            <label htmlFor="stop1">עצירה 1</label>
                            <input id="stop1" value={form.stop1} onChange={e => set("stop1", e.target.value)} placeholder="אופציונלי" />
                        </div>
                        <div>
                            <label htmlFor="stop2">עצירה 2</label>
                            <input id="stop2" value={form.stop2} onChange={e => set("stop2", e.target.value)} placeholder="אופציונלי" />
                        </div>
                    </div>

                    <button type="button" className="secondary-btn" onClick={calculate} disabled={loading}>
                        {loading ? "מחשבת..." : "חשב מחיר לפי Google Maps"}
                    </button>

                    <div className="panel compact" style={{ boxShadow: "none" }}>
                        <h2 className="section-title">נהג מוצע</h2>
                        <div className="row between wrap">
                            <div>
                                <strong>{selectedDriver.name}</strong>
                                <p className="muted">{selectedDriver.vehicle} · {selectedDriver.licensePlate}</p>
                                <p className="muted">מוזיקה/תחביב: {selectedDriver.music}, {selectedDriver.hobby}</p>
                            </div>
                            <span className="pill">דירוג {selectedDriver.rating}</span>
                        </div>
                    </div>

                    <div className="panel compact" style={{ boxShadow: "none" }}>
                        <h2 className="section-title">מחיר משוער</h2>
                        {quote ? (
                            <div className="stack">
                                <div className="row between"><span>מרחק נסיעה</span><strong>{quote.tripKm} ק״מ</strong></div>
                                <div className="row between"><span>מרחק הנהג לאיסוף</span><strong>{quote.driverKm} ק״מ</strong></div>
                                <div className="row between"><span>משך משוער</span><strong>{quote.durationMinutes} דקות</strong></div>
                                <div className="row between"><span>סה״כ</span><strong>₪{quote.total}</strong></div>
                                <div className="row between"><span>למשלם בפיצול</span><strong>₪{quote.perPassenger}</strong></div>
                                <div className="row between"><span>קנס ביטול אפשרי</span><strong>₪{quote.cancellationFee}</strong></div>
                                <div className="row between"><span>נקודות נוסע</span><strong>{quote.points}</strong></div>
                                <p className="pill">{quote.bestDeparture}</p>
                            </div>
                        ) : (
                            <p className="muted">לחצי על חישוב מחיר כדי לקבל הערכת מחיר לפי המרחק והעומס.</p>
                        )}
                    </div>

                    {error && <p className="error-msg">{error}</p>}

                    <button type="submit" className="primary-btn" disabled={loading}>
                        {loading ? "מחפשת נהג..." : "הזמנת נסיעה"}
                    </button>
                </form>
            </section>
        </main>
    );
}
