import { useEffect, useState } from "react";

const settings = [
    { key: "largeText", label: "טקסט גדול" },
    { key: "highContrast", label: "ניגודיות" },
    { key: "reducedMotion", label: "פחות תנועה" }
];

export default function AccessibilityToolbar() {
    const [open, setOpen] = useState(false);
    const [state, setState] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("hailnow-a11y")) || {};
        } catch {
            return {};
        }
    });

    useEffect(() => {
        document.body.classList.toggle("a11y-large", Boolean(state.largeText));
        document.body.classList.toggle("a11y-contrast", Boolean(state.highContrast));
        document.body.classList.toggle("a11y-reduced-motion", Boolean(state.reducedMotion));
        localStorage.setItem("hailnow-a11y", JSON.stringify(state));
    }, [state]);

    const toggle = (key) => setState(current => ({ ...current, [key]: !current[key] }));

    return (
        <div className="accessibility-toolbar">
            <button
                type="button"
                className="accessibility-trigger"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-label="פתח אפשרויות נגישות"
            >
                נגישות
            </button>

            {open && (
                <div className="accessibility-panel" role="dialog" aria-label="אפשרויות נגישות">
                    <strong>אפשרויות נגישות</strong>
                    {settings.map(item => (
                        <label key={item.key} className="accessibility-option">
                            <input
                                type="checkbox"
                                checked={Boolean(state[item.key])}
                                onChange={() => toggle(item.key)}
                            />
                            <span>{item.label}</span>
                        </label>
                    ))}
                    <p>תמיכה זמינה בעברית ובאנגלית דרך מסך הפרופיל.</p>
                </div>
            )}
        </div>
    );
}
