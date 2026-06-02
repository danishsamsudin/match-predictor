import { PredictionForm } from "@/components/PredictionForm";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4.5rem)] w-full max-w-6xl min-w-0 flex-col items-stretch justify-center px-3 py-6 sm:items-center sm:px-6 sm:py-10">
      <PredictionForm />
    </div>
  );
}
