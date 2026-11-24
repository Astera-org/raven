export function getPagination({
  page,
  perPage,
}: {
  page?: number | undefined;
  perPage?: number | undefined;
}): { page: number; perPage: number; offset: number } {
  const pageOut = Math.max(page || 1, 1);
  const perPageOut = Math.min(Math.max(perPage ?? 20, 1), 100);
  const offset = (pageOut - 1) * perPageOut;
  return { page: pageOut, perPage: perPageOut, offset };
}
