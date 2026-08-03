// src/context/AuthContext.jsx

import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);
const CLEAR_AUTH_STATUSES = new Set([401, 403, 404]);

function clearStoredAuth() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
}

function shouldClearStoredAuth(error) {
    return CLEAR_AUTH_STATUSES.has(error.response?.status);
}

export function AuthProvider({ children }) {
    const [user,    setUser]    = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token  = localStorage.getItem("token");
        const stored = localStorage.getItem("user");
        if (token && stored) {
            try {
                const parsed = JSON.parse(stored);
                api.get(`/users/${parsed.userId}`)
                    .then(({ data }) => {
                        const refreshed = { ...parsed, ...data };
                        localStorage.setItem("user", JSON.stringify(refreshed));
                        setUser(refreshed);
                    })
                    .catch((error) => {
                        if (shouldClearStoredAuth(error)) {
                            clearStoredAuth();
                            setUser(null);
                        } else {
                            setUser(parsed);
                        }
                    })
                    .finally(() => setLoading(false));
                return;
            } catch {
                clearStoredAuth();
            }
        }
        setLoading(false);
    }, []);

    const login = (userData, token) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user",  JSON.stringify(userData));
        setUser(userData);
    };

    const logout = () => {
        clearStoredAuth();
        setUser(null);
    };

    const updateUser = (patch) => {
        const updated = { ...user, ...patch };
        localStorage.setItem("user", JSON.stringify(updated));
        setUser(updated);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
