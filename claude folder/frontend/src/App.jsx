// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider }      from "./context/LanguageContext";

import LoginPage          from "./pages/LoginPage";
import RegisterPage       from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage  from "./pages/ResetPasswordPage";
import HomePage           from "./pages/HomePage";
import BookRidePage       from "./pages/BookRidePage";
import RideStatusPage     from "./pages/RideStatusPage";
import RideHistoryPage    from "./pages/RideHistoryPage";
import DriverDashboard    from "./pages/DriverDashboard";
import PassengerDashboard from "./pages/PassengerDashboard";
import DriverSetupPage    from "./pages/DriverSetupPage";
import ProfilePage        from "./pages/ProfilePage";
import RatingPage         from "./pages/RatingPage";
import AdminPanel         from "./pages/AdminPanel";
import Navbar             from "./components/Navbar";

function PrivateRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="spinner" aria-label="טוען..." />;
    return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="spinner" />;
    return user?.role === "admin" ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
    const { user } = useAuth();

    return (
        <>
            <a href="#main-content" className="skip-nav">דלג לתוכן הראשי</a>
            {user && <Navbar />}
            <main id="main-content">
                <Routes>
                    <Route path="/login"          element={<LoginPage />} />
                    <Route path="/register"        element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password"  element={<ResetPasswordPage />} />

                    <Route path="/"              element={<PrivateRoute><HomePage /></PrivateRoute>} />
                    <Route path="/book"          element={<PrivateRoute><BookRidePage /></PrivateRoute>} />
                    <Route path="/ride/:id"       element={<PrivateRoute><RideStatusPage /></PrivateRoute>} />
                    <Route path="/rate/:id"       element={<PrivateRoute><RatingPage /></PrivateRoute>} />
                    <Route path="/history"        element={<PrivateRoute><RideHistoryPage /></PrivateRoute>} />
                    <Route path="/driver"         element={<PrivateRoute><DriverDashboard /></PrivateRoute>} />
                    <Route path="/passenger"      element={<PrivateRoute><PassengerDashboard /></PrivateRoute>} />
                    <Route path="/driver-setup"   element={<PrivateRoute><DriverSetupPage /></PrivateRoute>} />
                    <Route path="/profile"        element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
                    <Route path="/admin"          element={<AdminRoute><AdminPanel /></AdminRoute>} />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </>
    );
}

export default function App() {
    return (
        <LanguageProvider>
            <AuthProvider>
                <BrowserRouter>
                    <AppRoutes />
                </BrowserRouter>
            </AuthProvider>
        </LanguageProvider>
    );
}
