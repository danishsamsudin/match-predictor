import { PredictionForm } from "@/components/PredictionForm";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-10">
        <h1 className="bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent dark:from-emerald-400 dark:via-teal-300 dark:to-blue-400">
          Match Predictor
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Generate win probabilities, expected goals, and match stat estimates using
          team form, lineups, weather, and stadium factors.
        </p>
      </div>
      <PredictionForm />
    </div>
  );
}
