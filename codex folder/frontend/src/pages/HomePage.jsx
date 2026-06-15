import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const actions = [
    {
        title: "הזמנת נסיעה",
        desc: "מפה, נהגים סמוכים, מחיר חי ופיצול תשלום",
        path: "/book",
        tone: "primary"
    },
    {
        title: "קרפול",
        desc: "נסיעה משותפת לנוסעים עם יעדים קרובים במחיר נמוך יותר",
        path: "/book?type=carpool",
        tone: "success"
    },
    {
        title: "היסטוריית נסיעות",
        desc: "תיעוד נסיעות, ביטולים, קנסות ודירוגים",
        path: "/history",
        tone: "neutral"
    },
    {
        title: "פרופיל והעדפות",
        desc: "שפה, נגישות, תמונה, תעודת זהות והעדפות נהג",
        path: "/profile",
        tone: "neutral"
    }
];

export default function HomePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const canDrive = user?.role === "driver" || user?.role === "both";

    return (
        <main className="page" dir="rtl">
            <section className="hero">
                <div className="panel">
                    <div className="row" style={{ marginBottom: 18 }}>
                        <span className="brand-mark">HN</span>
                        <span className="pill">נוסעים ונהגים באותו חשבון</span>
                    </div>
                    <h1 style={{ fontSize: 42, marginBottom: 12 }}>HailNow</h1>
                    <p className="muted" style={{ fontSize: 18, lineHeight: 1.6 }}>
                        הזמנת נסיעה מקומית עם מחיר לפי מרחק, עומס, סוג רכב ומיקום הנהג.
                        הפרויקט נשאר בלוקאל־הוסט ומוכן לחיבור Google Maps דרך מפתח API.
                    </p>
                    <div className="row wrap" style={{ marginTop: 24 }}>
                        <button className="primary-btn" onClick={() => navigate("/book")}>הזמן נסיעה עכשיו</button>
                        <button className="secondary-btn" onClick={() => navigate(canDrive ? "/driver" : "/driver/onboarding")}>
                            {canDrive ? "פתח לוח נהג" : "להפוך לנהג"}
                        </button>
                    </div>
                </div>

                <div className="panel">
                    <h2 className="section-title">מצב פעילות סביבך</h2>
                    <div className="stack">
                        <div className="row between">
                            <span>נהגים סמוכים</span>
                            <strong>14</strong>
                        </div>
                        <div className="row between">
                            <span>אזור ביקוש גבוה</span>
                            <strong>רכבת מרכז</strong>
                        </div>
                        <div className="row between">
                            <span>נקודות נוסע</span>
                            <strong>128</strong>
                        </div>
                        <div className="row between">
                            <span>הנחת חבר מביא חבר</span>
                            <strong>נסיעה ראשונה מוזלת</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid auto">
                {actions.map(action => (
                    <button
                        key={action.path}
                        className={`panel compact ${action.tone === "primary" ? "primary-btn" : ""}`}
                        onClick={() => navigate(action.path)}
                        style={{
                            textAlign: "right",
                            color: action.tone === "primary" ? "#fff" : undefined,
                            minHeight: 150
                        }}
                    >
                        <h2 style={{ marginBottom: 10 }}>{action.title}</h2>
                        <p style={{ fontWeight: 500, opacity: 0.9 }}>{action.desc}</p>
                    </button>
                ))}

                <button
                    className="panel compact"
                    onClick={() => navigate(canDrive ? "/driver" : "/driver/onboarding")}
                    style={{ textAlign: "right", minHeight: 150 }}
                >
                    <h2 style={{ marginBottom: 10 }}>{canDrive ? "לוח נהג" : "השלמת פרטי נהג"}</h2>
                    <p className="muted">
                        בקשות סמוכות, התרעות ביקוש, הכנסות, קנסות, דירוגים ורכב פעיל.
                    </p>
                </button>
            </section>
        </main>
    );
}
