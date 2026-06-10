import React, { useState } from "react";

const VALIDATION_ENDPOINT = "https://sentinelprime.org/.netlify/functions/validate-product";
const PRODUCT = "shift";
const STORAGE_KEY = "sentinel_shift_activated";
const ACTIVATION_DATA_KEY = "sentinel_shift_activation";

function getMachineId() {
  try {
    let machineId = localStorage.getItem("sentinel_machine_id");
    if (!machineId) {
      machineId = `shift_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem("sentinel_machine_id", machineId);
    }
    return machineId;
  } catch {
    return `shift_${Date.now()}`;
  }
}

export function ActivationGate({ children }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isActivated, setIsActivated] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(VALIDATION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim().toUpperCase(),
          product: PRODUCT,
          machine_id: getMachineId()
        })
      });

      const result = await response.json();

      if (result.valid) {
        localStorage.setItem(STORAGE_KEY, "true");
        localStorage.setItem(
          ACTIVATION_DATA_KEY,
          JSON.stringify({
            email: email.trim().toLowerCase(),
            code: code.trim().toUpperCase(),
            activated_at: result.activated_at || new Date().toISOString()
          })
        );
        setIsActivated(true);
      } else {
        setError(result.reason || "Invalid or already used activation code. Contact customerservice@sentinelprime.org");
      }
    } catch (err) {
      setError("Unable to connect to activation service. Please check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isActivated) {
    return children;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-shift-surface px-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,.18),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(10,22,40,.95),transparent_28%)]" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-shift-navy p-8 shadow-glow">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-shift-accent/20 text-2xl font-black text-shift-accent ring-2 ring-shift-accent/30">
            S
          </div>
          <h1 className="text-2xl font-bold text-white">Shift by Sentinel</h1>
          <p className="mt-2 text-white/60">Activate your software to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter the email used for purchase"
              required
              disabled={loading}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-shift-accent focus:outline-none disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Activation Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              required
              disabled={loading}
              pattern="[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white font-mono tracking-wider placeholder:text-white/40 focus:border-shift-accent focus:outline-none disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !code}
            className="w-full rounded-xl bg-shift-accent py-3.5 text-sm font-bold text-shift-navy shadow-glow transition hover:bg-shift-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Activating..." : "Activate"}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-white/50">
            Need help? Contact{" "}
            <a
              href="mailto:customerservice@sentinelprime.org"
              className="text-shift-accent hover:underline"
            >
              customerservice@sentinelprime.org
            </a>
          </p>
          <p className="text-xs text-white/40">
            Your activation code was sent to your email after purchase.
          </p>
        </div>
      </div>
    </div>
  );
}
