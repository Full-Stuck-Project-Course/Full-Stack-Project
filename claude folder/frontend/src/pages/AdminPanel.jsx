// src/pages/AdminPanel.jsx

import { useState, useEffect } from "react";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

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

export default function AdminPanel() {
    const { t }    = useLang();
    const [tab,    setTab]    = useState("ids");
    const [data,   setData]   = useState({ pendingIds: [], pendingLicenses: [] });
    const [loading, setLoading] = useState(true);
    const [msg,    setMsg]    = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const { data: d } = await api.get("/uploads/pending");
            setData(d);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

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
                <button style={s.tab(tab === "ids")}      onClick={() => setTab("ids")}>
                    🪪 תעודות זהות ({data.pendingIds.length})
                </button>
                <button style={s.tab(tab === "licenses")} onClick={() => setTab("licenses")}>
                    🚗 רישיונות נהיגה ({data.pendingLicenses.length})
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
                                    <img src={`http://localhost:5000${user.idPhotoPath}`} alt="ת.ז." style={s.img} />
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
                                    <img src={`http://localhost:5000${driver.licenseImagePath}`} alt="רישיון" style={s.img} />
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
        </div>
    );
}
