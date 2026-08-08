// src/pages/PaymentSimulationPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "../routing";
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

export default function PaymentSimulationPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ride, setRide] = useState(null);
    const [payment, setPayment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [phase, setPhase] = useState(PHASES.form);
    const [error, setError] = useState("");
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
    }, [id]);

    const amount = payment?.amount ?? ride?.finalPrice ?? ride?.estimatedPrice ?? 0;
    const disabled = submitting || phase !== PHASES.form;
    const isApproved = phase === PHASES.approved || payment?.paymentStatus === "paid";
    const canPay = ride?.status === "completed";

    const updateField = (field, value) => {
        setForm(prev => ({
            ...prev,
            [field]: field === "cardNumber" ? formatCardNumber(value) : value
        }));
    };

    const submit = async (event) => {
        event.preventDefault();
        const validationError = validateForm(form, minExpiry);
        if (validationError) {
            setError(validationError);
            return;
        }

        setError("");
        setSubmitting(true);
        setPhase(PHASES.verifying);

        timers.current.push(window.setTimeout(() => {
            if (active.current) setPhase(PHASES.processing);
        }, 750));

        timers.current.push(window.setTimeout(async () => {
            try {
                const res = await api.post(`/payments/ride/${id}/simulate`, {
                    cardholderName: form.cardholderName,
                    cardNumber: form.cardNumber,
                    expiry: form.expiry,
                    cvv: form.cvv
                });
                if (!active.current) return;
                setPayment(res.data.payment);
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
                    <p style={s.subtitle}>ניתן לשלם רק אחרי שהנסיעה הושלמה.</p>
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
                        התשלום על הנסיעה אושר עם סיומה — לא נדרשת פעולה נוספת
                        {payment?.cardLast4 ? ` · כרטיס מסתיים ב-${payment.cardLast4}` : ""}.
                    </p>
                    <p style={{ ...s.helper, marginTop: 8 }}>נשלחה אליך התראה על אישור התשלום.</p>
                    {payment?.transactionId && (
                        <div style={{ ...s.helper, marginTop: 10 }}>Transaction: {payment.transactionId}</div>
                    )}
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
                <h1 style={s.title}>תשלום נסיעה</h1>
                <p style={s.subtitle}>אימות תשלום מדומה לסיום הנסיעה</p>
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

                {error && <p className="error-msg" role="alert">{error}</p>}

                <button className="btn-primary" type="submit" disabled={disabled} style={{ marginTop: 16 }}>
                    {submitting ? "מאמת..." : "אשר תשלום"}
                </button>
            </form>
        </div>
    );
}
