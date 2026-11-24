import Badge from "~/components/stacks-ui/Badge";

export default function PublicationStatusBadge({ state }: { state: string }) {
  if (state === "PUBLISHED") return <Badge variant="success">Published</Badge>;
  if (state === "DELETED") return <Badge variant="neutral">Removed</Badge>;
  return (
    <Badge variant="neutral">
      {state.charAt(0) + state.slice(1).toLowerCase()}
    </Badge>
  );
}
