type ReceiptItWordmarkProps = {
  className?: string;
  light?: boolean;
};

export function ReceiptItWordmark({ className = '', light = false }: ReceiptItWordmarkProps) {
  return (
    <span className={`font-mono font-bold tracking-tight ${className}`} aria-label="receiptIt">
      <span className={light ? 'text-[#141a1a]' : 'text-white'}>receipt</span>
      <span className="text-teal-400">It</span>
    </span>
  );
}
