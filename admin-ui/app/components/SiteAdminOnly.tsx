export default function SiteAdminOnly() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <h2 className="text-carbon-400 mb-3 font-serif text-headline-20">
        Site Admins only
      </h2>
      <p className="text-carbon-300 max-w-md font-sans text-base font-light md:text-lg">
        This page is only available to Site Admins.
      </p>
    </div>
  );
}
