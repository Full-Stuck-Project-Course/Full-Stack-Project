// src/pages/PaymentSimulationPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "../routing";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const PHASES = {
    form: "form",
    verifying: "verifying",
    processing: "processing",
    approved: "approved"
};

const s = {
    page: { padding: "28px 20px 40px", maxWidth: 560, margin: "0 auto" },
    header: { textAlign: "center", marginBottom: 20 },
    icon: { fontSize: 42, marginBottom: 8 },
    title: { fontSize: 24, fontWeight: 800, marginBottom: 4 },
    subtitle: { color: "var(--text-muted)", fontSize: 14 },
    card: {
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 20,
        boxShadow: "var(--shadow)",
        marginBottom: 14
    },
    amountBox: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "#f8fafc",
        padding: "14px 18px",
        marginBottom: 16
    },
    amountLabel: { color: "var(--text-muted)", fontSize: 13, fontWeight: 700 },
    amount: { display: "inline-flex", alignItems: "baseline", gap: 7, fontSize: 28, fontWeight: 900 },
    shekel: { fontSize: 20, color: "var(--text-muted)", lineHeight: 1 },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    label: { display: "grid", gap: 5, fontSize: 13, color: "var(--text-muted)", fontWeight: 700 },
    helper: { color: "var(--text-muted)", fontSize: 12, marginTop: 6 },
    statusBox: {
        display: "grid",
        gridTemplateColumns: "40px 1fr",
        gap: 12,
        alignItems: "center",
        borderRadius: 12,
        padding: 14,
        background: "#eef2ff",
        border: "1px solid #c7d2fe",
        marginBottom: 14
    },
    statusIcon: {
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "var(--primary)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900
    },
    successBox: {
        textAlign: "center",
        background: "var(--surface)",
        border: "1px solid #bbf7d0",
        borderRadius: 12,
        padding: 24,
        boxShadow: "var(--shadow)",
        marginBottom: 14
    },
    secondaryBtn: {
        width: "100%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        marginTop: 8
    },
    savedCardBox: {
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 14
    },
    checkRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--text-muted)",
        fontSize: 13,
        fontWeight: 700,
        marginTop: 12
    },
    receipt: {
        textAlign: "start",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 16px",
        marginTop: 16,
        display: "grid",
        gap: 8
    },
    receiptRow: {
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        color: "var(--text-muted)"
    }
};

export function formatCardNumber(value) {
    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 19)
        .replace(/(.{4})/g, "$1 ")
        .trim();
}

function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatAmount(value) {
    return Number(value || 0).toLocaleString("he-IL", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
}

function validateForm(form, minExpiry) {
    const cardNumber = digitsOnly(form.cardNumber);
    const cvv = digitsOnly(form.cvv);

    if (!form.cardholderName.trim()) return "נא להזין שם בעל הכרטיס";
    if (cardNumber.length < 12 || cardNumber.length > 19) return "מספר הכרטיס לא תקין";
    if (!form.expiry || form.expiry < minExpiry) return "תוקף הכרטיס לא תקין";
    if (!/^\d{3,4}$/.test(cvv)) return "CVV לא תקין";
    return "";
}

function cardBrandLabel(brand) {
    const labels = {
        visa: "Visa",
        mastercard: "Mastercard",
        amex: "American Express",
        other: "כרטיס אשראי"
    };
    return labels[brand] || labels.other;
}

function hasSavedPaymentMethod(method) {
    return Boolean(method?.cardLast4 && method?.expiry);
}

function idOf(value) {
    if (!value) return "";
    return String(value?._id || value);
}

function profileBelongsToCurrentUser(profile, user) {
    return Boolean(idOf(profile?.userId?._id || profile?.userId) && idOf(profile?.userId?._id || profile?.userId) === idOf(user?.userId));
}

function carpoolPassengerIds(ride) {
    return new Set((ride?.carpoolPassengers || [])
        .map(seat => idOf(seat?.passengerId?._id || seat?.passengerId))
        .filter(Boolean));
}

function passengerForCurrentRide(ride, passengers, user) {
    const primaryPassengerId = idOf(ride?.passengerId?._id || ride?.passengerId);
    const carpoolIds = carpoolPassengerIds(ride);
    const currentPassenger = (passengers || []).find(profile => profileBelongsToCurrentUser(profile, user));
    const currentPassengerId = idOf(currentPassenger?._id);

    if (currentPassenger && (currentPassengerId === primaryPassengerId || carpoolIds.has(currentPassengerId))) {
        return currentPassenger;
    }

    return (passengers || []).find(profile => idOf(profile._id) === primaryPassengerId) || null;
}

function amountForPassenger(ride, passenger) {
    const passengerId = idOf(passenger?._id);
    const seat = currentCarpoolSeatForPassenger(ride, passenger);
    if (seat?.finalPrice !== undefined) return seat.finalPrice;

    const pricePerSeat = Number(seat?.pricePerSeat);
    const seatsNeeded = Number(seat?.seatsNeeded || 1);
    if (Number.isFinite(pricePerSeat) && pricePerSeat >= 0) {
        return Number((pricePerSeat * seatsNeeded).toFixed(2));
    }

    return ride?.finalPrice ?? ride?.estimatedPrice ?? 0;
}

function currentCarpoolSeatForPassenger(ride, passenger) {
    const passengerId = idOf(passenger?._id);
    if (!passengerId) return null;
    return (ride?.carpoolPassengers || [])
        .find(item => idOf(item?.passengerId?._id || item?.passengerId) === passengerId) || null;
}

function passengerCanPayRide(ride, passenger) {
    if (ride?.status === "completed") return true;
    if (ride?.rideType !== "carpool") return false;

    const seat = currentCarpoolSeatForPassenger(ride, passenger);
    if (seat) return Boolean(seat.passengerCompletedAt || seat.status === "completed");

    const passengerId = idOf(passenger?._id);
    const primaryPassengerId = idOf(ride?.passengerId?._id || ride?.passengerId);
    return Boolean(passengerId && passengerId === primaryPassengerId && ride?.passengerCompletedAt);
}

export default function PaymentSimulationPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [ride, setRide] = useState(null);
    const [payment, setPayment] = useState(null);
    const [passenger, setPassenger] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [phase, setPhase] = useState(PHASES.form);
    const [error, setError] = useState("");
    const [showManualCard, setShowManualCard] = useState(false);
    const [savePaymentMethod, setSavePaymentMethod] = useState(false);
    const [form, setForm] = useState({
        cardholderName: "",
        cardNumber: "",
        expiry: "",
        cvv: ""
    });
    const timers = useRef([]);
    const active = useRef(true);
    const minExpiry = useMemo(getCurrentMonth, []);

    useEffect(() => {
        active.current = true;

        async function load() {
            setLoading(true);
            setError("");
            try {
                const rideRes = await api.get(`/rides/${id}`);
                if (!active.current) return;
                setRide(rideRes.data);

                const passengerRes = await api.get("/passengers").catch(() => ({ data: [] }));
                if (!active.current) return;
                const passengerProfile = passengerForCurrentRide(rideRes.data, passengerRes.data || [], user);
                setPassenger(passengerProfile);
                setShowManualCard(!hasSavedPaymentMethod(passengerProfile?.defaultPaymentMethod));

                try {
                    const paymentRes = await api.get(`/payments/ride/${id}`);
                    if (!active.current) return;
                    setPayment(paymentRes.data);
                    if (paymentRes.data?.paymentStatus === "paid") setPhase(PHASES.approved);
                } catch (paymentError) {
                    if (paymentError.response?.status !== 404) throw paymentError;
                }
            } catch (loadError) {
                if (active.current) setError(loadError.response?.data?.error || "טעינת פרטי התשלום נכשלה");
            } finally {
                if (active.current) setLoading(false);
            }
        }

        load();

        return () => {
            active.current = false;
            timers.current.forEach(clearTimeout);
            timers.current = [];
        };
    }, [id, user?.userId]);

    const amount = payment?.amount ?? amountForPassenger(ride, passenger);
    const currentCarpoolSeat = currentCarpoolSeatForPassenger(ride, passenger);
    const disabled = submitting || phase !== PHASES.form;
    const isApproved = phase === PHASES.approved || payment?.paymentStatus === "paid";
    const canPay = passengerCanPayRide(ride, passenger);
    const paymentLockedMessage = ride?.rideType === "carpool" && currentCarpoolSeat
        ? "ניתן לשלם אחרי שתאשר שהחלק שלך בנסיעה הסתיים."
        : "ניתן לשלם רק אחרי שהנסיעה הושלמה.";
    const savedPaymentMethod = passenger?.defaultPaymentMethod;
    const hasSavedCard = hasSavedPaymentMethod(savedPaymentMethod);
    const useSavedCard = hasSavedCard && !showManualCard;

    const updateField = (field, value) => {
        setForm(prev => ({
            ...prev,
            [field]: field === "cardNumber" ? formatCardNumber(value) : value
        }));
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!useSavedCard) {
            const validationError = validateForm(form, minExpiry);
            if (validationError) {
                setError(validationError);
                return;
            }
        }

        setError("");
        setSubmitting(true);
        setPhase(PHASES.verifying);

        timers.current.push(window.setTimeout(() => {
            if (active.current) setPhase(PHASES.processing);
        }, 750));

        timers.current.push(window.setTimeout(async () => {
            try {
                const payload = useSavedCard
                    ? { useSavedPaymentMethod: true }
                    : {
                        cardholderName: form.cardholderName,
                        cardNumber: form.cardNumber,
                        expiry: form.expiry,
                        cvv: form.cvv,
                        savePaymentMethod
                    };
                const res = await api.post(`/payments/ride/${id}/simulate`, payload);
                if (!active.current) return;
                setPayment(res.data.payment);
                if (res.data.passenger) {
                    setPassenger(res.data.passenger);
                    setShowManualCard(false);
                    setSavePaymentMethod(false);
                }
                setPhase(PHASES.approved);
            } catch (submitError) {
                if (!active.current) return;
                setError(submitError.response?.data?.error || "אישור התשלום נכשל");
                setPhase(PHASES.form);
            } finally {
                if (active.current) setSubmitting(false);
            }
        }, 1600));
    };

    if (loading) return <div className="spinner" aria-label="טוען..." />;

    if (!canPay && !isApproved) {
        return (
            <div style={s.page} className="fade-in">
                <div style={s.successBox}>
                    <div style={s.icon}>⏳</div>
                    <h1 style={s.title}>התשלום עדיין לא פתוח</h1>
                    <p style={s.subtitle}>{paymentLockedMessage}</p>
                    <button className="btn-primary" style={{ marginTop: 18 }} onClick={() => navigate(`/ride/${id}`)}>
                        חזור לנסיעה
                    </button>
                </div>
            </div>
        );
    }

    if (isApproved) {
        return (
            <div style={s.page} className="fade-in">
                <div style={s.successBox} role="status">
                    <div style={{ fontSize: 56, marginBottom: 10 }}>✓</div>
                    <h1 style={s.title}>התשלום אושר</h1>
                    <p style={s.subtitle}>
                        הכרטיס אומת והתשלום נקלט
                        {payment?.cardLast4 ? ` · כרטיס מסתיים ב-${payment.cardLast4}` : ""}.
                    </p>
                    <div style={s.receipt}>
                        <div style={s.receiptRow}>
                            <span>סכום</span>
                            <strong>₪{formatAmount(amount)}</strong>
                        </div>
                        {payment?.cardLast4 && (
                            <div style={s.receiptRow}>
                                <span>אמצעי תשלום</span>
                                <strong dir="ltr">•••• {payment.cardLast4}</strong>
                            </div>
                        )}
                        {payment?.paidAt && (
                            <div style={s.receiptRow}>
                                <span>מועד</span>
                                <strong>{new Date(payment.paidAt).toLocaleString("he-IL")}</strong>
                            </div>
                        )}
                        {payment?.transactionId && (
                            <div style={s.receiptRow}>
                                <span>אסמכתה</span>
                                <strong dir="ltr" style={{ fontSize: 11 }}>{payment.transactionId}</strong>
                            </div>
                        )}
                    </div>
                    <p style={{ ...s.helper, marginTop: 12 }}>נשלחה אליך התראה על אישור התשלום.</p>
                </div>
                <button className="btn-primary" onClick={() => navigate(`/rate/${id}?direction=passenger_to_driver`)}>
                    דרג את הנסיעה
                </button>
                <button type="button" style={s.secondaryBtn} onClick={() => navigate(`/ride/${id}`)}>
                    חזור לפרטי הנסיעה
                </button>
            </div>
        );
    }

    return (
        <div style={s.page} className="fade-in">
            <div style={s.header}>
                <div style={s.icon}>💳</div>
                <h1 style={s.title}>תשלום בכרטיס אשראי</h1>
                <p style={s.subtitle}>הזן את פרטי הכרטיס — האישור אוטומטי ומיידי</p>
            </div>

            <form style={s.card} onSubmit={submit}>
                <div style={s.amountBox}>
                    <span style={s.amountLabel}>סכום לתשלום</span>
                    <strong style={s.amount}>
                        <span style={s.shekel}>₪</span>
                        <span>{formatAmount(amount)}</span>
                    </strong>
                </div>

                {phase !== PHASES.form && (
                    <div style={s.statusBox} role="status" aria-live="polite">
                        <div style={s.statusIcon}>{phase === PHASES.verifying ? "1" : "2"}</div>
                        <div>
                            <div style={{ fontWeight: 800 }}>
                                {phase === PHASES.verifying ? "מאמת פרטי כרטיס" : "מעבד אישור תשלום"}
                            </div>
                            <div style={s.helper}>
                                {phase === PHASES.verifying ? "בודק תוקף, ספרות וזיהוי בסיסי" : "מעדכן את רשומת התשלום במערכת"}
                            </div>
                        </div>
                    </div>
                )}

                {useSavedCard ? (
                    <div style={s.savedCardBox}>
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>כרטיס שמור בפרופיל</div>
                        <div style={{ fontSize: 14 }}>
                            {cardBrandLabel(savedPaymentMethod.cardBrand)} · <strong dir="ltr">•••• {savedPaymentMethod.cardLast4}</strong>
                        </div>
                        <div style={s.helper}>בתוקף עד {savedPaymentMethod.expiry}</div>
                        <button type="button" style={s.secondaryBtn} onClick={() => setShowManualCard(true)} disabled={disabled}>
                            השתמש בכרטיס אחר
                        </button>
                    </div>
                ) : (
                    <>
                        {hasSavedCard && (
                            <button type="button" style={s.secondaryBtn} onClick={() => setShowManualCard(false)} disabled={disabled}>
                                חזור לכרטיס השמור
                            </button>
                        )}

                <label style={s.label}>
                    <span>שם בעל הכרטיס</span>
                    <input
                        autoComplete="cc-name"
                        value={form.cardholderName}
                        onChange={e => updateField("cardholderName", e.target.value)}
                        disabled={disabled}
                    />
                </label>

                <label style={{ ...s.label, marginTop: 10 }}>
                    <span>מספר כרטיס</span>
                    <input
                        autoComplete="cc-number"
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="1234 5678 9012 3456"
                        maxLength={23}
                        value={form.cardNumber}
                        onChange={e => updateField("cardNumber", e.target.value)}
                        disabled={disabled}
                    />
                </label>

                <div style={{ ...s.grid, marginTop: 10 }}>
                    <label style={s.label}>
                        <span>תוקף</span>
                        <input
                            type="month"
                            autoComplete="cc-exp"
                            min={minExpiry}
                            value={form.expiry}
                            onChange={e => updateField("expiry", e.target.value)}
                            disabled={disabled}
                        />
                    </label>
                    <label style={s.label}>
                        <span>CVV</span>
                        <input
                            autoComplete="cc-csc"
                            inputMode="numeric"
                            dir="ltr"
                            maxLength={4}
                            value={form.cvv}
                            onChange={e => updateField("cvv", digitsOnly(e.target.value).slice(0, 4))}
                            disabled={disabled}
                        />
                    </label>
                </div>

                        <label style={s.checkRow}>
                            <input
                                type="checkbox"
                                checked={savePaymentMethod}
                                onChange={e => setSavePaymentMethod(e.target.checked)}
                                disabled={disabled}
                            />
                            שמור את הכרטיס בפרופיל לתשלומים הבאים
                        </label>
                    </>
                )}

                {error && <p className="error-msg" role="alert">{error}</p>}

                <button className="btn-primary" type="submit" disabled={disabled} style={{ marginTop: 16 }}>
                    {submitting ? "מאמת..." : useSavedCard ? "שלם עם הכרטיס השמור" : "אשר תשלום"}
                </button>
            </form>
        </div>
    );
}
