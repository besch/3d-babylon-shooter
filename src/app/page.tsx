import { GameContainer } from "@/components/game/GameContainer";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-0">
      <div className="w-full h-screen">
        <GameContainer />
      </div>
    </main>
  );
}
