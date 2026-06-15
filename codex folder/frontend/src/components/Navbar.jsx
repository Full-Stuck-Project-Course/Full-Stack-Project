import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const linkClass = (path) => pathname === path ? "nav-link active" : "nav-link";
    const canDrive = user?.role === "driver" || user?.role === "both";

    return (
        <nav className="nav" aria-label="ניווט ראשי">
            <Link to="/" className="nav-logo" aria-label="HailNow דף הבית">
                <span className="brand-mark">HN</span>
                HailNow
            </Link>

            <div className="nav-links">
                <Link to="/" className={linkClass("/")}>בית</Link>
                <Link to="/book" className={linkClass("/book")}>הזמנת נסיעה</Link>
                <Link to="/history" className={linkClass("/history")}>היסטוריה</Link>
                {canDrive ? (
                    <Link to="/driver" className={linkClass("/driver")}>לוח נהג</Link>
                ) : (
                    <Link to="/driver/onboarding" className={linkClass("/driver/onboarding")}>להפוך לנהג</Link>
                )}
                <Link to="/profile" className={linkClass("/profile")}>פרופיל</Link>
                <button className="logout-btn" onClick={handleLogout}>התנתקות</button>
            </div>
        </nav>
    );
}
