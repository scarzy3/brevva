import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Building2 } from "lucide-react";

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    organizationName: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.organizationName.trim()) e.organizationName = "Organization name is required";
    else if (form.organizationName.length < 2) e.organizationName = "Must be at least 2 characters";
    if (!form.firstName.trim()) e.firstName = "First name is required";
    if (!form.lastName.trim()) e.lastName = "Last name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email address";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    return e;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setServerError("");
    setLoading(true);
    try {
      const data = await api<{
        accessToken: string;
        refreshToken: string;
        user: any;
        organization: any;
      }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          organizationName: form.organizationName,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
        }),
      });

      // Store auth data and redirect (same shape as login response)
      localStorage.setItem(
        "auth",
        JSON.stringify({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        })
      );
      // Trigger a page reload to pick up the new auth state
      window.location.href = "/";
    } catch (err: any) {
      const msg =
        err?.data?.message || err?.data?.error || "Registration failed. Please try again.";
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const inputCls =
    "mb-1 w-full rounded-lg border px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
  const errorCls = "mb-3 text-xs text-red-600";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Building2 className="h-10 w-10 text-blue-600" />
          <h1 className="text-3xl font-bold">Brevva</h1>
        </div>
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-xl font-semibold">Create your account</h2>
          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{serverError}</div>
          )}

          <label className="mb-1 block text-sm font-medium">Organization Name</label>
          <input
            type="text"
            value={form.organizationName}
            onChange={set("organizationName")}
            className={inputCls}
            placeholder="Your company or portfolio name"
          />
          {errors.organizationName && <p className={errorCls}>{errors.organizationName}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={set("firstName")}
                className={inputCls}
              />
              {errors.firstName && <p className={errorCls}>{errors.firstName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={set("lastName")}
                className={inputCls}
              />
              {errors.lastName && <p className={errorCls}>{errors.lastName}</p>}
            </div>
          </div>

          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            className={inputCls}
            placeholder="you@example.com"
          />
          {errors.email && <p className={errorCls}>{errors.email}</p>}

          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            className={inputCls}
            placeholder="Min. 8 characters"
          />
          {errors.password && <p className={errorCls}>{errors.password}</p>}

          <label className="mb-1 block text-sm font-medium">Confirm Password</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={set("confirmPassword")}
            className={inputCls}
            placeholder="Re-enter your password"
          />
          {errors.confirmPassword && <p className={errorCls}>{errors.confirmPassword}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-blue-600 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
