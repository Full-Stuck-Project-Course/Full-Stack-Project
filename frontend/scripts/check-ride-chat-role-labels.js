const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const rideStatusPage = readFileSync(join(__dirname, "..", "src", "pages", "RideStatusPage.jsx"), "utf8");

assert(
    /function\s+isAssignedDriverUser\s*\(ride,\s*user\)/.test(rideStatusPage) &&
        /ride\.driverId\?\._id\s*===\s*user\?\.driverId/.test(rideStatusPage) &&
        /ride\.driverId\?\.userId\?\._id\s*===\s*user\?\.userId/.test(rideStatusPage),
    "RideStatusPage must detect when the current user is the assigned driver."
);

assert(
    /function\s+getChatPeerInfo\s*\(ride,\s*user\)/.test(rideStatusPage) &&
        rideStatusPage.includes('multipleCarpoolPassengers ? "נוסעי הקרפול" : "הנוסע"') &&
        rideStatusPage.includes(': "הנהג"'),
    "RideStatusPage must label the chat peer by the current user's ride role, including multi-passenger carpool rides."
);

assert(
    /title:\s*`צ'אט עם \$\{peerRole\}\$\{peerName \? ` - \$\{peerName\}` : ""\}`/.test(rideStatusPage) &&
        !/💬\s*\{"צ'אט עם הנהג"\}/.test(rideStatusPage),
    "RideStatusPage chat title must not be hardcoded to the driver."
);

assert(
    /senderName:\s*getChatPeerInfo\(ride,\s*user\)\.senderName/.test(rideStatusPage) &&
        /senderFallback:\s*driverView\s*\?\s*"נהג"\s*:\s*"נוסע"/.test(rideStatusPage),
    "RideStatusPage chat sender fallback must match driver/passenger context."
);

// An admin supervising someone else's ride is a third party. Falling through to
// the passenger branch titled their chat "with the driver" and signed their
// messages as the passenger, to both real participants.
assert(
    /function\s+isAdminObserver\s*\(ride,\s*user\)/.test(rideStatusPage) &&
        /user\?\.role\s*===\s*"admin"\s*&&\s*\n?\s*!isAssignedDriverUser\(ride,\s*user\)\s*&&\s*\n?\s*!isRidePassengerUser\(ride,\s*user\)/.test(rideStatusPage),
    "RideStatusPage must treat an admin as a ride participant only when they are actually the driver or passenger."
);

assert(
    /if\s*\(isAdminObserver\(ride,\s*user\)\)\s*\{[\s\S]*?צ'אט הנסיעה - הנהג והנוסע/.test(rideStatusPage) &&
        rideStatusPage.includes('senderFallback: "מנהל"'),
    "An admin must see the ride chat labelled for both sides, not the passenger's view of it."
);

assert(
    rideStatusPage.includes('`${user.fullName} (מנהל)`'),
    "An admin's chat messages must be signed as an admin so the driver and passenger know who is writing."
);

assert(
    /isAdminObserver\(ride,\s*user\)\)\s*return\s*"מחכה לך הודעה חדשה בצ'אט הנסיעה"/.test(rideStatusPage),
    "An admin's incoming-message toast must not claim the message came from the driver."
);

assert(
    rideStatusPage.includes("unreadMessages") &&
        rideStatusPage.includes("chatBadge") &&
        rideStatusPage.includes("chatNotice") &&
        rideStatusPage.includes("מחכה לך הודעה חדשה"),
    "RideStatusPage must show an unread chat badge and in-app toast for incoming messages."
);

assert(
    rideStatusPage.includes("chatOpenRef.current") &&
        rideStatusPage.includes("setUnreadMessages(0)") &&
        rideStatusPage.includes("openChat"),
    "RideStatusPage must clear unread chat indicators when the chat is opened."
);

console.log("Ride chat role labels check passed: drivers see passenger chat labels and passengers see driver chat labels.");
