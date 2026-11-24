export default function TableEmptyState({
  colSpan,
  label,
}: {
  colSpan: number;
  label: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="text-body-20 px-4 py-8 text-center text-carbon-400"
      >
        No {label} found
      </td>
    </tr>
  );
}
