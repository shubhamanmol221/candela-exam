import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminProvider, CandidateProvider, useAdmin } from './contexts/AuthContext';

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin';
import Dashboard from './pages/admin/Dashboard';
import Assessments from './pages/admin/Assessments';
import Questions from './pages/admin/Questions';
import MCQQuestions from './pages/admin/MCQQuestions';
import Results from './pages/admin/Results';

// Candidate Pages
import CandidateLogin from './pages/candidate/CandidateLogin';
import AssessmentPage from './pages/candidate/AssessmentPage';
import MCQPage from './pages/candidate/MCQPage';

const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAdmin();
  return isAuthenticated ? <>{children}</> : <Navigate to="/admin/login" replace />;
};

import React from 'react';

function AppRoutes() {
  return (
    <Routes>
      {/* Root redirects */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Candidate routes */}
      <Route path="/login" element={<CandidateLogin />} />
      <Route path="/assessment/:assessmentId" element={<AssessmentPage />} />
      <Route path="/mcq/:assessmentId" element={<MCQPage />} />

      {/* Admin routes */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin/dashboard"
        element={<AdminGuard><Dashboard /></AdminGuard>}
      />
      <Route
        path="/admin/assessments"
        element={<AdminGuard><Assessments /></AdminGuard>}
      />
      <Route
        path="/admin/assessments/:assessmentId/questions"
        element={<AdminGuard><Questions /></AdminGuard>}
      />
      <Route
        path="/admin/assessments/:assessmentId/mcq-questions"
        element={<AdminGuard><MCQQuestions /></AdminGuard>}
      />
      <Route
        path="/admin/results"
        element={<AdminGuard><Results /></AdminGuard>}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <CandidateProvider>
          <AppRoutes />
        </CandidateProvider>
      </AdminProvider>
    </BrowserRouter>
  );
}

export default App;
