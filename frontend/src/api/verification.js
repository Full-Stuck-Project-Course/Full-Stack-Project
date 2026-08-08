// src/api/verification.js
//
// Uploaded documents are approved automatically in this project — there is no
// human reviewer and no queue to wait in. Some records were written before that
// policy and are still stored as "pending", so every screen derives what it
// shows from this helper instead of printing the raw status. That way nothing
// can tell the user a document is "under review" when no review will happen.

export const DOCUMENT_STATUS = {
    NOT_SUBMITTED: "not_submitted",
    APPROVED: "approved",
    REJECTED: "rejected"
};

export const DOCUMENT_STATUS_LABELS = {
    [DOCUMENT_STATUS.NOT_SUBMITTED]: "לא הוגש",
    [DOCUMENT_STATUS.APPROVED]: "מאושר אוטומטית",
    [DOCUMENT_STATUS.REJECTED]: "נדחה"
};

export const DOCUMENT_STATUS_ICONS = {
    [DOCUMENT_STATUS.NOT_SUBMITTED]: "📄",
    [DOCUMENT_STATUS.APPROVED]: "✅",
    [DOCUMENT_STATUS.REJECTED]: "❌"
};

// An administrator can still reject a document by hand; everything else is
// decided by whether a file was uploaded at all.
export function documentStatus(rawStatus, hasFile) {
    if (rawStatus === DOCUMENT_STATUS.REJECTED) return DOCUMENT_STATUS.REJECTED;
    if (!hasFile) return DOCUMENT_STATUS.NOT_SUBMITTED;
    return DOCUMENT_STATUS.APPROVED;
}

export function documentStatusLabel(rawStatus, hasFile) {
    return DOCUMENT_STATUS_LABELS[documentStatus(rawStatus, hasFile)];
}

export function documentStatusIcon(rawStatus, hasFile) {
    return DOCUMENT_STATUS_ICONS[documentStatus(rawStatus, hasFile)];
}

export function documentBadgeStyle(status) {
    const approved = status === DOCUMENT_STATUS.APPROVED;
    const rejected = status === DOCUMENT_STATUS.REJECTED;
    return {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        background: approved ? "#d1fae5" : rejected ? "#fee2e2" : "#e5e7eb",
        color: approved ? "#065f46" : rejected ? "#991b1b" : "#4b5563"
    };
}

// Vehicle paperwork is only complete once both the test certificate and the
// insurance certificate exist, but each individual file is approved on arrival.
export function vehicleDocumentsStatus(vehicle) {
    const hasTest = Boolean(vehicle?.testImagePath);
    const hasInsurance = Boolean(vehicle?.insuranceImagePath);
    return {
        test: documentStatus(vehicle?.documentsVerificationStatus, hasTest),
        insurance: documentStatus(vehicle?.documentsVerificationStatus, hasInsurance),
        complete: hasTest && hasInsurance
    };
}
