import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from '../AuthForm';

// ─── Mock fetch ───────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('AuthForm', () => {
  it('should render login form by default', () => {
    render(<AuthForm onAuthSuccess={vi.fn()} />);
    expect(screen.getByText('AENEWS STUDIO')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
  });

  it('should show name field in register mode', () => {
    render(<AuthForm onAuthSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText("Don't have an account? Sign up"));
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByText('Create a new account')).toBeInTheDocument();
    expect(screen.getByText('Create Account')).toBeInTheDocument();
  });

  it('should toggle between login and register', () => {
    render(<AuthForm onAuthSuccess={vi.fn()} />);

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Already have an account? Sign in'));
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
  });

  it('should clear error on mode toggle', () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Invalid credentials' }),
    });

    render(<AuthForm onAuthSuccess={vi.fn()} />);

    const email = screen.getByPlaceholderText('your@email.com');
    const password = screen.getByPlaceholderText('Min 8 characters');

    fireEvent.change(email, { target: { value: 'test@test.com' } });
    fireEvent.change(password, { target: { value: '12345678' } });
    fireEvent.click(screen.getByText('Sign In'));

    // Wait for error to appear
    waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    // Toggle mode
    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    // Error should be cleared
    waitFor(() => {
      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
    });
  });

  it('should show error when server returns error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Invalid credentials' }),
    });

    render(<AuthForm onAuthSuccess={vi.fn()} />);

    const email = screen.getByPlaceholderText('your@email.com');
    const password = screen.getByPlaceholderText('Min 8 characters');

    await userEvent.type(email, 'test@test.com');
    await userEvent.type(password, '12345678');
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('should call onAuthSuccess on successful login', async () => {
    const onAuthSuccess = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        token: 'jwt-token-123',
        user: { id: '1', email: 'test@test.com', name: 'Test' },
      }),
    });

    render(<AuthForm onAuthSuccess={onAuthSuccess} />);

    const email = screen.getByPlaceholderText('your@email.com');
    const password = screen.getByPlaceholderText('Min 8 characters');

    await userEvent.type(email, 'test@test.com');
    await userEvent.type(password, '12345678');
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(onAuthSuccess).toHaveBeenCalledWith('jwt-token-123', {
        id: '1',
        email: 'test@test.com',
        name: 'Test',
      });
    });
  });

  it('should call onAuthSuccess on successful register', async () => {
    const onAuthSuccess = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        token: 'jwt-reg-token',
        user: { id: '2', email: 'new@test.com', name: 'NewUser' },
      }),
    });

    render(<AuthForm onAuthSuccess={onAuthSuccess} />);

    // Switch to register
    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    const name = screen.getByPlaceholderText('Your name');
    const email = screen.getByPlaceholderText('your@email.com');
    const password = screen.getByPlaceholderText('Min 8 characters');

    await userEvent.type(name, 'NewUser');
    await userEvent.type(email, 'new@test.com');
    await userEvent.type(password, '12345678');
    fireEvent.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(onAuthSuccess).toHaveBeenCalledWith('jwt-reg-token', {
        id: '2',
        email: 'new@test.com',
        name: 'NewUser',
      });
    });
  });

  it('should show error for invalid server response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    render(<AuthForm onAuthSuccess={vi.fn()} />);

    const email = screen.getByPlaceholderText('your@email.com');
    const password = screen.getByPlaceholderText('Min 8 characters');

    await userEvent.type(email, 'test@test.com');
    await userEvent.type(password, '12345678');
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Invalid response from server')).toBeInTheDocument();
    });
  });

  it('should disable submit button during loading', async () => {
    // Create a promise we control
    let resolvePromise: (value: any) => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    render(<AuthForm onAuthSuccess={vi.fn()} />);

    const email = screen.getByPlaceholderText('your@email.com');
    const password = screen.getByPlaceholderText('Min 8 characters');

    await userEvent.type(email, 'test@test.com');
    await userEvent.type(password, '12345678');
    fireEvent.click(screen.getByText('Sign In'));

    expect(screen.getByText('Please wait...')).toBeInTheDocument();

    resolvePromise!({
      ok: true,
      json: async () => ({ success: true, token: 't', user: { id: '1', email: 'e', name: 'n' } }),
    });

    await waitFor(() => {
      expect(screen.queryByText('Please wait...')).not.toBeInTheDocument();
    });
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<AuthForm onAuthSuccess={vi.fn()} />);

    const email = screen.getByPlaceholderText('your@email.com');
    const password = screen.getByPlaceholderText('Min 8 characters');

    await userEvent.type(email, 'test@test.com');
    await userEvent.type(password, '12345678');
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should have required email and password inputs', () => {
    render(<AuthForm onAuthSuccess={vi.fn()} />);
    const email = screen.getByPlaceholderText('your@email.com') as HTMLInputElement;
    const password = screen.getByPlaceholderText('Min 8 characters') as HTMLInputElement;
    expect(email.required).toBe(true);
    expect(password.required).toBe(true);
    expect(password.minLength).toBe(8);
  });

  it('should send login request to /api/auth/login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: 't', user: { id: '1', email: 'e', name: 'n' } }),
    });

    render(<AuthForm onAuthSuccess={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText('your@email.com'), 'test@test.com');
    await userEvent.type(screen.getByPlaceholderText('Min 8 characters'), '12345678');
    fireEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: '12345678' }),
      });
    });
  });

  it('should send register request to /api/auth/register with name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, token: 't', user: { id: '1', email: 'e', name: 'TestName' } }),
    });

    render(<AuthForm onAuthSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    await userEvent.type(screen.getByPlaceholderText('Your name'), 'TestName');
    await userEvent.type(screen.getByPlaceholderText('your@email.com'), 'test@test.com');
    await userEvent.type(screen.getByPlaceholderText('Min 8 characters'), '12345678');
    fireEvent.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: '12345678', name: 'TestName' }),
      });
    });
  });
});
