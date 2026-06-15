const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^(\+972|0)?5\d[-\s]?\d{7}$/;
const idPattern = /^\d{5,12}$/;

export function passwordChecklist(password) {
    return {
        length: password.length >= 8,
        lower: /[a-z]/.test(password),
        upper: /[A-Z]/.test(password),
        number: /\d/.test(password)
    };
}

export function isStrongPassword(password) {
    return Object.values(passwordChecklist(password)).every(Boolean);
}

export function validateLogin(form) {
    const errors = {};
    if (!emailPattern.test(form.email.trim())) errors.email = "הכניסי אימייל תקין";
    if (!form.password) errors.password = "חובה להזין סיסמה";
    return errors;
}

export function validateRegistration(form) {
    const errors = {};

    if (form.fullName.trim().length < 2) errors.fullName = "שם מלא חייב להכיל לפחות 2 תווים";
    if (!phonePattern.test(form.phone.trim())) errors.phone = "מספר טלפון ישראלי לא תקין";
    if (!emailPattern.test(form.email.trim())) errors.email = "כתובת אימייל לא תקינה";
    if (!isStrongPassword(form.password)) {
        errors.password = "הסיסמה חייבת לכלול 8 תווים, אות גדולה, אות קטנה ומספר";
    }
    if (!idPattern.test(form.idNumber.trim())) errors.idNumber = "מספר תעודת זהות לא תקין";
    if (!form.profileImage) errors.profileImage = "חובה להעלות תמונת פרופיל";
    if (!form.idDocumentImage) errors.idDocumentImage = "חובה להעלות צילום תעודת זהות";

    return errors;
}

export function validateDriverStep(step, form) {
    const errors = {};

    if (step === 1) {
        if (!form.driverLicenseImage) errors.driverLicenseImage = "חובה להעלות צילום רישיון נהיגה";
        if (form.licenseNumber.trim().length < 5) errors.licenseNumber = "מספר רישיון נהיגה קצר מדי";
    }

    if (step === 2) {
        if (!form.company.trim()) errors.company = "חובה להזין חברת רכב";
        if (!form.model.trim()) errors.model = "חובה להזין דגם רכב";
        if (!/^\d{4}$/.test(String(form.year))) errors.year = "שנת רכב חייבת להכיל 4 ספרות";
        if (!form.color.trim()) errors.color = "חובה להזין צבע";
        if (form.licensePlate.trim().length < 5) errors.licensePlate = "מספר רישוי לא תקין";
        if (!form.testApproval) errors.testApproval = "חובה לסמן שיש אישור טסט";
        if (!form.insuranceApproval) errors.insuranceApproval = "חובה לסמן שיש ביטוח תקף";
    }

    if (step === 3) {
        if (form.spokenLanguages.length === 0) errors.spokenLanguages = "בחרי לפחות שפה אחת";
        if (!form.preferredMusic.trim()) errors.preferredMusic = "הוסיפי מוזיקה אהובה או תחביב";
    }

    return errors;
}

export function validateForgotPassword(form, step) {
    const errors = {};
    if (!emailPattern.test(form.email.trim())) errors.email = "הכניסי אימייל תקין";
    if (step === "reset") {
        if (!/^\d{6}$/.test(form.code.trim())) errors.code = "קוד האיפוס חייב להכיל 6 ספרות";
        if (!isStrongPassword(form.newPassword)) {
            errors.newPassword = "הסיסמה החדשה חייבת לכלול 8 תווים, אות גדולה, אות קטנה ומספר";
        }
    }
    return errors;
}
