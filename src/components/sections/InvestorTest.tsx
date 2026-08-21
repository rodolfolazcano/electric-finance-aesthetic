// @ts-nocheck
import { useState } from "react";
import { QUESTIONS, scoreToProfile, PROFILE_INFO, SECTION_NAMES } from "@/lib/investor-test";
import type { InvestorProfile } from "@/lib/investor-test";

type Step = "intro" | "questions" | "result";

export function InvestorTest() {
  const [step, setStep] = useState<Step>("intro");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<InvestorProfile | null>(null);

  const totalQ = QUESTIONS.length;
  const answered = Object.keys(answers).length;

  const handleAnswer = (questionId: number, score: number) => {
    const next = { ...answers, [questionId]: score };
    setAnswers(next);
    if (Object.keys(next).length === totalQ) {
      const htQs = QUESTIONS.filter((q) => q.section === "horizonte");
      const trQs = QUESTIONS.filter((q) => q.section === "tolerancia");
      const htScore = htQs.reduce((s, q) => s + (next[q.id] ?? 0), 0);
      const trScore = trQs.reduce((s, q) => s + (next[q.id] ?? 0), 0);
      setResult(scoreToProfile(htScore, trScore));
      setStep("result");
    }
  };

  const handleRestart = () => {
    setAnswers({});
    setResult(null);
    setStep("intro");
  };

  const currentQ = step === "questions" ? QUESTIONS[answered] : null;
  const progress = totalQ > 0 ? (answered / totalQ) * 100 : 0;
  const currentSection = currentQ?.section ?? null;

  if (step === "intro") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="glass p-8">
          <h3 className="text-lg font-medium tracking-tight">Test del Inversor</h3>
          <p className="mt-3 text-sm text-muted-foreground">
            Con el objeto de conocer su perfil como inversor, conteste en forma meditada (tómese su
            tiempo y espacio para hacerlo) y responda de manera veraz sin tergiversar su actitud o
            expectativas.
          </p>
          <p className="mt-2 text-sm italic text-muted-foreground">
            Recuerde que: "Ser más tolerante al riesgo ('arriesgado') no es ser mejor inversor".
          </p>

          <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 p-4">
            <h4 className="text-xs font-medium text-foreground">Metodología</h4>
            <ul className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
              <li>Seleccioná solo una alternativa por pregunta.</li>
              <li>
                El test tiene dos secciones: <strong>Horizonte Temporal</strong> (2 preguntas) y{" "}
                <strong>Tolerancia al Riesgo</strong> (5 preguntas).
              </li>
              <li>
                Respondidas todas las preguntas, tus puntajes determinarán tu perfil como inversor.
              </li>
            </ul>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
              <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Horizonte temporal
              </div>
              <div className="mono mt-1 text-xs text-foreground">2 preguntas</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
              <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Tolerancia al riesgo
              </div>
              <div className="mono mt-1 text-xs text-foreground">5 preguntas</div>
            </div>
          </div>

          <button
            onClick={() => setStep("questions")}
            className="mt-6 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Comenzar test
          </button>
        </div>
      </div>
    );
  }

  if (step === "result" && result) {
    const info = PROFILE_INFO[result];
    const htQs = QUESTIONS.filter((q) => q.section === "horizonte");
    const trQs = QUESTIONS.filter((q) => q.section === "tolerancia");
    const htScore = htQs.reduce((s, q) => s + (answers[q.id] ?? 0), 0);
    const trScore = trQs.reduce((s, q) => s + (answers[q.id] ?? 0), 0);

    return (
      <div className="mx-auto max-w-2xl">
        <div className="glass p-8">
          <div className="text-center">
            <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">
              Tu perfil de inversor
            </div>
            <h3 className="mt-2 text-2xl font-medium tracking-tight text-primary">{result}</h3>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
              <div className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
                Horizonte temporal
              </div>
              <div className="mono mt-1 text-lg font-light text-foreground">{htScore}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
              <div className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
                Tolerancia al riesgo
              </div>
              <div className="mono mt-1 text-lg font-light text-foreground">{trScore}</div>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{info.description}</p>

          <div className="mt-6">
            <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Composición sugerida de cartera
            </div>
            <div className="space-y-2">
              {info.allocation.map((a) => (
                <div key={a.label} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">{a.label}</span>
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-muted sm:w-48">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${a.pct}%` }}
                    />
                  </div>
                  <span className="mono w-8 text-right text-xs text-foreground">{a.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            Las estrategias de inversión que se presentan reflejan como la teoría de la inversión
            financiera postula que un inversor debería distribuir su dinero de manera genérica.
            Estas proporciones en la cartera surgen de estudios académicos y es deseable que el
            inversor periódicamente revise su perfil para adaptar la cartera a las necesidades de
            cada momento de su vida.
          </p>

          <p className="mt-4 text-xs text-muted-foreground">
            Este test es una herramienta orientativa y no reemplaza un análisis financiero
            personalizado. El resultado no constituye una recomendación de inversión.
          </p>

          <button
            onClick={handleRestart}
            className="mt-6 rounded-md border border-border bg-surface px-4 py-2 text-xs text-muted-foreground hover-lift hover:text-foreground"
          >
            Volver a hacer el test
          </button>
        </div>
      </div>
    );
  }

  if (!currentQ) return null;

  const sectionChanged =
    answered === 0 || (answered > 0 && QUESTIONS[answered - 1]?.section !== currentQ.section);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="glass p-8">
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="mono">
              {currentSection && SECTION_NAMES[currentSection]} — Pregunta{" "}
              {QUESTIONS.filter((q) => q.section === currentSection).findIndex(
                (q) => q.id === currentQ.id,
              ) + 1}{" "}
              de {QUESTIONS.filter((q) => q.section === currentSection).length}
            </span>
            <span className="mono">{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {sectionChanged && currentSection && (
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
            <span className="mono text-[14px] uppercase tracking-[0.18em] text-primary">
              Sección: {SECTION_NAMES[currentSection]}
            </span>
          </div>
        )}

        <h3 className="text-base font-medium tracking-tight sm:text-lg">{currentQ.text}</h3>

        <div className="mt-6 grid gap-2">
          {currentQ.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(currentQ.id, opt.score)}
              className="w-full rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
            >
              <span className="mr-2 font-medium text-foreground/60">
                {String.fromCharCode(65 + i)}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
