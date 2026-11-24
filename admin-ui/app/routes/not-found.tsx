import ErrorPage from "~/components/ErrorPage";

export function clientLoader() {
  return null;
}

export default function NotFoundRoute() {
  return <ErrorPage status={404} />;
}
