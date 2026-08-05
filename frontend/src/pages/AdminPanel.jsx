// src/pages/AdminPanel.jsx

import { useState, useEffect } from "react";
import api from "../api/axios";
import { secureUploadPath } from "../api/assets";
import { createSocket } from "../api/socket";
import { useNavigate, useSearchParams } from "../routing";

const s = {
    page: { padding: "28px 20px", maxWidth: 860, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    tabs: { display: "flex", gap: 8, marginBottom: 20 },
    tab: (a) => ({ padding: "8px 18px", borderRadius: 24, border: "2px solid", borderColor: a ? "var(--primary)" : "var(--border)", background: a ? "var(--primary)" : "var(--surface)", color: a ? "#fff" : "var(--text-muted)", fontWeight: 700, cursor: "pointer" }),
    itemRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" },
    img: { width: 80, height: 60, borderRadius: 8, objectFit: "cover", border: "1px solid var(--border)" },
    btnGroup: { display: "flex", gap: 6 }
};

function SecureImage({ path, alt, style }) {
    const [src, setSrc] = useState("");

    useEffect(() => {
        if (!path) return;
        let active = true;
        let objectUrl = "";
        const apiPath = secureUploadPath(path);
        if (!apiPath) return;
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
    return <img src={src} alt={alt} style={style} />;
}

export default function AdminPanel() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const initialTab = ["ids", "licenses", "vehicles"].includes(requestedTab) ? requestedTab : "ids";
    const [tab,    setTab]    = useState(initialTab);
    const [data,   setData]   = useState({ pendingIds: [], pendingLicenses: [], pendingVehicles: [] });
    const [loading, setLoading] = useState(true);
    const [msg,    setMsg]    = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        if (["ids", "licenses", "vehicles"].includes(requestedTab) && requestedTab !== tab) {
            setTab(requestedTab);
        }
    }, [requestedTab, tab]);

    const selectTab = (nextTab) => {
        setTab(nextTab);
        setSearchParams({ tab: nextTab }, { replace: true });
    };

    const load = async () => {
        setLoading(true);
        try {
            const { data: d } = await api.get("/uploads/pending");
            setData(d);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        const socket = createSocket();
        socket.on("sos-alert", ({ rideId }) => {
            if (rideId && window.confirm("🚨 התקבלה התראת SOS. לפתוח את פרטי הנסיעה?")) {
                navigate(`/ride/${rideId}`);
            }
        });
        return () => socket.disconnect();
    }, [navigate]);

    const verifyId = async (userId, status) => {
        await api.put(`/uploads/verify-id/${userId}`, { status });
        setMsg(`תעודת הזהות ${status === "approved" ? "אושרה" : "נדחתה"}`);
        load();
        setTimeout(() => setMsg(""), 3000);
    };

    const verifyDriver = async (driverId, status) => {
        await api.put(`/uploads/verify-driver/${driverId}`, { status });
        setMsg(`רישיון הנהיגה ${status === "approved" ? "אושר" : "נדחה"}`);
        load();
        setTimeout(() => setMsg(""), 3000);
    };

    const verifyVehicle = async (vehicleId, status) => {
        await api.put(`/uploads/verify-vehicle/${vehicleId}`, { status });
        setMsg(`מסמכי הרכב ${status === "approved" ? "אושרו" : "נדחו"}`);
        load();
        setTimeout(() => setMsg(""), 3000);
    };

    if (loading) return <div className="spinner" />;

    return (
        <div style={s.page} className="fade-in">
            <h1 style={s.title}>🛡️ פאנל ניהול — HailNow</h1>

            {msg && (
                <div style={{ background: "#d1fae5", borderRadius: 10, padding: "10px 16px", marginBottom: 14, color: "#065f46", fontWeight: 600 }}>
                    ✅ {msg}
                </div>
            )}

            <div style={s.tabs}>
                <button style={s.tab(tab === "ids")}      onClick={() => selectTab("ids")}>
                    🪪 תעודות זהות ({data.pendingIds.length})
                </button>
                <button style={s.tab(tab === "licenses")} onClick={() => selectTab("licenses")}>
                    🚗 רישיונות נהיגה ({data.pendingLicenses.length})
                </button>
                <button style={s.tab(tab === "vehicles")} onClick={() => selectTab("vehicles")}>
                    🧾 מסמכי רכב ({data.pendingVehicles?.length || 0})
                </button>
            </div>

            {/* Pending IDs */}
            {tab === "ids" && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 14 }}>ממתינים לאישור תעודת זהות</div>
                    {data.pendingIds.length === 0 ? (
                        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 20 }}>אין ממתינים</div>
                    ) : data.pendingIds.map(user => (
                        <div key={user._id} style={s.itemRow}>
                            <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1 }}>
                                {user.idPhotoPath && (
                                    <SecureImage path={user.idPhotoPath} alt="ת.ז." style={s.img} />
                                )}
                                <div>
                                    <div style={{ fontWeight: 600 }}>{user.fullName}</div>
                                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{user.email}</div>
                                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{user.phone}</div>
                                </div>
                            </div>
                            <div style={s.btnGroup}>
                                <button onClick={() => verifyId(user._id, "approved")}
                                    style={{ background: "var(--success)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13 }}>
                                    ✅ אשר
                                </button>
                                <button onClick={() => verifyId(user._id, "rejected")}
                                    style={{ background: "#fee2e2", color: "var(--danger)", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>
                                    ❌ דחה
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pending licenses */}
            {tab === "licenses" && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 14 }}>ממתינים לאישור רישיון נהיגה</div>
                    {data.pendingLicenses.length === 0 ? (
                        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 20 }}>אין ממתינים</div>
                    ) : data.pendingLicenses.map(driver => (
                        <div key={driver._id} style={s.itemRow}>
                            <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1 }}>
                                {driver.licenseImagePath && (
                                    <SecureImage path={driver.licenseImagePath} alt="רישיון" style={s.img} />
                                )}
                                <div>
                                    <div style={{ fontWeight: 600 }}>{driver.userId?.fullName || "נהג"}</div>
                                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{driver.userId?.email}</div>
                                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>רישיון: {driver.licenseNumber}</div>
                                </div>
                            </div>
                            <div style={s.btnGroup}>
                                <button onClick={() => verifyDriver(driver._id, "approved")}
                                    style={{ background: "var(--success)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13 }}>
                                    ✅ אשר
                                </button>
                                <button onClick={() => verifyDriver(driver._id, "rejected")}
                                    style={{ background: "#fee2e2", color: "var(--danger)", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>
                                    ❌ דחה
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === "vehicles" && (
                <div style={s.card}>
                    <div style={{ fontWeight: 700, marginBottom: 14 }}>ממתינים לאישור מסמכי רכב</div>
                    {(data.pendingVehicles || []).length === 0 ? (
                        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 20 }}>אין ממתינים</div>
                    ) : data.pendingVehicles.map(vehicle => (
                        <div key={vehicle._id} style={s.itemRow}>
                            <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1 }}>
                                {vehicle.testImagePath && <SecureImage path={vehicle.testImagePath} alt="אישור טסט" style={s.img} />}
                                {vehicle.insuranceImagePath && <SecureImage path={vehicle.insuranceImagePath} alt="אישור ביטוח" style={s.img} />}
                                <div>
                                    <div style={{ fontWeight: 600 }}>{vehicle.driverId?.userId?.fullName || "נהג"}</div>
                                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{vehicle.driverId?.userId?.email}</div>
                                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                        {vehicle.company} {vehicle.model} · {vehicle.licensePlate}
                                    </div>
                                </div>
                            </div>
                            <div style={s.btnGroup}>
                                <button onClick={() => verifyVehicle(vehicle._id, "approved")}
                                    style={{ background: "var(--success)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13 }}>
                                    ✅ אשר
                                </button>
                                <button onClick={() => verifyVehicle(vehicle._id, "rejected")}
                                    style={{ background: "#fee2e2", color: "var(--danger)", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>
                                    ❌ דחה
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
