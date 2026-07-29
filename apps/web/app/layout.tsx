import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const classroomStaticDeployment = process.env.BADGERBOTS_CLASSROOM_STATIC_DEPLOYMENT === "1";

export const metadata: Metadata = {
  title: classroomStaticDeployment
    ? "BadgerBots Code Studio — Classroom"
    : "BadgerBots Code Studio — Compiler Proof",
  description: classroomStaticDeployment
    ? "BadgerBots classroom coding workspace."
    : "Checkpoint 1 browser proof for the canonical Sheep City program model.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
