import { Search } from "lucide-react";

export default function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-carbon-300" />
      <input
        type="text"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-body-20 w-full rounded-full border border-carbon-100 bg-white py-2 pl-9 pr-3 text-foreground outline-none transition-colors focus:border-carbon-300"
      />
    </div>
  );
}
