export function clientLoader() {
  return null;
}

export default function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col items-center pt-[35vh] text-center">
      <h1 className="font-serif text-headline-40 text-foreground mb-4">
        Welcome to the Admin Console
      </h1>
      <p className="text-body-20 text-carbon-400">
        Use this app to configure and maintain content on The Stacks.
      </p>
    </div>
  );
}
