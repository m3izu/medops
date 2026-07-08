import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Suppliers from './pages/Suppliers';
import Categories from './pages/Categories';
import Items from './pages/Items';
import ReceiveStock from './pages/ReceiveStock';
import Transactions from './pages/Transactions';
import Patients from './pages/Patients';
import Requisitions from './pages/Requisitions';
import Discards from './pages/Discards';
import MgmtAudit from './pages/MgmtAudit';
import Stocktake from './pages/Stocktake';
import Reports from './pages/Reports';
import Import from './pages/Import';

// Route guard for authenticated users
const PrivateRoute = ({ children, requiredPermission }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--theme-bg)' }}>
        <p style={{ color: 'var(--theme-text-muted)' }}>Checking secure clinical session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission) {
    const isAllowed = Array.isArray(requiredPermission)
      ? requiredPermission.some(p => hasPermission(p))
      : hasPermission(requiredPermission);

    if (!isAllowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <Layout>{children}</Layout>;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public login page */}
          <Route path="/login" element={<Login />} />

          {/* Protected clinical routes */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/users"
            element={
              <PrivateRoute requiredPermission="create_users">
                <Users />
              </PrivateRoute>
            }
          />
          <Route
            path="/patients"
            element={
              <PrivateRoute requiredPermission={['manage_patients', 'submit_requisition', 'view_inventory_logs']}>
                <Patients />
              </PrivateRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <PrivateRoute requiredPermission="manage_suppliers">
                <Suppliers />
              </PrivateRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <PrivateRoute requiredPermission="manage_categories">
                <Categories />
              </PrivateRoute>
            }
          />
          <Route
            path="/items"
            element={
              <PrivateRoute>
                <Items />
              </PrivateRoute>
            }
          />
          <Route
            path="/stock/receive"
            element={
              <PrivateRoute requiredPermission="receive_stock">
                <ReceiveStock />
              </PrivateRoute>
            }
          />
          <Route
            path="/requisitions"
            element={
              <PrivateRoute>
                <Requisitions />
              </PrivateRoute>
            }
          />
          <Route
            path="/discards"
            element={
              <PrivateRoute requiredPermission="log_discard">
                <Discards />
              </PrivateRoute>
            }
          />
          <Route
            path="/stock/transactions"
            element={
              <PrivateRoute requiredPermission="view_inventory_logs">
                <Transactions />
              </PrivateRoute>
            }
          />
          <Route
            path="/mgmt/audit"
            element={
              <PrivateRoute requiredPermission="view_inventory_logs">
                <MgmtAudit />
              </PrivateRoute>
            }
          />
          <Route
            path="/stocktake"
            element={
              <PrivateRoute requiredPermission="enter_stocktake_count">
                <Stocktake />
              </PrivateRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <PrivateRoute requiredPermission="generate_reports">
                <Reports />
              </PrivateRoute>
            }
          />
          <Route
            path="/import"
            element={
              <PrivateRoute requiredPermission="bulk_import">
                <Import />
              </PrivateRoute>
            }
          />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
