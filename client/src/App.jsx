import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';

// Eagerly load login to ensure instant login page presentation
import Login from './pages/Login';

// Dynamic Lazy Imports for Page Components (Route Code-Splitting)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Users = lazy(() => import('./pages/Users'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Categories = lazy(() => import('./pages/Categories'));
const Items = lazy(() => import('./pages/Items'));
const ReceiveStock = lazy(() => import('./pages/ReceiveStock'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Patients = lazy(() => import('./pages/Patients'));
const Requisitions = lazy(() => import('./pages/Requisitions'));
const Discards = lazy(() => import('./pages/Discards'));
const MgmtAudit = lazy(() => import('./pages/MgmtAudit'));
const Stocktake = lazy(() => import('./pages/Stocktake'));
const Reports = lazy(() => import('./pages/Reports'));
const Import = lazy(() => import('./pages/Import'));
const Dispense = lazy(() => import('./pages/Dispense'));
const CashierLog = lazy(() => import('./pages/CashierLog'));
const ReturnItem = lazy(() => import('./pages/ReturnItem'));
const Transfers = lazy(() => import('./pages/Transfers'));
const Manual = lazy(() => import('./pages/Manual'));
const UserProfile = lazy(() => import('./pages/UserProfile'));

// Fallback loader while route chunk is loaded over network
const RouteLoader = () => (
  <div style={{ display: 'flex', height: '60vh', width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
    <div style={{ fontSize: '24px' }}>🩺</div>
    <p style={{ margin: 0, fontSize: '13px', fontWeight: '500', color: 'var(--theme-text-muted)' }}>Loading clinical module...</p>
  </div>
);

// Catch network or chunk loading errors when fetching React.lazy() bundles
class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Route chunk load error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', height: '60vh', width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px' }}>⚠️</div>
          <h3 style={{ margin: 0, color: 'var(--theme-text-bold)' }}>Network Connection Interrupted</h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--theme-text-muted)', maxWidth: '400px' }}>
            Failed to load clinical page module. This may happen during temporary connection drops or system updates.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            ↻ Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
        <RouteErrorBoundary>
          <Suspense fallback={<RouteLoader />}>
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
                path="/profile"
                element={
                  <PrivateRoute>
                    <UserProfile />
                  </PrivateRoute>
                }
              />
              <Route
                path="/profile/:id"
                element={
                  <PrivateRoute>
                    <UserProfile />
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
                path="/stock/transfers"
                element={
                  <PrivateRoute requiredPermission={['receive_stock', 'manage_items', 'submit_requisition', 'view_inventory_logs']}>
                    <Transfers />
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
              <Route
                path="/dispense"
                element={
                  <PrivateRoute requiredPermission="dispense_item">
                    <Dispense />
                  </PrivateRoute>
                }
              />
              <Route
                path="/returns"
                element={
                  <PrivateRoute requiredPermission="return_item">
                    <ReturnItem />
                  </PrivateRoute>
                }
              />
              <Route
                path="/cashier"
                element={
                  <PrivateRoute requiredPermission="record_billing">
                    <CashierLog />
                  </PrivateRoute>
                }
              />
              <Route
                path="/manual"
                element={
                  <PrivateRoute>
                    <Manual />
                  </PrivateRoute>
                }
              />

              {/* Fallback route */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </Router>
    </AuthProvider>
  );
}

export default App;
