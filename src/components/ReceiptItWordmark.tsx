type ReceiptItWordmarkProps = {
  className?: string;
  light?: boolean;
};

export function ReceiptItWordmark({ className = '', light = false }: ReceiptItWordmarkProps) {
  return (
    <span
      className={`font-bold tracking-tight ${className}`}
      aria-label="receiptIt"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
    >
      <span className={light ? 'text-[#141a1a]' : 'text-white'}>receipt</span>
      <span className="text-teal-400">It</span>
    </span>
  );
}
