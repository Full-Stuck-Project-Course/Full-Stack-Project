import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

export function createSocket() {
    return io(SOCKET_URL, {
        auth: { token: localStorage.getItem("token") || "" }
    });
}
