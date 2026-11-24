export interface TableResultsProps {
  total: number;
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  label: string;
}

export default function TableResults({
  total,
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  label,
}: TableResultsProps) {
  return (
    <span className="text-body-20 text-carbon-400">
      {total === 0
        ? `0 ${label}`
        : `${total} ${label} · ${rangeStart}–${rangeEnd} (page ${page} of ${totalPages})`}
    </span>
  );
}
