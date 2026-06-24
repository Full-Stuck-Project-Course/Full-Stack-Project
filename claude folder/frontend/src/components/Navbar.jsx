// src/components/Navbar.jsx

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";

const C = {
    nav: {
        background: "var(--primary)",
        padding: "0 24px",
        height: 62,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        position: "sticky",
        top: 0,
        zIndex: 100
    },
    logo: { color: "#fff", fontWeight: 800, fontSize: 21, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 },
    links: { display: "flex", gap: 20, alignItems: "center" },
    link: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 500, padding: "4px 0", whiteSpace: "nowrap" },
    activeLink: { color: "#fff", borderBottom: "2px solid #fff", paddingBottom: 2 },
    iconBtn: {
        background: "rgba(255,255,255,0.15)", color: "#fff",
        padding: "6px 10px", borderRadius: 8, fontSize: 13,
        position: "relative", display: "flex", alignItems: "center", gap: 4
    },
    notifDot: {
        position: "absolute", top: -3, right: -3,
        width: 10, height: 10, background: "#ef4444",
        borderRadius: "50%", border: "2px solid var(--primary)"
    },
    dropdown: {
        position: "absolute", top: "calc(100% + 8px)", left: 0,
        background: "#fff", borderRadius: 12, padding: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)", minWidth: 220,
        zIndex: 200, border: "1px solid var(--border)"
    },
    dropItem: {
        padding: "10px 14px", borderRadius: 8, cursor: "pointer",
        fontSize: 14, color: "var(--text)", display: "flex", gap: 8,
        alignItems: "center"
    }
};

function AccessibilityMenu({ t }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        function close(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const toggleContrast = () => document.body.classList.toggle("high-contrast");

    const setFontSize = (cls) => {
        document.body.classList.remove("font-large", "font-xlarge");
        if (cls) document.body.classList.add(cls);
        localStorage.setItem("fontSize", cls || "");
    };

    useEffect(() => {
        const saved = localStorage.getItem("fontSize");
        if (saved) document.body.classList.add(saved);
    }, []);

    return (
        <div style={{ position: "relative" }} ref={ref}>
            <button style={C.iconBtn} onClick={() => setOpen(o => !o)} aria-label={"נגישות"}>
                ♿
            </button>
            {open && (
                <div style={{ ...C.dropdown, background: "#fff", color: "#1e293b" }}>
                    <div style={{ padding: "8px 14px 6px", fontSize: 13, color: "#64748b", fontWeight: 700 }}>
                        נגישות
                    </div>
                    <div style={{ ...C.dropItem, color: "#1e293b" }} onClick={toggleContrast}>🌓 ניגודיות גבוהה</div>
                    <div style={{ padding: "6px 14px", fontSize: 13, color: "#64748b" }}>גודל גופן</div>
                    <div style={{ ...C.dropItem, color: "#1e293b" }} onClick={() => setFontSize("")}>A רגיל</div>
                    <div style={{ ...C.dropItem, color: "#1e293b" }} onClick={() => setFontSize("font-large")}>A+ גדול</div>
                    <div style={{ ...C.dropItem, color: "#1e293b" }} onClick={() => setFontSize("font-xlarge")}>A++ גדול מאוד</div>
                </div>
            )}
        </div>
    );
}

function NotificationsBtn({ userId, t }) {
    const [count, setCount] = useState(0);
    const [open,  setOpen]  = useState(false);
    const [notifs, setNotifs] = useState([]);
    const ref = useRef(null);

    useEffect(() => {
        if (!userId) return;
        const fetch = async () => {
            try {
                const { data } = await api.get(`/notifications/user/${userId}`);
                const unread = data.filter(n => !n.isRead);
                setCount(unread.length);
                setNotifs(data.slice(0, 8));
            } catch {}
        };
        fetch();
        const timer = setInterval(fetch, 30000);
        return () => clearInterval(timer);
    }, [userId]);

    useEffect(() => {
        function close(e) { if (!ref.current?.contains(e.target)) setOpen(false); }
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const markAll = async () => {
        try { await api.put(`/notifications/user/${userId}/read-all`); setCount(0); } catch {}
    };

    return (
        <div style={{ position: "relative" }} ref={ref}>
            <button style={C.iconBtn} onClick={() => setOpen(o => !o)} aria-label="התראות">
                🔔
                {count > 0 && <span style={C.notifDot} />}
            </button>
            {open && (
                <div style={{ ...C.dropdown, minWidth: 280 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px 6px", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>התראות</span>
                        {count > 0 && <span onClick={markAll} style={{ fontSize: 12, color: "var(--primary)", cursor: "pointer" }}>סמן הכל כנקרא</span>}
                    </div>
                    {notifs.length === 0 ? (
                        <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>אין התראות</div>
                    ) : notifs.map(n => (
                        <div key={n._id} style={{
                            ...C.dropItem,
                            background: n.isRead ? "transparent" : "rgba(79,70,229,0.06)",
                            flexDirection: "column", alignItems: "flex-start", gap: 2
                        }}>
                            <span style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 13 }}>{n.title}</span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{n.body}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Navbar() {
    const { user, logout } = useAuth();
    const { t } = useLang();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const handleLogout = () => { logout(); navigate("/login"); };

    const lk = (path) => pathname === path
        ? { ...C.link, ...C.activeLink }
        : C.link;

    const isDriver    = user?.role === "driver" || user?.role === "both";
    const isPassenger = user?.role === "passenger" || user?.role === "both";

    return (
        <nav style={C.nav} role="navigation" aria-label="תפריט ראשי">
            <Link to="/" style={C.logo}>
                <span>🚕</span> {"HailNow"}
            </Link>

            <div style={C.links}>
                <Link to="/"         style={lk("/")}>{t("בית")}</Link>
                <Link to="/book"     style={lk("/book")}>{t("הזמן נסיעה")}</Link>
                <Link to="/history"  style={lk("/history")}>{t("היסטוריה")}</Link>
                {isDriver    && <Link to="/driver"    style={lk("/driver")}>{t("לוח נהג")}</Link>}
                {isPassenger && <Link to="/passenger" style={lk("/passenger")}>{t("לוח נוסע")}</Link>}
                <Link to="/profile"  style={lk("/profile")}>{t("פרופיל")}</Link>

                <NotificationsBtn userId={user?.userId} t={t} />

                <AccessibilityMenu t={t} />

                <button style={{ ...C.iconBtn, background: "rgba(255,255,255,0.2)" }}
                    onClick={handleLogout}>
                    {t("התנתק")}
                </button>
            </div>
        </nav>
    );
}
