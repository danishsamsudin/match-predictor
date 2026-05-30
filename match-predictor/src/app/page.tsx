import { PredictionForm } from "@/components/PredictionForm";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Match Predictor</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Generate win probabilities, expected goals, and match stat estimates using
          team form, lineups, weather, and stadium factors.
        </p>
      </div>
      <PredictionForm />
    </div>
  );
}
