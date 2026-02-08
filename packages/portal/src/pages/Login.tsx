import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "@/lib/auth";
import { Building2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-teal-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Building2 className="h-10 w-10 text-teal-600" />
          <div>
            <h1 className="text-3xl font-bold">Brevva</h1>
            <p className="text-sm text-teal-600">Tenant Portal</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-xl font-semibold">Sign in to your portal</h2>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border px-3 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
            placeholder="you@example.com"
          />
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-lg border px-3 py-2.5 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
            placeholder="********"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
