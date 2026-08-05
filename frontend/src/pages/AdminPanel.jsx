// src/pages/AdminPanel.jsx

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { assetUrl, secureUploadPath } from "../api/assets";
import { createSocket } from "../api/socket";
import { useNavigate, useSearchParams } from "../routing";

const tabs = [
    { key: "users", label: "משתמשים" },
    { key: "drivers", label: "נהגים" },
    { key: "vehicles", label: "רכבים" },
    { key: "rides", label: "נסיעות" },
    { key: "payments", label: "תשלומים" },
    { key: "verifications", label: "אימותים" }
];

const rideStatuses = ["searching", "accepted", "driver_arriving", "in_progress", "completed", "cancelled"];
const driverStatuses = ["available", "busy", "offline"];
const paymentStatuses = ["pending", "paid", "failed", "refunded"];
const roles = ["passenger", "driver", "both", "admin"];
const languages = ["he", "en"];
const vehicleTypes = ["regular", "comfort", "luxury", "van"];

const s = {
    page: { padding: "24px 18px 40px", maxWidth: 1180, margin: "0 auto" },
    titleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 },
    title: { fontSize: 22, fontWeight: 800 },
    subtitle: { color: "var(--text-muted)", fontSize: 13 },
    tabs: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 },
    tab: (active) => ({
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid",
        borderColor: active ? "var(--primary)" : "var(--border)",
        background: active ? "var(--primary)" : "var(--surface)",
        color: active ? "#fff" : "var(--text)",
        fontWeight: 700
    }),
    panel: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, boxShadow: "var(--shadow)" },
    toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 },
    grid: { display: "grid", gap: 10 },
    row: { border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "grid", gap: 10 },
    rowHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
    rowTitle: { fontWeight: 800, fontSize: 15 },
    meta: { color: "var(--text-muted)", fontSize: 12 },
    fields: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 },
    actions: { display: "flex", flexWrap: "wrap", gap: 6 },
    label: { display: "grid", gap: 3, fontSize: 12, color: "var(--text-muted)", fontWeight: 700 },
    smallBtn: {
        padding: "7px 10px",
        borderRadius: 7,
        fontSize: 12,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text)"
    },
    primaryBtn: { padding: "7px 12px", borderRadius: 7, fontSize: 12, background: "var(--primary)", color: "#fff" },
    dangerBtn: { padding: "7px 10px", borderRadius: 7, fontSize: 12, background: "#fee2e2", color: "var(--danger)" },
    successBtn: { padding: "7px 10px", borderRadius: 7, fontSize: 12, background: "var(--success)", color: "#fff" },
    msg: (error) => ({
        padding: "10px 12px",
        borderRadius: 8,
        marginBottom: 12,
        color: error ? "#991b1b" : "#065f46",
        background: error ? "#fee2e2" : "#d1fae5",
        fontWeight: 700,
        fontSize: 13
    }),
    image: { width: 92, height: 64, borderRadius: 7, objectFit: "cover", border: "1px solid var(--border)" },
    split: { display: "grid", gridTemplateColumns: "minmax(260px, 360px) 1fr", gap: 12 },
    formBox: { border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "grid", gap: 8, alignSelf: "start" }
};

function safeText(value, fallback = "-") {
    return value === undefined || value === null || value === "" ? fallback : String(value);
}

function formatMoney(value) {
    const number = Number(value || 0);
    return `${number.toFixed(1)} ILS`;
}

function SecureImage({ path, alt }) {
    const [src, setSrc] = useState("");

    useEffect(() => {
        if (!path) return undefined;
        let active = true;
        let objectUrl = "";
        const apiPath = secureUploadPath(path);
        if (!apiPath) return undefined;
        api.get(apiPath, { responseType: "blob" })
            .then(({ data }) => {
                if (!active) return;
                objectUrl = URL.createObjectURL(data);
                setSrc(objectUrl);
            })
            .catch(() => {});
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [path]);

    if (!src) return null;
    return <img src={src} alt={alt} style={s.image} />;
}

function Field({ label, children }) {
    return <label style={s.label}><span>{label}</span>{children}</label>;
}

function Empty({ text = "אין נתונים להצגה" }) {
    return <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>{text}</div>;
}

export default function AdminPanel() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const initialTab = tabs.some(item => item.key === requestedTab) ? requestedTab : "users";
    const [tab, setTab] = useState(initialTab);
    const [data, setData] = useState({
        users: [],
        passengers: [],
        drivers: [],
        vehicles: [],
        rides: [],
        payments: [],
        pendingIds: [],
        pendingLicenses: [],
        pendingVehicles: []
    });
    const [drafts, setDrafts] = useState({});
    const [createRideDraft, setCreateRideDraft] = useState({
        passengerId: "",
        rideType: "ride",
        passengerCount: 1,
        pickupAddress: "",
        pickupLat: "",
        pickupLng: "",
        destinationAddress: "",
        destinationLat: "",
        destinationLng: ""
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ text: "", error: false });
    const navigate = useNavigate();

    const selectTab = (nextTab) => {
        setTab(nextTab);
        setSearchParams({ tab: nextTab }, { replace: true });
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [
                users,
                passengers,
                drivers,
                vehicles,
                rides,
                payments,
                pending
            ] = await Promise.all([
                api.get("/users"),
                api.get("/passengers"),
                api.get("/drivers"),
                api.get("/vehicles"),
                api.get("/rides"),
                api.get("/payments"),
                api.get("/uploads/pending")
            ]);
            setData({
                users: users.data || [],
                passengers: passengers.data || [],
                drivers: drivers.data || [],
                vehicles: vehicles.data || [],
                rides: rides.data || [],
                payments: payments.data || [],
                pendingIds: pending.data?.pendingIds || [],
                pendingLicenses: pending.data?.pendingLicenses || [],
                pendingVehicles: pending.data?.pendingVehicles || []
            });
        } catch (error) {
            setMsg({ text: error.response?.data?.error || "טעינת נתוני אדמין נכשלה", error: true });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (tabs.some(item => item.key === requestedTab) && requestedTab !== tab) setTab(requestedTab);
    }, [requestedTab, tab]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const socket = createSocket();
        socket.on("sos-alert", ({ rideId }) => {
            if (rideId && window.confirm("התקבלה התראת SOS. לפתוח את פרטי הנסיעה?")) navigate(`/ride/${rideId}`);
        });
        return () => socket.disconnect();
    }, [navigate]);

    const passengerOptions = useMemo(() => data.passengers.map(passenger => ({
        id: passenger._id,
        label: `${passenger.userId?.fullName || "נוסע"} (${passenger.userId?.email || passenger._id})`
    })), [data.passengers]);

    const driverOptions = useMemo(() => data.drivers.map(driver => ({
        id: driver._id,
        label: `${driver.userId?.fullName || "נהג"} (${driver.licenseNumber || driver._id})`
    })), [data.drivers]);

    const vehicleOptions = useMemo(() => data.vehicles.map(vehicle => ({
        id: vehicle._id,
        driverId: vehicle.driverId?._id || vehicle.driverId,
        label: `${vehicle.company || ""} ${vehicle.model || ""} ${vehicle.licensePlate || ""}`.trim() || vehicle._id
    })), [data.vehicles]);

    const setDraft = (type, id, key, value) => {
        setDrafts(prev => ({
            ...prev,
            [`${type}:${id}`]: {
                ...prev[`${type}:${id}`],
                [key]: value
            }
        }));
    };

    const draft = (type, id, base = {}) => ({ ...base, ...(drafts[`${type}:${id}`] || {}) });

    const runAction = async (label, fn) => {
        setSaving(true);
        setMsg({ text: "", error: false });
        try {
            await fn();
            setMsg({ text: label, error: false });
            await load();
        } catch (error) {
            setMsg({ text: error.response?.data?.error || error.message || "הפעולה נכשלה", error: true });
        } finally {
            setSaving(false);
        }
    };

    const confirmHardDelete = (user) => {
        const typed = window.prompt(`מחיקה קשה של ${user.fullName || user.email}. הקלד DELETE כדי לאשר.`);
        return typed === "DELETE";
    };

    const saveUser = (user) => {
        const current = draft("user", user._id, {
            fullName: user.fullName || "",
            phone: user.phone || "",
            preferredLanguage: user.preferredLanguage || "he",
            role: user.role || "passenger",
            isActive: user.isActive !== false
        });
        return runAction("המשתמש עודכן", () => api.put(`/users/${user._id}`, current));
    };

    const saveDriver = (driver) => {
        const current = draft("driver", driver._id, {
            licenseNumber: driver.licenseNumber || "",
            gender: driver.gender || "male",
            preferredMusic: driver.preferredMusic || "",
            licenseExpiry: driver.licenseExpiry ? String(driver.licenseExpiry).slice(0, 10) : "",
            acceptsCarpoolRides: driver.acceptsCarpoolRides !== false
        });
        return runAction("פרטי הנהג עודכנו", () => api.put(`/drivers/${driver._id}`, current));
    };

    const saveVehicle = (vehicle) => {
        const current = draft("vehicle", vehicle._id, {
            company: vehicle.company || "",
            model: vehicle.model || "",
            year: vehicle.year || "",
            color: vehicle.color || "",
            licensePlate: vehicle.licensePlate || "",
            vehicleType: vehicle.vehicleType || "regular",
            seats: vehicle.seats || 4,
            allowPets: vehicle.allowPets !== false,
            isActive: vehicle.isActive !== false
        });
        return runAction("הרכב עודכן", () => api.put(`/vehicles/${vehicle._id}`, current));
    };

    const createRide = () => runAction("הנסיעה נוצרה", () => api.post("/rides", {
        passengerId: createRideDraft.passengerId,
        rideType: createRideDraft.rideType,
        passengerCount: Number(createRideDraft.passengerCount || 1),
        pickupLocation: {
            address: createRideDraft.pickupAddress,
            lat: Number(createRideDraft.pickupLat),
            lng: Number(createRideDraft.pickupLng)
        },
        destinationLocation: {
            address: createRideDraft.destinationAddress,
            lat: Number(createRideDraft.destinationLat),
            lng: Number(createRideDraft.destinationLng)
        }
    }));

    if (loading) return <div className="spinner" aria-label="טוען" />;

    return (
        <div style={s.page} className="fade-in">
            <div style={s.titleRow}>
                <div>
                    <h1 style={s.title}>פאנל ניהול HailNow</h1>
                    <div style={s.subtitle}>ניהול משתמשים, אימותים, נהגים, רכבים, נסיעות ותשלומים</div>
                </div>
                <button style={s.primaryBtn} onClick={load} disabled={saving}>רענן</button>
            </div>

            {msg.text && <div style={s.msg(msg.error)}>{msg.text}</div>}

            <div style={s.tabs}>
                {tabs.map(item => (
                    <button key={item.key} style={s.tab(tab === item.key)} onClick={() => selectTab(item.key)}>
                        {item.label}
                    </button>
                ))}
            </div>

            <div style={s.panel}>
                {tab === "users" && (
                    <section style={s.grid}>
                        <div style={s.toolbar}>
                            <strong>משתמשים ({data.users.length})</strong>
                            <span style={s.meta}>עריכה, חסימה/הפעלה, איפוס סיסמה ומחיקות</span>
                        </div>
                        {data.users.length === 0 ? <Empty /> : data.users.map(user => {
                            const current = draft("user", user._id, {
                                fullName: user.fullName || "",
                                phone: user.phone || "",
                                preferredLanguage: user.preferredLanguage || "he",
                                role: user.role || "passenger",
                                isActive: user.isActive !== false
                            });
                            return (
                                <div key={user._id} style={s.row}>
                                    <div style={s.rowHead}>
                                        <div>
                                            <div style={s.rowTitle}>{safeText(user.fullName)} <span style={s.meta}>#{user._id}</span></div>
                                            <div style={s.meta}>{safeText(user.email)} · {safeText(user.phone)} · {user.isActive === false ? "חסום" : "פעיל"}</div>
                                        </div>
                                        {user.profileImage && <img src={assetUrl(user.profileImage)} alt="תמונת פרופיל" style={s.image} />}
                                    </div>
                                    <div style={s.fields}>
                                        <Field label="שם מלא"><input value={current.fullName} onChange={e => setDraft("user", user._id, "fullName", e.target.value)} /></Field>
                                        <Field label="טלפון"><input value={current.phone} onChange={e => setDraft("user", user._id, "phone", e.target.value)} /></Field>
                                        <Field label="שפה"><select value={current.preferredLanguage} onChange={e => setDraft("user", user._id, "preferredLanguage", e.target.value)}>{languages.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
                                        <Field label="Role"><select value={current.role} onChange={e => setDraft("user", user._id, "role", e.target.value)}>{roles.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
                                        <Field label="פעילות"><select value={String(current.isActive)} onChange={e => setDraft("user", user._id, "isActive", e.target.value === "true")}><option value="true">פעיל</option><option value="false">חסום</option></select></Field>
                                    </div>
                                    <div style={s.actions}>
                                        <button style={s.primaryBtn} disabled={saving} onClick={() => saveUser(user)}>שמור</button>
                                        <button style={s.smallBtn} disabled={saving} onClick={() => runAction("קישור איפוס נשלח", () => api.post(`/users/${user._id}/password-reset`))}>שלח איפוס סיסמה</button>
                                        <button style={s.smallBtn} disabled={saving} onClick={() => runAction("תמונת פרופיל נמחקה", () => api.delete(`/uploads/profile/${user._id}`))}>מחק תמונת פרופיל</button>
                                        <button style={s.successBtn} disabled={saving} onClick={() => runAction("תעודת הזהות אושרה", () => api.put(`/uploads/verify-id/${user._id}`, { status: "approved" }))}>אשר ת.ז.</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => runAction("תעודת הזהות נדחתה", () => api.put(`/uploads/verify-id/${user._id}`, { status: "rejected" }))}>דחה ת.ז.</button>
                                        <button style={s.smallBtn} disabled={saving} onClick={() => runAction("סטטוס ת.ז. אופס", () => api.put(`/uploads/verify-id/${user._id}`, { status: "not_submitted" }))}>אפס ת.ז.</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => runAction("תמונת ID נמחקה", () => api.delete(`/uploads/id-photo/${user._id}`))}>מחק ID</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => window.confirm("לבצע מחיקה רגילה למשתמש?") && runAction("המשתמש נמחק", () => api.delete(`/users/${user._id}`))}>מחק משתמש</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => confirmHardDelete(user) && runAction("המשתמש נמחק קשה", () => api.delete(`/users/${user._id}/hard`))}>מחיקה קשה</button>
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                {tab === "drivers" && (
                    <section style={s.grid}>
                        <div style={s.toolbar}><strong>נהגים ({data.drivers.length})</strong><span style={s.meta}>עריכת פרטים, סטטוס ואימות רישיון</span></div>
                        {data.drivers.length === 0 ? <Empty /> : data.drivers.map(driver => {
                            const current = draft("driver", driver._id, {
                                licenseNumber: driver.licenseNumber || "",
                                gender: driver.gender || "male",
                                preferredMusic: driver.preferredMusic || "",
                                licenseExpiry: driver.licenseExpiry ? String(driver.licenseExpiry).slice(0, 10) : "",
                                acceptsCarpoolRides: driver.acceptsCarpoolRides !== false,
                                status: driver.status || "offline"
                            });
                            return (
                                <div key={driver._id} style={s.row}>
                                    <div style={s.rowHead}>
                                        <div>
                                            <div style={s.rowTitle}>{safeText(driver.userId?.fullName, "נהג")}</div>
                                            <div style={s.meta}>{safeText(driver.userId?.email)} · רישיון {safeText(driver.licenseNumber)} · {safeText(driver.verificationStatus)}</div>
                                        </div>
                                        {driver.licenseImagePath && <SecureImage path={driver.licenseImagePath} alt="צילום רישיון" />}
                                    </div>
                                    <div style={s.fields}>
                                        <Field label="מספר רישיון"><input value={current.licenseNumber} onChange={e => setDraft("driver", driver._id, "licenseNumber", e.target.value)} /></Field>
                                        <Field label="מגדר"><select value={current.gender} onChange={e => setDraft("driver", driver._id, "gender", e.target.value)}><option value="male">male</option><option value="female">female</option></select></Field>
                                        <Field label="תוקף רישיון"><input type="date" value={current.licenseExpiry} onChange={e => setDraft("driver", driver._id, "licenseExpiry", e.target.value)} /></Field>
                                        <Field label="מוזיקה"><input value={current.preferredMusic} onChange={e => setDraft("driver", driver._id, "preferredMusic", e.target.value)} /></Field>
                                        <Field label="Carpool"><select value={String(current.acceptsCarpoolRides)} onChange={e => setDraft("driver", driver._id, "acceptsCarpoolRides", e.target.value === "true")}><option value="true">מקבל</option><option value="false">לא מקבל</option></select></Field>
                                        <Field label="סטטוס"><select value={current.status} onChange={e => setDraft("driver", driver._id, "status", e.target.value)}>{driverStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
                                    </div>
                                    <div style={s.actions}>
                                        <button style={s.primaryBtn} disabled={saving} onClick={() => saveDriver(driver)}>שמור פרטים</button>
                                        <button style={s.smallBtn} disabled={saving} onClick={() => runAction("סטטוס הנהג עודכן", () => api.put(`/drivers/${driver._id}/status`, { status: current.status }))}>שמור סטטוס</button>
                                        <button style={s.successBtn} disabled={saving} onClick={() => runAction("הנהג אושר", () => api.put(`/uploads/verify-driver/${driver._id}`, { status: "approved" }))}>אשר נהג</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => runAction("הנהג נדחה", () => api.put(`/uploads/verify-driver/${driver._id}`, { status: "rejected" }))}>דחה נהג</button>
                                        <button style={s.smallBtn} disabled={saving} onClick={() => runAction("אימות הנהג אופס", () => api.put(`/uploads/verify-driver/${driver._id}`, { status: "not_submitted" }))}>אפס אימות</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => runAction("צילום הרישיון נמחק", () => api.delete(`/uploads/license/${driver._id}`))}>מחק צילום רישיון</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => window.confirm("למחוק את פרופיל הנהג וכל הרכבים שלו? המשתמש יישאר ויוכל להגדיר נהג מחדש.") && runAction("פרופיל הנהג נמחק", () => api.delete(`/drivers/${driver._id}`))}>מחק נהג</button>
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                {tab === "vehicles" && (
                    <section style={s.grid}>
                        <div style={s.toolbar}><strong>רכבים ({data.vehicles.length})</strong><span style={s.meta}>עריכת פרטי רכב, הפעלה/השבתה ואימות מסמכים</span></div>
                        {data.vehicles.length === 0 ? <Empty /> : data.vehicles.map(vehicle => {
                            const current = draft("vehicle", vehicle._id, {
                                company: vehicle.company || "",
                                model: vehicle.model || "",
                                year: vehicle.year || "",
                                color: vehicle.color || "",
                                licensePlate: vehicle.licensePlate || "",
                                vehicleType: vehicle.vehicleType || "regular",
                                seats: vehicle.seats || 4,
                                allowPets: vehicle.allowPets !== false,
                                isActive: vehicle.isActive !== false
                            });
                            return (
                                <div key={vehicle._id} style={s.row}>
                                    <div style={s.rowHead}>
                                        <div>
                                            <div style={s.rowTitle}>{safeText(vehicle.company)} {safeText(vehicle.model, "")}</div>
                                            <div style={s.meta}>{safeText(vehicle.licensePlate)} · {safeText(vehicle.documentsVerificationStatus)} · {vehicle.isActive === false ? "לא פעיל" : "פעיל"}</div>
                                        </div>
                                        <div style={s.actions}>
                                            {vehicle.testImagePath && <SecureImage path={vehicle.testImagePath} alt="מסמך טסט" />}
                                            {vehicle.insuranceImagePath && <SecureImage path={vehicle.insuranceImagePath} alt="מסמך ביטוח" />}
                                        </div>
                                    </div>
                                    <div style={s.fields}>
                                        <Field label="חברה"><input value={current.company} onChange={e => setDraft("vehicle", vehicle._id, "company", e.target.value)} /></Field>
                                        <Field label="דגם"><input value={current.model} onChange={e => setDraft("vehicle", vehicle._id, "model", e.target.value)} /></Field>
                                        <Field label="שנה"><input type="number" value={current.year} onChange={e => setDraft("vehicle", vehicle._id, "year", e.target.value)} /></Field>
                                        <Field label="צבע"><input value={current.color} onChange={e => setDraft("vehicle", vehicle._id, "color", e.target.value)} /></Field>
                                        <Field label="לוחית"><input value={current.licensePlate} onChange={e => setDraft("vehicle", vehicle._id, "licensePlate", e.target.value)} /></Field>
                                        <Field label="סוג"><select value={current.vehicleType} onChange={e => setDraft("vehicle", vehicle._id, "vehicleType", e.target.value)}>{vehicleTypes.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
                                        <Field label="מושבים"><input type="number" value={current.seats} onChange={e => setDraft("vehicle", vehicle._id, "seats", Number(e.target.value))} /></Field>
                                        <Field label="פעיל"><select value={String(current.isActive)} onChange={e => setDraft("vehicle", vehicle._id, "isActive", e.target.value === "true")}><option value="true">פעיל</option><option value="false">מושבת</option></select></Field>
                                    </div>
                                    <div style={s.actions}>
                                        <button style={s.primaryBtn} disabled={saving} onClick={() => saveVehicle(vehicle)}>שמור רכב</button>
                                        <button style={s.successBtn} disabled={saving} onClick={() => runAction("מסמכי הרכב אושרו", () => api.put(`/uploads/verify-vehicle/${vehicle._id}`, { status: "approved" }))}>אשר מסמכים</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => runAction("מסמכי הרכב נדחו", () => api.put(`/uploads/verify-vehicle/${vehicle._id}`, { status: "rejected" }))}>דחה מסמכים</button>
                                        <button style={s.smallBtn} disabled={saving} onClick={() => runAction("אימות הרכב אופס", () => api.put(`/uploads/verify-vehicle/${vehicle._id}`, { status: "not_submitted" }))}>אפס אימות</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => runAction("מסמכי הרכב נמחקו", () => api.delete(`/uploads/vehicle-docs/${vehicle._id}`))}>מחק מסמכים</button>
                                        <button style={s.dangerBtn} disabled={saving} onClick={() => window.confirm("למחוק את הרכב? הנהג והמשתמש יישארו ויוכלו להוסיף רכב מחדש.") && runAction("הרכב נמחק", () => api.delete(`/vehicles/${vehicle._id}`))}>מחק רכב</button>
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                {tab === "rides" && (
                    <section style={s.split}>
                        <div style={s.formBox}>
                            <strong>יצירת נסיעה בשם משתמש</strong>
                            <Field label="נוסע"><select value={createRideDraft.passengerId} onChange={e => setCreateRideDraft(prev => ({ ...prev, passengerId: e.target.value }))}><option value="">בחר נוסע</option>{passengerOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>
                            <Field label="סוג"><select value={createRideDraft.rideType} onChange={e => setCreateRideDraft(prev => ({ ...prev, rideType: e.target.value }))}><option value="ride">ride</option><option value="delivery">delivery</option><option value="carpool">carpool</option></select></Field>
                            <Field label="מספר נוסעים"><input type="number" min="1" max="8" value={createRideDraft.passengerCount} onChange={e => setCreateRideDraft(prev => ({ ...prev, passengerCount: e.target.value }))} /></Field>
                            <Field label="איסוף - כתובת"><input value={createRideDraft.pickupAddress} onChange={e => setCreateRideDraft(prev => ({ ...prev, pickupAddress: e.target.value }))} /></Field>
                            <Field label="איסוף lat/lng"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}><input value={createRideDraft.pickupLat} onChange={e => setCreateRideDraft(prev => ({ ...prev, pickupLat: e.target.value }))} /><input value={createRideDraft.pickupLng} onChange={e => setCreateRideDraft(prev => ({ ...prev, pickupLng: e.target.value }))} /></div></Field>
                            <Field label="יעד - כתובת"><input value={createRideDraft.destinationAddress} onChange={e => setCreateRideDraft(prev => ({ ...prev, destinationAddress: e.target.value }))} /></Field>
                            <Field label="יעד lat/lng"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}><input value={createRideDraft.destinationLat} onChange={e => setCreateRideDraft(prev => ({ ...prev, destinationLat: e.target.value }))} /><input value={createRideDraft.destinationLng} onChange={e => setCreateRideDraft(prev => ({ ...prev, destinationLng: e.target.value }))} /></div></Field>
                            <button style={s.primaryBtn} disabled={saving || !createRideDraft.passengerId} onClick={createRide}>צור נסיעה</button>
                        </div>
                        <div style={s.grid}>
                            <div style={s.toolbar}><strong>נסיעות ({data.rides.length})</strong><span style={s.meta}>צפייה, ביטול, שינוי סטטוס ושיוך נהג</span></div>
                            {data.rides.length === 0 ? <Empty /> : data.rides.map(ride => {
                                const current = draft("ride", ride._id, {
                                    status: ride.status || "searching",
                                    driverId: ride.driverId?._id || ride.driverId || "",
                                    vehicleId: ride.vehicleId?._id || ride.vehicleId || "",
                                    finalPrice: ride.finalPrice || 0,
                                    cancellationReason: ride.cancellationReason || ""
                                });
                                const vehicleChoices = vehicleOptions.filter(option => !current.driverId || option.driverId === current.driverId);
                                return (
                                    <div key={ride._id} style={s.row}>
                                        <div>
                                            <div style={s.rowTitle}>{ride.pickupLocation?.address || "איסוף"} → {ride.destinationLocation?.address || "יעד"}</div>
                                            <div style={s.meta}>{ride.status} · {ride.rideType} · {formatMoney(ride.finalPrice)}</div>
                                        </div>
                                        <div style={s.fields}>
                                            <Field label="סטטוס"><select value={current.status} onChange={e => setDraft("ride", ride._id, "status", e.target.value)}>{rideStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
                                            <Field label="נהג"><select value={current.driverId} onChange={e => setDraft("ride", ride._id, "driverId", e.target.value)}><option value="">ללא נהג</option>{driverOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>
                                            <Field label="רכב"><select value={current.vehicleId} onChange={e => setDraft("ride", ride._id, "vehicleId", e.target.value)}><option value="">ללא רכב</option>{vehicleChoices.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>
                                            <Field label="מחיר"><input type="number" value={current.finalPrice} onChange={e => setDraft("ride", ride._id, "finalPrice", e.target.value)} /></Field>
                                            <Field label="סיבת ביטול"><input value={current.cancellationReason} onChange={e => setDraft("ride", ride._id, "cancellationReason", e.target.value)} /></Field>
                                        </div>
                                        <div style={s.actions}>
                                            <button style={s.primaryBtn} disabled={saving} onClick={() => runAction("הנסיעה עודכנה", () => api.put(`/rides/${ride._id}/admin`, current))}>שמור נסיעה</button>
                                            <button style={s.dangerBtn} disabled={saving} onClick={() => runAction("הנסיעה בוטלה", () => api.put(`/rides/${ride._id}/cancel`, { cancelledBy: "system", cancellationReason: current.cancellationReason || "בוטל על ידי מנהל" }))}>בטל נסיעה</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {tab === "payments" && (
                    <section style={s.grid}>
                        <div style={s.toolbar}><strong>תשלומים ({data.payments.length})</strong><span style={s.meta}>צפייה ועדכון סטטוס תשלום</span></div>
                        {data.payments.length === 0 ? <Empty /> : data.payments.map(payment => {
                            const current = draft("payment", payment._id, {
                                paymentStatus: payment.paymentStatus || "pending",
                                transactionId: payment.transactionId || ""
                            });
                            return (
                                <div key={payment._id} style={s.row}>
                                    <div>
                                        <div style={s.rowTitle}>{formatMoney(payment.amount)} · {safeText(payment.paymentMethod)}</div>
                                        <div style={s.meta}>ride {safeText(payment.rideId?._id || payment.rideId)} · {safeText(payment.paymentStatus)}</div>
                                    </div>
                                    <div style={s.fields}>
                                        <Field label="סטטוס"><select value={current.paymentStatus} onChange={e => setDraft("payment", payment._id, "paymentStatus", e.target.value)}>{paymentStatuses.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
                                        <Field label="Transaction ID"><input value={current.transactionId} onChange={e => setDraft("payment", payment._id, "transactionId", e.target.value)} /></Field>
                                    </div>
                                    <div style={s.actions}>
                                        <button style={s.primaryBtn} disabled={saving} onClick={() => runAction("התשלום עודכן", () => api.put(`/payments/${payment._id}/status`, current))}>עדכן תשלום</button>
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                {tab === "verifications" && (
                    <section style={s.grid}>
                        <div style={s.toolbar}><strong>ממתינים לאימות</strong><span style={s.meta}>תעודות זהות, רישיונות ומסמכי רכב</span></div>
                        {data.pendingIds.length === 0 && data.pendingLicenses.length === 0 && data.pendingVehicles.length === 0 ? <Empty text="אין בקשות אימות פתוחות" /> : null}
                        {data.pendingIds.map(user => (
                            <div key={`id-${user._id}`} style={s.row}>
                                <div style={s.rowHead}><div><div style={s.rowTitle}>תעודת זהות · {user.fullName}</div><div style={s.meta}>{user.email}</div></div>{user.idPhotoPath && <SecureImage path={user.idPhotoPath} alt="תעודת זהות" />}</div>
                                <div style={s.actions}><button style={s.successBtn} onClick={() => runAction("תעודת הזהות אושרה", () => api.put(`/uploads/verify-id/${user._id}`, { status: "approved" }))}>אשר</button><button style={s.dangerBtn} onClick={() => runAction("תעודת הזהות נדחתה", () => api.put(`/uploads/verify-id/${user._id}`, { status: "rejected" }))}>דחה</button></div>
                            </div>
                        ))}
                        {data.pendingLicenses.map(driver => (
                            <div key={`driver-${driver._id}`} style={s.row}>
                                <div style={s.rowHead}><div><div style={s.rowTitle}>רישיון נהיגה · {driver.userId?.fullName || "נהג"}</div><div style={s.meta}>{driver.userId?.email} · {driver.licenseNumber}</div></div>{driver.licenseImagePath && <SecureImage path={driver.licenseImagePath} alt="רישיון נהיגה" />}</div>
                                <div style={s.actions}><button style={s.successBtn} onClick={() => runAction("הרישיון אושר", () => api.put(`/uploads/verify-driver/${driver._id}`, { status: "approved" }))}>אשר</button><button style={s.dangerBtn} onClick={() => runAction("הרישיון נדחה", () => api.put(`/uploads/verify-driver/${driver._id}`, { status: "rejected" }))}>דחה</button></div>
                            </div>
                        ))}
                        {data.pendingVehicles.map(vehicle => (
                            <div key={`vehicle-${vehicle._id}`} style={s.row}>
                                <div style={s.rowHead}><div><div style={s.rowTitle}>מסמכי רכב · {vehicle.company} {vehicle.model}</div><div style={s.meta}>{vehicle.licensePlate}</div></div><div style={s.actions}>{vehicle.testImagePath && <SecureImage path={vehicle.testImagePath} alt="טסט" />}{vehicle.insuranceImagePath && <SecureImage path={vehicle.insuranceImagePath} alt="ביטוח" />}</div></div>
                                <div style={s.actions}><button style={s.successBtn} onClick={() => runAction("מסמכי הרכב אושרו", () => api.put(`/uploads/verify-vehicle/${vehicle._id}`, { status: "approved" }))}>אשר</button><button style={s.dangerBtn} onClick={() => runAction("מסמכי הרכב נדחו", () => api.put(`/uploads/verify-vehicle/${vehicle._id}`, { status: "rejected" }))}>דחה</button></div>
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </div>
    );
}
