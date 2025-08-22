import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import MainLayout from "@/components/layout/MainLayout";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import Dashboard from "@/pages/Dashboard";
import Logs from "@/pages/Logs";
import Reports from "@/pages/Reports";
import Home from "@/pages/Home";
import Cameras from "@/pages/Cameras";
import RecordingsPage from "@/pages/RecordingsPage";
import Users from "@/pages/Users";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";
import Security from "@/pages/Security";
import StreamViewPage from "@/pages/StreamViewPage";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
          
          {/* Protected Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
          </Route>
          
          <Route path="/cameras" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Cameras />} />
          </Route>
          
          <Route path="/stream/:id" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<StreamViewPage />} />
          </Route>
          

          
          <Route path="/logs" element={
            <ProtectedRoute allowedUserTypes={['ADMIN', 'INTEGRATOR']}>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Logs />} />
          </Route>
          
          <Route path="/recordings" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<RecordingsPage />} />
          </Route>
          
          
          <Route path="/users" element={
            <ProtectedRoute requiredUserType="ADMIN">
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Users />} />
          </Route>
          
          <Route path="/reports" element={
            <ProtectedRoute allowedUserTypes={['ADMIN', 'INTEGRATOR']}>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Reports />} />
          </Route>
          
          <Route path="/security" element={
            <ProtectedRoute requiredUserType="ADMIN">
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Security />} />
          </Route>
          
          <Route path="/settings" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Settings />} />
          </Route>
          
          <Route path="/profile" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Profile />} />
          </Route>
          
          {/* Error Routes */}
          <Route path="/unauthorized" element={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>
                <p className="text-gray-600 mb-4">Você não tem permissão para acessar esta página.</p>
                <button 
                  onClick={() => window.history.back()}
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
                >
                  Voltar
                </button>
              </div>
            </div>
          } />
          
          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
