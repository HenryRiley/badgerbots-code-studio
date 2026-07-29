import { CompilerHarness } from "./compiler-harness";
import { ClassroomApp } from "./classroom/classroom-app";

export default function Home() {
  if (process.env.BADGERBOTS_CLASSROOM_STATIC_DEPLOYMENT === "1") {
    return <ClassroomApp />;
  }
  return <CompilerHarness />;
}
