import { useState } from "react";
import { useIOLSession } from "@/lib/herramientas/iol-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function IOLLoginButton() {
  const { accessToken, username, isLoggingIn, login, logout } = useIOLSession();
  const [showLogin, setShowLogin] = useState(false);
  const [userField, setUserField] = useState("");
  const [passField, setPassField] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    const err = await login(userField, passField);
    if (err) setError(err);
    else {
      setShowLogin(false);
      setUserField("");
      setPassField("");
    }
  };

  return (
    <div className="relative">
      {!accessToken ? (
        <>
          <button
            onClick={() => setShowLogin(!showLogin)}
            className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <span>IOL</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60">
              <path
                d="M2 4L5 7L8 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {showLogin && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-border/60 bg-surface p-4 shadow-xl z-50 space-y-3">
              <p className="text-xs text-muted-foreground">Iniciar sesi\u00F3n en InvertirOnline</p>
              <Input
                type="email"
                value={userField}
                onChange={(e) => setUserField(e.target.value)}
                placeholder="usuario@email.com"
                autoComplete="username"
                className="bg-background/40 border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary text-sm"
              />
              <Input
                type="password"
                value={passField}
                onChange={(e) => setPassField(e.target.value)}
                placeholder="contrase\u00F1a"
                autoComplete="current-password"
                className="bg-background/40 border-border/60 text-foreground placeholder:text-muted-foreground/40 focus:border-primary text-sm"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <Button
                onClick={handleLogin}
                disabled={isLoggingIn || !userField || !passField}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/80 text-xs font-semibold h-8 disabled:opacity-40"
              >
                {isLoggingIn ? "Conectando..." : "Iniciar sesi\u00F3n"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            IOL: {username}
          </span>
          <button onClick={logout} className="text-[10px] text-red-400 hover:underline">
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
