export function initAntiDev(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__antiDevInit) return;
  w.__antiDevInit = true;

  let aviso: HTMLDivElement | null = null;
  function mostrarAviso() {
    if (aviso || !document.body) return;
    aviso = document.createElement("div");
    aviso.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "padding:24px",
        "background:#04060b",
        "color:#e5e7eb",
        "font-family:system-ui,sans-serif",
        "text-align:center",
      ].join(";"),
    );
    aviso.innerHTML =
      '<div style="max-width:420px"><div style="font-size:40px">&#128274;</div>' +
      '<h1 style="margin:12px 0 8px;font-size:18px;font-weight:600">Acceso a herramientas de desarrollador detectado</h1>' +
      '<p style="margin:0;font-size:14px;opacity:.7;line-height:1.5">Por seguridad, la experiencia qued\u00f3 pausada. Cerr\u00e1 las devtools y recarg\u00e1 la p\u00e1gina para continuar.</p></div>';
    document.body.appendChild(aviso);
  }
  function quitarAviso() {
    if (aviso) {
      aviso.remove();
      aviso = null;
    }
  }

  const teclasBloqueadas = ["i", "j", "c", "k", "u"];
  document.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase() ?? "";
      if (k === "f12") {
        e.preventDefault();
        mostrarAviso();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && teclasBloqueadas.includes(k)) {
        e.preventDefault();
        mostrarAviso();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === "s") e.preventDefault();
    },
    true,
  );
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  setInterval(() => {
    const abierto =
      window.outerWidth - window.innerWidth > 170 ||
      window.outerHeight - window.innerHeight > 170;
    if (abierto) mostrarAviso();
    else quitarAviso();
  }, 1200);

  try {
    console.log(
      "%cCintia Boos \u00b7 Plataforma en desarrollo",
      "color:#2563eb;font-size:16px;font-weight:bold",
    );
    console.log("El c\u00f3digo de este sitio est\u00e1 protegido. \u00a9 Cintia Boos");
  } catch {}
}
