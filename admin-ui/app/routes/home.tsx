import { useEffect } from "react";
import { useNavigate } from "react-router";
import Footer from "~/components/Footer";
import Navbar from "~/components/Navbar";
import { useAuth } from "~/hooks/useAuth";

export function clientLoader() {
  return null;
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="pt-navbar flex flex-1 flex-col">
        <div className="flex flex-1 flex-col bg-gray-300">
          <section className="flex-1 px-12 pb-12 pt-16">
            <h1 className="font-serif text-headline-60 mb-4 text-foreground">
              Welcome to The Stacks Admin UI
            </h1>
            <p className="text-carbon-300">
              The UI for org administrators to manage their organizations.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
