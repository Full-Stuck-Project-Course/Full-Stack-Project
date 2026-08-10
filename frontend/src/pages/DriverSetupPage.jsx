// src/pages/DriverSetupPage.jsx

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "../routing";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import api from "../api/axios";
import AutoVerificationOverlay, { waitForAutoVerification } from "../components/AutoVerificationOverlay";

const STEPS = ["פרטי נהג", "רכב", "מסמכים"];
const VEHICLE_TYPES = ["regular", "comfort", "luxury", "van"];
const LANGS = ["עברית", "אנגלית", "ערבית", "רוסית", "אמהרית", "צרפתית"];
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DRIVER_LICENSE_NUMBER_RE = /^\d{5,9}$/;
const LICENSE_PLATE_RE = /^\d{7,8}$/;

const AVAILABILITY_MESSAGES = {
    licenseNumber: {
        invalid: "מספר רישיון חייב להכיל 5-9 ספרות בלבד",
        checking: "בודקים אם מספר הרישיון פנוי...",
        duplicate: "מספר רישיון הנהיגה כבר קיים במערכת",
        available: "מספר הרישיון תקין ופנוי",
        failed: "לא ניתן לבדוק כרגע את מספר הרישיון"
    },
    licensePlate: {
        invalid: "לוחית רישוי חייבת להכיל 7-8 ספרות",
        checking: "בודקים אם לוחית הרישוי פנויה...",
        duplicate: "לוחית הרישוי כבר קיימת במערכת",
        available: "לוחית הרישוי תקינה ופנויה",
        failed: "לא ניתן לבדוק כרגע את לוחית הרישוי"
    }
};

const CAR_BRANDS = {
    "טויוטה":   ["קורולה", "יאריס", "קאמרי", "RAV4", "לנד קרוזר", "היילקס", "C-HR", "אחר"],
    "יונדאי":   ["i10", "i20", "i30", "i35", "טוסון", "קונה", "אלנטרה", "סונטה", "אחר"],
    "קיה":      ["פיקנטו", "ריו", "ספורטאז'", "סיד", "ניירו", "סורנטו", "אחר"],
    "מאזדה":    ["2", "3", "6", "CX-3", "CX-5", "CX-30", "MX-5", "אחר"],
    "סקודה":    ["פאביה", "אוקטביה", "סופרב", "קארוק", "קודיאק", "אחר"],
    "פולקסווגן": ["פולו", "גולף", "טיגואן", "T-Cross", "ID.3", "פאסאט", "אחר"],
    "סוזוקי":   ["סוויפט", "באלנו", "ויטארה", "ג'ימני", "S-Cross", "אחר"],
    "ניסאן":    ["מיקרה", "ג'וק", "קשקאי", "X-Trail", "ליף", "אחר"],
    "שברולט":   ["ספארק", "אוניקס", "טראקס", "אקווינוקס", "אחר"],
    "סיטרואן":  ["C3", "C4", "C5 Aircross", "ברלינגו", "אחר"],
    "פיג'ו":    ["208", "308", "2008", "3008", "5008", "אחר"],
    "רנו":      ["קליאו", "מגאן", "קפצ'ור", "קאדז'אר", "אחר"],
    "BMW":      ["סדרה 1", "סדרה 2", "סדרה 3", "X1", "X3", "X5", "אחר"],
    "מרצדס":    ["A-Class", "C-Class", "E-Class", "GLA", "GLC", "אחר"],
    "אאודי":    ["A3", "A4", "Q3", "Q5", "e-tron", "אחר"],
    "טסלה":     ["Model 3", "Model Y", "Model S", "Model X", "אחר"],
    "אחר":      ["אחר"]
};

const COLORS = ["לבן", "שחור", "אפור", "כסוף", "כחול", "אדום", "ירוק", "חום", "בז'", "זהב", "כתום", "צהוב", "אחר"];

const s = {
    page: { padding: "28px 20px", maxWidth: 560, margin: "0 auto" },
    title: { fontSize: 22, fontWeight: 800, marginBottom: 6 },
    sub: { color: "var(--text-muted)", fontSize: 14, marginBottom: 24 },
    card: { background: "var(--surface)", borderRadius: 14, padding: 24, boxShadow: "var(--shadow)", marginBottom: 14, border: "1px solid var(--border)" },
    label: { display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 },
    group: { marginBottom: 18 },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    stepBar: { display: "flex", gap: 6, marginBottom: 24 },
    step: (a, d) => ({ flex: 1, height: 5, borderRadius: 3, background: d ? "var(--success)" : a ? "var(--primary)" : "var(--border)", transition: "background 0.3s" }),
    fileBox: { border: "2px dashed var(--border)", borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" },
    tagList: { display: "flex", flexWrap: "wrap", gap: 8 },
    tag: (sel) => ({
        padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
        border: `1.5px solid ${sel ? "var(--primary)" : "var(--border)"}`,
        background: sel ? "rgba(79,70,229,0.08)" : "var(--surface)",
        color: sel ? "var(--primary)" : "var(--text-muted)",
        fontWeight: sel ? 700 : 400
    })
};

function FieldErr({ msg }) {
    if (!msg) return null;
    return <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>⚠️ {msg}</p>;
}

function FieldHint({ msg, tone = "muted" }) {
    if (!msg) return null;
    const color = tone === "success" ? "var(--success)" : "var(--text-muted)";
    return <p role="status" style={{ color, fontSize: 12, marginTop: 4 }}>{msg}</p>;
}

function validateDocumentFile(file) {
    if (!file) return "";
    if (file.size > MAX_DOCUMENT_BYTES) return "הקובץ גדול מדי. אפשר להעלות עד 15MB";
    if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) return "אפשר להעלות רק תמונות JPG, PNG או WEBP";
    return "";
}

function readPreview(file, setPreview) {
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);
}

function FileUpload({ label, preview, onChange, fieldName }) {
    return (
        <div style={s.group}>
            <label style={s.label}>{label}</label>
            <label style={{ ...s.fileBox, borderColor: preview ? "var(--success)" : undefined }}>
                {preview
                    ? preview === "existing"
                        ? <div><div style={{ fontSize: 28, marginBottom: 6 }}>✓</div><div style={{ fontSize: 13, color: "var(--success)" }}>{"\u05DE\u05E1\u05DE\u05DA \u05E7\u05D9\u05D9\u05DD"}</div></div>
                        : <img src={preview} alt={label} style={{ maxHeight: 100, borderRadius: 8, objectFit: "cover" }} />
                    : <div><div style={{ fontSize: 28, marginBottom: 6 }}>📄</div><div style={{ fontSize: 13, color: "var(--text-muted)" }}>לחץ להעלאה</div></div>
                }
                <input type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => {
                        const file = e.target.files[0];
                        e.target.value = "";
                        if (!file) return;
                        onChange(file);
                    }} />
            </label>
        </div>
    );
}

export default function DriverSetupPage() {
    const { user, updateUser } = useAuth();
    const { t }     = useLang();
    const userId    = user?.userId;
    const navigate  = useNavigate();
    const [step, setStep] = useState(0);
    const [existingDriver, setExistingDriver] = useState(null);
    const [existingVehicle, setExistingVehicle] = useState(null);
    const [driverForm, setDF] = useState({
        licenseNumber: "", licenseExpiry: "", gender: "",
        preferredMusic: "", hobbies: "",
        spokenLanguages: [], acceptsCarpoolRides: true,
        vehicleConditions: { noPets: false, noSmoking: true, noFood: false }
    });
    const [vehicleForm, setVF] = useState({
        company: "", companyOther: "", model: "", modelOther: "", year: "", color: "", colorOther: "", licensePlate: "",
        vehicleType: "regular", seats: 4
    });
    const [licenseFile, setLicenseFile] = useState(null);
    const [licensePreview, setLicensePreview] = useState("");
    const [testFile, setTestFile] = useState(null);
    const [testPreview, setTestPreview] = useState("");
    const [insuranceFile, setInsuranceFile] = useState(null);
    const [insurancePreview, setInsurancePreview] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState({});
    const [verification, setVerification] = useState(null);
    const licenseNumberCheckSeq = useRef(0);
    const licenseNumberCheckTimer = useRef(null);
    const licensePlateCheckSeq = useRef(0);
    const licensePlateCheckTimer = useRef(null);
    const [licenseNumberChecking, setLicenseNumberChecking] = useState(false);
    const [licenseNumberInUse, setLicenseNumberInUse] = useState(false);
    const [licenseNumberChecked, setLicenseNumberChecked] = useState(false);
    const [licensePlateChecking, setLicensePlateChecking] = useState(false);
    const [licensePlateInUse, setLicensePlateInUse] = useState(false);
    const [licensePlateChecked, setLicensePlateChecked] = useState(false);

    useEffect(() => {
        api.get("/drivers").then(r => {
            const d = r.data.find(d => d.userId?._id === userId || d.userId === userId);
            if (d) {
                setExistingDriver(d);
                setDF(prev => ({
                    ...prev,
                    licenseNumber: d.licenseNumber || "",
                    gender: ["male", "female"].includes(d.gender) ? d.gender : "",
                    preferredMusic: d.preferredMusic || "",
                    hobbies: d.hobbies?.join(", ") || "",
                    spokenLanguages: d.spokenLanguages || [],
                    acceptsCarpoolRides: d.acceptsCarpoolRides ?? true,
                    vehicleConditions: d.vehicleConditions || { noPets: false, noSmoking: true, noFood: false }
                }));
                if (d.licenseImagePath) setLicensePreview("existing");
                api.get(`/vehicles/driver/${d._id}`).then(vehicleResponse => {
                    const vehicle = vehicleResponse.data?.[0];
                    if (!vehicle) return;
                    setExistingVehicle(vehicle);
                    setVF(prev => ({
                        ...prev,
                        company: vehicle.company || "",
                        model: vehicle.model || "",
                        year: vehicle.year || "",
                        color: vehicle.color || "",
                        licensePlate: vehicle.licensePlate || "",
                        vehicleType: vehicle.vehicleType || "regular",
                        seats: vehicle.seats || 4
                    }));
                    if (vehicle.testImagePath) setTestPreview("existing");
                    if (vehicle.insuranceImagePath) setInsurancePreview("existing");
                }).catch(() => {});
            }
        }).catch(() => {});
    }, [userId]);

    useEffect(() => {
        return () => {
            licenseNumberCheckSeq.current += 1;
            licensePlateCheckSeq.current += 1;
            if (licenseNumberCheckTimer.current) clearTimeout(licenseNumberCheckTimer.current);
            if (licensePlateCheckTimer.current) clearTimeout(licensePlateCheckTimer.current);
        };
    }, []);

    const checkSetupAvailability = (field, rawValue) => {
        const isLicenseNumber = field === "licenseNumber";
        const value = String(rawValue || "").trim();
        const pattern = isLicenseNumber ? DRIVER_LICENSE_NUMBER_RE : LICENSE_PLATE_RE;
        const messages = AVAILABILITY_MESSAGES[field];
        const seqRef = isLicenseNumber ? licenseNumberCheckSeq : licensePlateCheckSeq;
        const timerRef = isLicenseNumber ? licenseNumberCheckTimer : licensePlateCheckTimer;
        const setChecking = isLicenseNumber ? setLicenseNumberChecking : setLicensePlateChecking;
        const setInUse = isLicenseNumber ? setLicenseNumberInUse : setLicensePlateInUse;
        const setChecked = isLicenseNumber ? setLicenseNumberChecked : setLicensePlateChecked;
        const existingValue = isLicenseNumber
            ? existingDriver?.licenseNumber
            : existingVehicle?.licensePlate;

        seqRef.current += 1;
        const checkId = seqRef.current;
        if (timerRef.current) clearTimeout(timerRef.current);
        setInUse(false);
        setChecked(false);

        if (!value) {
            setChecking(false);
            return;
        }

        if (!pattern.test(value)) {
            setChecking(false);
            setFieldErrors(current => ({ ...current, [field]: messages.invalid }));
            return;
        }

        if (value === String(existingValue || "")) {
            setChecking(false);
            setChecked(true);
            return;
        }

        setChecking(true);
        timerRef.current = setTimeout(async () => {
            try {
                const { data } = await api.get("/drivers/check-setup", {
                    params: { [field]: value }
                });
                if (seqRef.current !== checkId) return;

                const info = data?.[field];
                setChecked(true);
                setInUse(Boolean(info?.exists));
                setFieldErrors(current => ({
                    ...current,
                    [field]: info?.valid === false
                        ? messages.invalid
                        : info?.exists
                            ? messages.duplicate
                            : undefined
                }));
            } catch {
                if (seqRef.current === checkId) {
                    setFieldErrors(current => ({ ...current, [field]: messages.failed }));
                }
            } finally {
                if (seqRef.current === checkId) setChecking(false);
            }
        }, 300);
    };

    const setD = (k, v) => setDF(f => ({ ...f, [k]: v }));
    const setV = (k, v) => setVF(f => ({ ...f, [k]: v }));
    const toggleLang = (lang) => setDF(f => ({
        ...f,
        spokenLanguages: f.spokenLanguages.includes(lang)
            ? f.spokenLanguages.filter(l => l !== lang)
            : [...f.spokenLanguages, lang]
    }));

    const HE_EN_NUMS = /^[֐-׿a-zA-Z0-9\s\-'.,]+$/;

    const validateStep = () => {
        const errs = {};
        if (step === 0) {
            const lic = driverForm.licenseNumber.trim();
            if (!lic) errs.licenseNumber = "שדה חובה";
            else if (!DRIVER_LICENSE_NUMBER_RE.test(lic)) errs.licenseNumber = AVAILABILITY_MESSAGES.licenseNumber.invalid;
            else if (licenseNumberChecking) errs.licenseNumber = AVAILABILITY_MESSAGES.licenseNumber.checking;
            else if (licenseNumberInUse) errs.licenseNumber = AVAILABILITY_MESSAGES.licenseNumber.duplicate;
            else if (fieldErrors.licenseNumber === AVAILABILITY_MESSAGES.licenseNumber.failed) errs.licenseNumber = fieldErrors.licenseNumber;

            if (driverForm.licenseExpiry) {
                if (new Date(driverForm.licenseExpiry) < new Date()) errs.licenseExpiry = "תאריך תפוגה עבר";
            }

            if (!["male", "female"].includes(driverForm.gender)) errs.gender = "יש לבחור מין";

            const music = driverForm.preferredMusic.trim();
            if (music && !HE_EN_NUMS.test(music)) errs.preferredMusic = "אותיות, מספרים ופסיקים בלבד";
            if (music && music.length > 50) errs.preferredMusic = "עד 50 תווים";

            const hobbies = driverForm.hobbies.trim();
            if (hobbies && !HE_EN_NUMS.test(hobbies)) errs.hobbies = "אותיות, מספרים ופסיקים בלבד";
            if (hobbies && hobbies.length > 100) errs.hobbies = "עד 100 תווים";

            if (driverForm.spokenLanguages.length === 0) errs.spokenLanguages = "יש לבחור לפחות שפה אחת";
        }
        if (step === 1) {
            if (!vehicleForm.company) errs.company = "יש לבחור חברה";
            else if (vehicleForm.company === "אחר" && !(vehicleForm.companyOther || "").trim()) errs.company = "יש להזין שם חברה";

            if (!vehicleForm.model) errs.model = "יש לבחור דגם";
            else if (vehicleForm.model === "אחר" && !(vehicleForm.modelOther || "").trim()) errs.model = "יש להזין שם דגם";

            if (!vehicleForm.year) errs.year = "יש לבחור שנה";

            if (!vehicleForm.color) errs.color = "יש לבחור צבע";
            else if (vehicleForm.color === "אחר" && !(vehicleForm.colorOther || "").trim()) errs.color = "יש להזין צבע";

            const plate = vehicleForm.licensePlate.trim();
            if (!plate) errs.licensePlate = "שדה חובה";
            else if (!LICENSE_PLATE_RE.test(plate)) errs.licensePlate = AVAILABILITY_MESSAGES.licensePlate.invalid;
            else if (licensePlateChecking) errs.licensePlate = AVAILABILITY_MESSAGES.licensePlate.checking;
            else if (licensePlateInUse) errs.licensePlate = AVAILABILITY_MESSAGES.licensePlate.duplicate;
            else if (fieldErrors.licensePlate === AVAILABILITY_MESSAGES.licensePlate.failed) errs.licensePlate = fieldErrors.licensePlate;
        }
        if (step === 2) {
            if (!licensePreview) errs.licensePhoto = "יש להעלות צילום רישיון נהיגה";
            if (!testPreview) errs.testPhoto = "יש להעלות צילום אישור טסט";
            if (!insurancePreview) errs.insurancePhoto = "יש להעלות צילום אישור ביטוח";
        }
        setFieldErrors(errs);
        return Object.keys(errs).length > 0 ? "יש לתקן את השדות המסומנים" : null;
    };

    const setDocumentFile = (field, file, setFile, setPreview) => {
        const fileError = validateDocumentFile(file);
        if (fileError) {
            setFile(null);
            setPreview("");
            setError(fileError);
            setFieldErrors(f => ({ ...f, [field]: fileError }));
            return;
        }

        setError("");
        setFieldErrors(f => ({ ...f, [field]: undefined }));
        setFile(file);
        readPreview(file, setPreview);
    };

    const handleLicenseFile = (file) => {
        setDocumentFile("licensePhoto", file, setLicenseFile, setLicensePreview);
    };

    const handleSubmit = async () => {
        const err = validateStep();
        if (err) return setError(err);

        setError("");
        setVerification({
            title: "מאשרים את מסמכי הנהג והרכב",
            subtitle: "כל המסמכים מאושרים מיד אחרי ההעלאה — אין המתנה לאישור נציג.",
            steps: [
                { label: "מעלה רישיון נהיגה", detail: "שומר את צילום הרישיון בצורה מאובטחת" },
                { label: "מעלה מסמכי רכב", detail: "שומר אישור טסט וביטוח בתוקף" },
                { label: "מאשר את פרופיל הנהג", detail: "הנהג מסומן כמאומת במערכת" },
                { label: "מאשר את הרכב", detail: "טסט וביטוח מסומנים כמאושרים" }
            ],
            successTitle: "הנהג והרכב אושרו",
            successText: "אפשר לעבור ללוח הנהג ולהתחיל לקבל נסיעות."
        });
        setLoading(true);
        const verificationDelay = waitForAutoVerification();
        try {
            const finalCompany = vehicleForm.company === "אחר" ? (vehicleForm.companyOther || "אחר") : vehicleForm.company;
            const finalModel   = vehicleForm.model   === "אחר" ? (vehicleForm.modelOther   || "אחר") : vehicleForm.model;
            const finalColor   = vehicleForm.color   === "אחר" ? (vehicleForm.colorOther   || "אחר") : vehicleForm.color;

            const fd = new FormData();
            fd.append("licenseNumber", driverForm.licenseNumber);
            fd.append("gender", driverForm.gender);
            fd.append("preferredMusic", driverForm.preferredMusic);
            fd.append("hobbies", JSON.stringify(driverForm.hobbies.split(",").map(s => s.trim()).filter(Boolean)));
            fd.append("spokenLanguages", JSON.stringify(driverForm.spokenLanguages));
            fd.append("acceptsCarpoolRides", String(driverForm.acceptsCarpoolRides));
            fd.append("vehicleConditions", JSON.stringify(driverForm.vehicleConditions));
            if (driverForm.licenseExpiry) fd.append("licenseExpiry", driverForm.licenseExpiry);
            fd.append("company", finalCompany);
            fd.append("model", finalModel);
            fd.append("year", String(vehicleForm.year));
            fd.append("color", finalColor);
            fd.append("licensePlate", vehicleForm.licensePlate);
            fd.append("vehicleType", vehicleForm.vehicleType);
            fd.append("seats", String(vehicleForm.seats));
            if (licenseFile) fd.append("licensePhoto", licenseFile);
            if (testFile) fd.append("testPhoto", testFile);
            if (insuranceFile) fd.append("insurancePhoto", insuranceFile);

            const { data } = await api.post("/drivers/setup", fd, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            setExistingDriver(data.driver);
            setExistingVehicle(data.vehicle);

            // Update user role if needed
            if (user?.role === "passenger") {
                await api.put(`/users/${user.userId}`, { role: "both" });
                updateUser({ role: "both" });
            }

            await verificationDelay;
            navigate("/driver");
        } catch (err) {
            setError(err.response?.data?.error || "שגיאה בשמירת הפרופיל");
        } finally {
            setLoading(false);
            setVerification(null);
        }
    };

    const goNext = () => {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError("");
        setStep(s => s + 1);
    };

    const licenseNumberAvailable = licenseNumberChecked &&
        !licenseNumberChecking &&
        !licenseNumberInUse &&
        !fieldErrors.licenseNumber &&
        DRIVER_LICENSE_NUMBER_RE.test(driverForm.licenseNumber.trim());
    const licensePlateAvailable = licensePlateChecked &&
        !licensePlateChecking &&
        !licensePlateInUse &&
        !fieldErrors.licensePlate &&
        LICENSE_PLATE_RE.test(vehicleForm.licensePlate.trim());
    const currentStepChecking = (step === 0 && licenseNumberChecking) ||
        (step === 1 && licensePlateChecking);

    return (
        <div style={s.page} className="fade-in">
            <AutoVerificationOverlay open={Boolean(verification)} {...(verification || {})} />
            <h1 style={s.title}>{"הגדרת פרופיל נהג"}</h1>
            <p style={s.sub}>שלב {step + 1} מתוך {STEPS.length} — {STEPS[step]}</p>

            <div style={s.stepBar}>
                {STEPS.map((_, i) => <div key={i} style={s.step(i === step, i < step)} />)}
            </div>

            {/* Step 0: Driver details */}
            {step === 0 && (
                <div style={s.card}>
                    <div style={s.group}>
                        <label style={s.label}>מספר רישיון נהיגה * <span style={{ color: "var(--danger)" }}>חובה</span></label>
                        <input placeholder="12345678" value={driverForm.licenseNumber}
                            onChange={e => {
                                const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 9);
                                setD("licenseNumber", digits);
                                setFieldErrors(f => ({ ...f, licenseNumber: undefined }));
                                checkSetupAvailability("licenseNumber", digits);
                            }}
                            inputMode="numeric"
                            maxLength={9}
                            style={{ borderColor: fieldErrors.licenseNumber ? "var(--danger)" : licenseNumberAvailable ? "var(--success)" : undefined }} />
                        <FieldErr msg={fieldErrors.licenseNumber} />
                        {!fieldErrors.licenseNumber && licenseNumberChecking && (
                            <FieldHint msg={AVAILABILITY_MESSAGES.licenseNumber.checking} />
                        )}
                        {licenseNumberAvailable && (
                            <FieldHint tone="success" msg={AVAILABILITY_MESSAGES.licenseNumber.available} />
                        )}
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>תפוגת רישיון</label>
                        <input type="date" value={driverForm.licenseExpiry}
                            onChange={e => { setD("licenseExpiry", e.target.value); setFieldErrors(f => ({ ...f, licenseExpiry: undefined })); }}
                            min={new Date().toISOString().slice(0, 10)}
                            style={{ borderColor: fieldErrors.licenseExpiry ? "var(--danger)" : undefined }} />
                        <FieldErr msg={fieldErrors.licenseExpiry} />
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>מגדר</label>
                            <select value={driverForm.gender}
                                onChange={e => { setD("gender", e.target.value); setFieldErrors(f => ({ ...f, gender: undefined })); }}
                                style={{ borderColor: fieldErrors.gender ? "var(--danger)" : undefined }}>
                                <option value="">בחר</option>
                                <option value="male">זכר</option>
                                <option value="female">נקבה</option>
                            </select>
                            <FieldErr msg={fieldErrors.gender} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>מוזיקה אהובה</label>
                            <input placeholder="פופ, רוק, מזרחי..." value={driverForm.preferredMusic}
                                onChange={e => { setD("preferredMusic", e.target.value); setFieldErrors(f => ({ ...f, preferredMusic: undefined })); }}
                                maxLength={50}
                                style={{ borderColor: fieldErrors.preferredMusic ? "var(--danger)" : undefined }} />
                            <FieldErr msg={fieldErrors.preferredMusic} />
                        </div>
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>תחביבים (יוצג לנוסעים)</label>
                        <input placeholder="ספורט, בישול, טיולים..." value={driverForm.hobbies}
                            onChange={e => { setD("hobbies", e.target.value); setFieldErrors(f => ({ ...f, hobbies: undefined })); }}
                            maxLength={100}
                            style={{ borderColor: fieldErrors.hobbies ? "var(--danger)" : undefined }} />
                        <FieldErr msg={fieldErrors.hobbies} />
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>שפות מדוברות * <span style={{ color: "var(--danger)" }}>חובה</span></label>
                        <div style={s.tagList}>
                            {LANGS.map(lang => (
                                <span key={lang} style={s.tag(driverForm.spokenLanguages.includes(lang))}
                                    onClick={() => { toggleLang(lang); setFieldErrors(f => ({ ...f, spokenLanguages: undefined })); }}>
                                    {lang}
                                </span>
                            ))}
                        </div>
                        <FieldErr msg={fieldErrors.spokenLanguages} />
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>תנאי נסיעה</label>
                        {[
                            { key: "noSmoking", icon: "🚭", label: "ללא עישון" },
                            { key: "noPets",    icon: "🐾", label: "ללא חיות מחמד" },
                            { key: "noFood",    icon: "🍔", label: "ללא אוכל" }
                        ].map(c => (
                            <div key={c.key}
                                className={`toggle-row${driverForm.vehicleConditions[c.key] ? " active" : ""}`}
                                onClick={() => setD("vehicleConditions", { ...driverForm.vehicleConditions, [c.key]: !driverForm.vehicleConditions[c.key] })}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                                    <span style={{ fontWeight: 500, fontSize: 14 }}>{c.label}</span>
                                </div>
                                <div className="toggle-switch">
                                    <input type="checkbox" checked={driverForm.vehicleConditions[c.key]} readOnly />
                                    <span className="toggle-track" />
                                    <span className="toggle-knob" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className={`toggle-row${driverForm.acceptsCarpoolRides ? " active" : ""}`}
                        onClick={() => setD("acceptsCarpoolRides", !driverForm.acceptsCarpoolRides)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>🤝</span>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>קבל נסיעות קרפול (שיתוף עם נוסעים נוספים)</span>
                        </div>
                        <div className="toggle-switch">
                            <input type="checkbox" checked={driverForm.acceptsCarpoolRides} readOnly />
                            <span className="toggle-track" />
                            <span className="toggle-knob" />
                        </div>
                    </div>
                </div>
            )}

            {/* Step 1: Vehicle */}
            {step === 1 && (
                <div style={s.card}>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>חברה *</label>
                            <select value={vehicleForm.company}
                                onChange={e => { setV("company", e.target.value); setV("model", ""); setFieldErrors(f => ({ ...f, company: undefined })); }}
                                style={{ borderColor: fieldErrors.company ? "var(--danger)" : undefined }}>
                                <option value="">— בחר חברה —</option>
                                {Object.keys(CAR_BRANDS).map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            {vehicleForm.company === "אחר" && (
                                <input placeholder="הזן שם חברה" value={vehicleForm.companyOther || ""}
                                    onChange={e => setV("companyOther", e.target.value)}
                                    style={{ marginTop: 8 }} />
                            )}
                            <FieldErr msg={fieldErrors.company} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>דגם *</label>
                            <select value={vehicleForm.model}
                                onChange={e => { setV("model", e.target.value); setFieldErrors(f => ({ ...f, model: undefined })); }}
                                style={{ borderColor: fieldErrors.model ? "var(--danger)" : undefined }}
                                disabled={!vehicleForm.company}>
                                <option value="">— בחר דגם —</option>
                                {(CAR_BRANDS[vehicleForm.company] || []).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            {vehicleForm.model === "אחר" && (
                                <input placeholder="הזן שם דגם" value={vehicleForm.modelOther || ""}
                                    onChange={e => setV("modelOther", e.target.value)}
                                    style={{ marginTop: 8 }} />
                            )}
                            <FieldErr msg={fieldErrors.model} />
                        </div>
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>שנה *</label>
                            <select value={vehicleForm.year}
                                onChange={e => { setV("year", e.target.value); setFieldErrors(f => ({ ...f, year: undefined })); }}
                                style={{ borderColor: fieldErrors.year ? "var(--danger)" : undefined }}>
                                <option value="">— בחר שנה —</option>
                                {Array.from({ length: new Date().getFullYear() - 1989 }, (_, i) => new Date().getFullYear() - i).map(y =>
                                    <option key={y} value={y}>{y}</option>
                                )}
                            </select>
                            <FieldErr msg={fieldErrors.year} />
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>צבע *</label>
                            <select value={vehicleForm.color}
                                onChange={e => { setV("color", e.target.value); setFieldErrors(f => ({ ...f, color: undefined })); }}
                                style={{ borderColor: fieldErrors.color ? "var(--danger)" : undefined }}>
                                <option value="">— בחר צבע —</option>
                                {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {vehicleForm.color === "אחר" && (
                                <input placeholder="הזן צבע" value={vehicleForm.colorOther || ""}
                                    onChange={e => setV("colorOther", e.target.value)}
                                    style={{ marginTop: 8 }} />
                            )}
                            <FieldErr msg={fieldErrors.color} />
                        </div>
                    </div>
                    <div style={s.row}>
                        <div style={s.group}>
                            <label style={s.label}>לוחית רישוי *</label>
                            <input placeholder="1234567" value={vehicleForm.licensePlate}
                                onChange={e => {
                                    const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 8);
                                    setV("licensePlate", digits);
                                    setFieldErrors(f => ({ ...f, licensePlate: undefined }));
                                    checkSetupAvailability("licensePlate", digits);
                                }}
                                inputMode="numeric"
                                maxLength={8}
                                style={{
                                    borderColor: fieldErrors.licensePlate ? "var(--danger)" : licensePlateAvailable ? "var(--success)" : undefined,
                                    letterSpacing: 2,
                                    fontWeight: 600
                                }} />
                            <FieldErr msg={fieldErrors.licensePlate} />
                            {!fieldErrors.licensePlate && licensePlateChecking && (
                                <FieldHint msg={AVAILABILITY_MESSAGES.licensePlate.checking} />
                            )}
                            {licensePlateAvailable && (
                                <FieldHint tone="success" msg={AVAILABILITY_MESSAGES.licensePlate.available} />
                            )}
                        </div>
                        <div style={s.group}>
                            <label style={s.label}>מושבים</label>
                            <select value={vehicleForm.seats} onChange={e => setV("seats", Number(e.target.value))}>
                                {[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={s.group}>
                        <label style={s.label}>{"סוג רכב"}</label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {VEHICLE_TYPES.map(vt => (
                                <span key={vt}
                                    style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                                        border: `1.5px solid ${vehicleForm.vehicleType === vt ? "var(--primary)" : "var(--border)"}`,
                                        background: vehicleForm.vehicleType === vt ? "rgba(79,70,229,0.08)" : "var(--surface)",
                                        color: vehicleForm.vehicleType === vt ? "var(--primary)" : "var(--text-muted)", fontWeight: vehicleForm.vehicleType === vt ? 700 : 400 }}
                                    onClick={() => setV("vehicleType", vt)}>
                                    {t(vt)}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: Documents */}
            {step === 2 && (
                <div style={s.card}>
                    <div style={{ background: "#fef9c3", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: "#92400e" }}>
                        🔒 המסמכים נשמרים בצורה מאובטחת ומאושרים מיד עם ההעלאה.
                    </div>
                    <FileUpload
                        label="📷 צילום רישיון נהיגה * (חובה)"
                        preview={licensePreview}
                        onChange={handleLicenseFile}
                        fieldName="licensePhoto"
                    />
                    <FieldErr msg={fieldErrors.licensePhoto} />

                    <FileUpload
                        label="🔧 צילום אישור טסט בתוקף * (חובה)"
                        preview={testPreview}
                        onChange={(file) => setDocumentFile("testPhoto", file, setTestFile, setTestPreview)}
                        fieldName="testPhoto"
                    />
                    <FieldErr msg={fieldErrors.testPhoto} />

                    <FileUpload
                        label="🛡️ צילום אישור ביטוח בתוקף * (חובה)"
                        preview={insurancePreview}
                        onChange={(file) => setDocumentFile("insurancePhoto", file, setInsuranceFile, setInsurancePreview)}
                        fieldName="insurancePhoto"
                    />
                    <FieldErr msg={fieldErrors.insurancePhoto} />
                </div>
            )}

            {error && <p className="error-msg" role="alert">⚠️ {error}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {step > 0 && (
                    <button type="button" onClick={() => { setStep(s => s - 1); setError(""); }}
                        style={{ flex: 1, background: "var(--border)", color: "var(--text)" }}>
                        ← חזור
                    </button>
                )}
                {step < 2 ? (
                    <button type="button" className="btn-primary" style={{ flex: 2 }} disabled={currentStepChecking} onClick={goNext}>
                        הבא →
                    </button>
                ) : (
                    <button type="button" className="btn-primary" style={{ flex: 2 }} disabled={loading} onClick={handleSubmit}>
                        {loading ? "בודק מסמכים..." : "שמור וסיים ✓"}
                    </button>
                )}
            </div>
        </div>
    );
}
