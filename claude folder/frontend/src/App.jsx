// src/App.jsx

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import store from "./store";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider }      from "./context/LanguageContext";

import LoginPage    from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Navbar       from "./components/Navbar";

const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage  = lazy(() => import("./pages/ResetPasswordPage"));
const HomePage           = lazy(() => import("./pages/HomePage"));
const BookRidePage       = lazy(() => import("./pages/BookRidePage"));
const RideStatusPage     = lazy(() => import("./pages/RideStatusPage"));
const RideHistoryPage    = lazy(() => import("./pages/RideHistoryPage"));
const DriverDashboard    = lazy(() => import("./pages/DriverDashboard"));
const PassengerDashboard = lazy(() => import("./pages/PassengerDashboard"));
const DriverSetupPage    = lazy(() => import("./pages/DriverSetupPage"));
const ProfilePage        = lazy(() => import("./pages/ProfilePage"));
const RatingPage         = lazy(() => import("./pages/RatingPage"));
const AdminPanel         = lazy(() => import("./pages/AdminPanel"));

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
                <Suspense fallback={<div className="spinner" aria-label="טוען..." />}>
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
                </Suspense>
            </main>
        </>
    );
}

export default function App() {
    return (
        <Provider store={store}>
            <LanguageProvider>
                <AuthProvider>
                    <BrowserRouter>
                        <AppRoutes />
                    </BrowserRouter>
                </AuthProvider>
            </LanguageProvider>
        </Provider>
    );
}
