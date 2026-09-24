import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { resetPassword, updatePassword, user } = useAuth();
  
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // If user is logged in (which happens when they click the recovery link), they see the "Set New Password" form
  const isRecoveryMode = !!user;

  const handleSendReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await resetPassword(email);
      setMessage('Password reset instructions sent. Please check your email.');
    } catch (err) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await updatePassword(newPassword);
      setMessage('Password updated successfully! You can now return to the app.');
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page active">
      <div className="content">
        <div className="page-header">
          <div className="page-header-left">
            <button className="back-btn" onClick={() => navigate(-1)}>
              ← Back
            </button>
            <h1 className="page-title">{isRecoveryMode ? 'Set New Password' : 'Reset Password'}</h1>
            <p className="page-sub">
              {isRecoveryMode ? 'Enter a new password for your account.' : 'Enter your email to receive recovery instructions.'}
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
          {error && (
            <div style={{ background: 'var(--rdim)', color: 'var(--red)', padding: '0.75rem', borderRadius: 'var(--r3)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ background: 'var(--gdim)', color: 'var(--green)', padding: '0.75rem', borderRadius: 'var(--r3)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {message}
            </div>
          )}

          {!isRecoveryMode ? (
            <form onSubmit={handleSendReset}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
                style={{ marginTop: '0.5rem' }}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUpdatePassword}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              
              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
                style={{ marginTop: '0.5rem' }}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
