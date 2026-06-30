import { Logo } from '@/components/shared/Logo';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="dash" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', padding: 24 }}>
      <form
        method="post"
        action="/api/app-auth/login"
        style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 14, padding: 24, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><Logo /></div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Password</label>
        <input
          type="password"
          name="password"
          autoFocus
          required
          autoComplete="current-password"
          style={{ font: 'inherit', fontSize: 13, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
        />
        {error && <div style={{ fontSize: 12, color: 'var(--neg)' }}>Incorrect password</div>}
        <button
          type="submit"
          style={{ font: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 11px', borderRadius: 8, border: 0, cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
