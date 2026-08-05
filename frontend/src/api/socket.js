import { io } from "socket.io-client";
import { SOCKET_URL } from "./config";

export function createSocket() {
    const options = {
        auth: { token: localStorage.getItem("token") || "" }
    };

    return SOCKET_URL ? io(SOCKET_URL, options) : io(options);
}
