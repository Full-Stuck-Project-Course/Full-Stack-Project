import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import BookRidePage from "./pages/BookRidePage";
import RideStatusPage from "./pages/RideStatusPage";
import RideHistoryPage from "./pages/RideHistoryPage";
import DriverDashboard from "./pages/DriverDashboard";
import DriverOnboardingPage from "./pages/DriverOnboardingPage";
import ProfilePage from "./pages/ProfilePage";
import Navbar from "./components/Navbar";
import AccessibilityToolbar from "./components/AccessibilityToolbar";

function PrivateRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div style={{ padding: 40, textAlign: "center" }}>טוען...</div>;
    return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
    const { user } = useAuth();

    return (
        <div className="app-shell">
            {user && <Navbar />}
            <AccessibilityToolbar />
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/register" element={<RegisterPage />} />

                <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
                <Route path="/book" element={<PrivateRoute><BookRidePage /></PrivateRoute>} />
                <Route path="/ride/:id" element={<PrivateRoute><RideStatusPage /></PrivateRoute>} />
                <Route path="/history" element={<PrivateRoute><RideHistoryPage /></PrivateRoute>} />
                <Route path="/driver" element={<PrivateRoute><DriverDashboard /></PrivateRoute>} />
                <Route path="/driver/onboarding" element={<PrivateRoute><DriverOnboardingPage /></PrivateRoute>} />
                <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
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
