import TableResults from "./TableResults";

export interface TablePaginationProps {
  total: number;
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  label: string;
  onPrev: () => void;
  onNext: () => void;
}

export default function TablePagination({
  total,
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  label,
  onPrev,
  onNext,
}: TablePaginationProps) {
  return (
    <tr>
      <td colSpan={100} className="border-t border-carbon-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <TableResults
            total={total}
            page={page}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            label={label}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={page === 1}
              className="text-body-20 flex items-center gap-1 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-400 hover:bg-carbon-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              &lt; Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={page >= totalPages}
              className="text-body-20 flex items-center gap-1 rounded-full border border-carbon-200 px-4 py-1.5 text-carbon-400 transition-colors hover:border-carbon-400 hover:bg-carbon-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next &gt;
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
