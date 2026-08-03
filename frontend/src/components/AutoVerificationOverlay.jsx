import { useEffect, useMemo, useState } from "react";

export const AUTO_VERIFICATION_DURATION_MS = 3800;

export function waitForAutoVerification(duration = AUTO_VERIFICATION_DURATION_MS) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

const DEFAULT_STEPS = [
    { label: "מעלה קבצים בצורה מאובטחת", detail: "המסמכים נשמרים באזור פרטי" },
    { label: "בודק איכות תמונה", detail: "מוודא שהקובץ קריא וברור" },
    { label: "מאמת פרטי מסמך", detail: "מעדכן את סטטוס האימות במערכת" }
];

const s = {
    backdrop: {
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(15, 23, 42, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
    },
    dialog: {
        width: "100%",
        maxWidth: 520,
        background: "var(--surface)",
        color: "var(--text)",
        borderRadius: 18,
        border: "1px solid var(--border)",
        boxShadow: "0 20px 60px rgba(15,23,42,0.28)",
        padding: 24
    },
    head: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 18
    },
    title: { fontSize: 20, fontWeight: 800, marginBottom: 4 },
    subtitle: { color: "var(--text-muted)", fontSize: 13 },
    spinner: {
        width: 38,
        height: 38,
        borderRadius: "50%",
        border: "4px solid var(--border)",
        borderTopColor: "var(--primary)",
        animation: "spin 0.75s linear infinite",
        flexShrink: 0,
        margin: 0
    },
    doneIcon: {
        width: 38,
        height: 38,
        borderRadius: "50%",
        background: "#d1fae5",
        color: "#065f46",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        flexShrink: 0
    },
    progress: {
        height: 7,
        borderRadius: 999,
        background: "var(--border)",
        overflow: "hidden",
        marginBottom: 14
    },
    progressFill: {
        height: "100%",
        borderRadius: 999,
        background: "var(--primary)",
        transition: "width 0.45s ease"
    },
    timeline: { display: "grid", gap: 4 },
    row: {
        display: "grid",
        gridTemplateColumns: "28px 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 0",
        borderTop: "1px solid var(--border)"
    },
    rowFirst: { borderTop: "none" },
    dot: (state) => ({
        width: 24,
        height: 24,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        border: state === "done" ? "none" : "1px solid var(--border)",
        background: state === "done" ? "#d1fae5" : state === "active" ? "rgba(79,70,229,0.10)" : "var(--surface)",
        color: state === "done" ? "#065f46" : state === "active" ? "var(--primary)" : "var(--text-muted)",
        fontSize: 12,
        fontWeight: state === "done" ? 800 : 700
    }),
    rowLabel: { fontWeight: 700, fontSize: 14 },
    rowDetail: { color: "var(--text-muted)", fontSize: 12, marginTop: 2 },
    rowState: (done) => ({
        color: done ? "#065f46" : "var(--text-muted)",
        fontSize: 12,
        fontWeight: done ? 800 : 600,
        whiteSpace: "nowrap"
    }),
    success: {
        marginTop: 16,
        padding: 14,
        borderRadius: 12,
        background: "#d1fae5",
        color: "#065f46"
    },
    successTitle: { fontWeight: 800, marginBottom: 3 },
    successText: { fontSize: 13 }
};

export default function AutoVerificationOverlay({
    open,
    title = "בודקים את המסמכים שלך",
    subtitle = "זה לוקח כמה שניות.",
    steps,
    successTitle = "המסמכים אושרו בהצלחה",
    successText = "אפשר להמשיך."
}) {
    const normalizedSteps = useMemo(() => steps?.length ? steps : DEFAULT_STEPS, [steps]);
    const [activeStep, setActiveStep] = useState(0);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!open) {
            setActiveStep(0);
            setDone(false);
            return undefined;
        }

        const stepMs = 650;
        const timers = [];
        setActiveStep(0);
        setDone(false);

        normalizedSteps.forEach((_, index) => {
            timers.push(setTimeout(() => setActiveStep(index), index * stepMs));
        });
        timers.push(setTimeout(() => {
            setActiveStep(normalizedSteps.length);
            setDone(true);
        }, normalizedSteps.length * stepMs + 450));

        return () => timers.forEach(clearTimeout);
    }, [normalizedSteps, open]);

    if (!open) return null;

    const progress = done
        ? 100
        : Math.min(92, Math.round(((activeStep + 1) / normalizedSteps.length) * 80));

    return (
        <div style={s.backdrop} role="dialog" aria-modal="true" aria-live="polite">
            <div style={s.dialog} className="fade-in">
                <div style={s.head}>
                    <div>
                        <div style={s.title}>{done ? successTitle : title}</div>
                        <div style={s.subtitle}>{done ? successText : subtitle}</div>
                    </div>
                    {done ? <div style={s.doneIcon}>✓</div> : <div style={s.spinner} className="spinner" />}
                </div>

                <div style={s.progress} aria-hidden="true">
                    <div style={{ ...s.progressFill, width: `${progress}%` }} />
                </div>

                <div style={s.timeline}>
                    {normalizedSteps.map((step, index) => {
                        const rowDone = done || index < activeStep;
                        const rowActive = !done && index === activeStep;
                        const state = rowDone ? "done" : rowActive ? "active" : "idle";

                        return (
                            <div key={step.label} style={{ ...s.row, ...(index === 0 ? s.rowFirst : {}) }}>
                                <div style={s.dot(state)}>{rowDone ? "✓" : index + 1}</div>
                                <div>
                                    <div style={s.rowLabel}>{step.label}</div>
                                    <div style={s.rowDetail}>{step.detail}</div>
                                </div>
                                <div style={s.rowState(rowDone)}>
                                    {rowDone ? "בוצע" : rowActive ? "בודק עכשיו" : "ממתין"}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {done && (
                    <div style={s.success}>
                        <div style={s.successTitle}>{successTitle}</div>
                        <div style={s.successText}>{successText}</div>
                    </div>
                )}
            </div>
        </div>
    );
}
