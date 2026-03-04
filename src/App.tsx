/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BottomNav from './components/BottomNav';
import Tasks from './pages/Tasks';
import CreateTask from './pages/CreateTask';
import Team from './pages/Team';
import Stats from './pages/Stats';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {children}
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
import Overdue from './pages/Overdue';

// ...

          <Route path="/tasks" element={<ProtectedLayout><Tasks /></ProtectedLayout>} />
          <Route path="/overdue" element={<ProtectedLayout><Overdue /></ProtectedLayout>} />
          <Route path="/create-task" element={<ProtectedLayout><CreateTask /></ProtectedLayout>} />
          <Route path="/team" element={<ProtectedLayout><Team /></ProtectedLayout>} />
          <Route path="/stats" element={<ProtectedLayout><Stats /></ProtectedLayout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

