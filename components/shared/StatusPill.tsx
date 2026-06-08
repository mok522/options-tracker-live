import type { PositionStatus } from '@/types';

interface StatusPillProps {
  status: PositionStatus;
}

const STATUS_STYLES: Record<PositionStatus, string> = {
  Open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Closed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  Assigned: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
