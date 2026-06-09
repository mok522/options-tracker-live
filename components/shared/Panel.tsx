interface PanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, children, className }: PanelProps) {
  return (
    <div
      className={`rounded-[10px] border border-border bg-card flex flex-col ${className ?? ''}`}
      style={{ boxShadow: 'var(--shadow-panel)' }}
    >
      {title && (
        <div className="px-4 pt-3.5 pb-0">
          <h3 className="text-[13px] font-semibold tracking-[-0.1px] text-[var(--text-1)]">
            {title}
          </h3>
        </div>
      )}
      <div className={`flex-1 p-4 ${title ? 'pt-3' : ''}`}>{children}</div>
    </div>
  );
}
