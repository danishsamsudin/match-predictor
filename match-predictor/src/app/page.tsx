import { PredictionForm } from "@/components/PredictionForm";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary-emphasis">
          AI Match Intelligence
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-gradient sm:text-5xl">
          Match Predictor
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Generate win probabilities, expected goals, and match stat estimates using
          team form, lineups, weather, and stadium factors.
        </p>
      </div>
      <PredictionForm />
    </div>
  );
}
