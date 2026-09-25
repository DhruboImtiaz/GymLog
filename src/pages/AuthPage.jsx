import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // If already logged in, they shouldn't need to be here
  React.useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email, password);
        // Will auto-redirect via useEffect above
      } else {
        await signUp(email, password);
        setMessage('Check your email for the confirmation link.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during authentication.');
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
            <h1 className="page-title">{isLogin ? 'Log In' : 'Sign Up'}</h1>
            <p className="page-sub">Sync your GymLog data to the cloud.</p>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
          <form onSubmit={handleSubmit}>
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

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {loading ? 'Loading...' : (isLogin ? 'Log In' : 'Sign Up')}
            </button>
          </form>

          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem' }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '0.5rem 1rem', borderRadius: 'var(--r3)', border: 'none' }}
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setMessage('');
              }}
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
            </button>
          </div>

          {isLogin && (
            <div style={{ marginTop: '0.5rem', textAlign: 'center', fontSize: '0.85rem' }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '0.5rem 1rem', borderRadius: 'var(--r3)', border: 'none', color: 'var(--text2)' }}
                onClick={() => navigate('/reset-password')}
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
