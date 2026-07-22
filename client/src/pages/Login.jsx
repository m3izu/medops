import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import healingHandsLogo from '../assets/healinghands.png';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error || 
        'Invalid username or password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoAdmin = () => {
    setUsername('admin');
    setPassword('shepkira123');
    setError('');
  };

  return (
    <div className="login-wrapper">
      <div className="login-card-container">
        <div className="login-header-logo">
          <img 
            src={healingHandsLogo} 
            alt="Healing Hands Center" 
            className="login-brand-img"
          />
          <p className="login-brand-subtitle">MedOPS Dialysis Inventory & Patient Operations</p>
        </div>

        <div className="login-card-body">
          {error && <div className="login-error-banner">{error}</div>}
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" htmlFor="username">Username</label>
              <div className="search-input-wrapper">
                <input
                  id="username"
                  className="form-control login-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter system username"
                  disabled={submitting}
                  autoFocus
                />
              </div>
            </div>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" htmlFor="password">Password</label>
              <div className="search-input-wrapper">
                <input
                  id="password"
                  className="form-control login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter security password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  style={{ right: '12px', fontSize: '16px' }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '12px' }}>
              <button
                type="button"
                onClick={fillDemoAdmin}
                className="btn btn-sm btn-outline"
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                ⚡ Quick Fill Admin Credentials
              </button>
            </div>
            
            <button 
              type="submit" 
              className="btn btn-primary login-submit-btn"
              disabled={submitting}
            >
              {submitting ? 'Authenticating...' : 'Sign In to Portal'}
            </button>
          </form>
        </div>

        <div className="login-footer-credits">
          <a 
            href="https://www.linkedin.com/in/franco-galendez-923242402" 
            target="_blank" 
            rel="noopener noreferrer"
            className="linkedin-credit-link"
            title="Connect on LinkedIn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
};

export default Login;
