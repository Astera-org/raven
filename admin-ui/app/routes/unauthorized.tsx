import Unauthorized from "~/components/Unauthorized";

export function clientLoader() {
  return null;
}

export default function UnauthorizedRoute() {
  return <Unauthorized />;
}
