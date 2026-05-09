import type { ReactNode } from "react";

interface OptionCardProps {
  title: string;
  description: string;
  badge: string;
  selected: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onClick: () => void;
}

export function OptionCard({
  title,
  description,
  badge,
  selected,
  disabled,
  children,
  onClick,
}: OptionCardProps) {
  return (
    <button
      className={`option-card ${selected ? "selected" : ""}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="option-badge">{badge}</span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {children}
    </button>
  );
}
