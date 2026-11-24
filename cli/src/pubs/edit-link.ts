/** The line pointing to the web editor, when the server sent an `edit` link. */
export function editLinkLines(
  links: ReadonlyArray<{ rel: string; href: string }>
): string[] {
  const edit = links.find((link) => link.rel === "edit");
  return edit ? [`Edit it at ${edit.href}`] : [];
}
