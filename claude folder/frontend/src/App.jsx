// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import LoginPage        from "./pages/LoginPage";
import RegisterPage     from "./pages/RegisterPage";
import HomePage         from "./pages/HomePage";
import BookRidePage     from "./pages/BookRidePage";
import RideStatusPage   from "./pages/RideStatusPage";
import RideHistoryPage  from "./pages/RideHistoryPage";
import DriverDashboard  from "./pages/DriverDashboard";
import ProfilePage      from "./pages/ProfilePage";
import Navbar           from "./components/Navbar";

function PrivateRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;
    return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
    const { user } = useAuth();

    return (
        <>
            {user && <Navbar />}
            <Routes>
                <Route path="/login"    element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
                <Route path="/book"    element={<PrivateRoute><BookRidePage /></PrivateRoute>} />
                <Route path="/ride/:id" element={<PrivateRoute><RideStatusPage /></PrivateRoute>} />
                <Route path="/history" element={<PrivateRoute><RideHistoryPage /></PrivateRoute>} />
                <Route path="/driver"  element={<PrivateRoute><DriverDashboard /></PrivateRoute>} />
                <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}
