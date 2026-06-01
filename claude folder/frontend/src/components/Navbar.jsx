// src/components/Navbar.jsx

import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const styles = {
    nav: {
        background: "#4f46e5",
        padding: "0 32px",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
    },
    logo: { color: "#fff", fontWeight: 700, fontSize: 20, letterSpacing: 1 },
    links: { display: "flex", gap: 24, alignItems: "center" },
    link: { color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 500 },
    activeLink: { color: "#fff", borderBottom: "2px solid #fff", paddingBottom: 2 },
    logoutBtn: {
        background: "rgba(255,255,255,0.2)",
        color: "#fff",
        padding: "6px 16px",
        borderRadius: 6,
        fontSize: 14
    }
};

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const handleLogout = () => { logout(); navigate("/login"); };

    const linkStyle = (path) => pathname === path
        ? { ...styles.link, ...styles.activeLink }
        : styles.link;

    return (
        <nav style={styles.nav}>
            <Link to="/" style={styles.logo}>🚗 CarPool</Link>
            <div style={styles.links}>
                <Link to="/"        style={linkStyle("/")}>בית</Link>
                <Link to="/book"    style={linkStyle("/book")}>הזמן נסיעה</Link>
                <Link to="/history" style={linkStyle("/history")}>היסטוריה</Link>
                {(user?.role === "driver" || user?.role === "both") &&
                    <Link to="/driver" style={linkStyle("/driver")}>לוח נהג</Link>
                }
                <Link to="/profile" style={linkStyle("/profile")}>פרופיל</Link>
                <button style={styles.logoutBtn} onClick={handleLogout}>התנתק</button>
            </div>
        </nav>
    );
}
