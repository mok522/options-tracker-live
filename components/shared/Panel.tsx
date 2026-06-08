interface PanelProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, children, className }: PanelProps) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className ?? ''}`}>
      {title && <h3 className="text-sm font-medium text-muted-foreground mb-3">{title}</h3>}
      {children}
    </div>
  );
}
