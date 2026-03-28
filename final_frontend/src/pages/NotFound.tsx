import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <h1 className="text-9xl font-extrabold text-primary/20 mb-4 tracking-tighter">404</h1>
        <div className="space-y-4 max-w-md mx-auto">
          <h2 className="text-3xl font-bold">Oops! Page not found</h2>
          <p className="text-muted-foreground text-lg">
            The page you're looking for (<code>{location.pathname}</code>) doesn't exist or has been moved.
          </p>
          <div className="pt-6">
            <Link to="/">
              <Button size="lg" className="rounded-full px-8">
                Return to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
