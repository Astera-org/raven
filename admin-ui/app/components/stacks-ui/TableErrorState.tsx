export default function TableErrorState({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="text-body-20 px-4 py-8 text-center text-carbon-400"
      >
        {message}
      </td>
    </tr>
  );
}
