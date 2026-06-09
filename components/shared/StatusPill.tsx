'use client';

interface StatusPillProps {
  status: string;
}

export function StatusPill({ status }: StatusPillProps) {
  const cls: Record<string, string> = {
    Open: 'pill-open',
    Closed: 'pill-closed',
    Expired: 'pill-expired',
    Assigned: 'pill-assigned',
  };
  return <span className={`pill ${cls[status] || 'pill-closed'}`}>{status}</span>;
}
