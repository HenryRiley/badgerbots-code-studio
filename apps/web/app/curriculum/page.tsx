import { CurriculumAuthoringLab } from "./curriculum-authoring-lab";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BadgerBots Code Studio — Curriculum Authoring Lab",
  description: "Source-gated local curriculum authoring proof for BadgerBots Code Studio.",
};

export default function CurriculumPage() {
  return <CurriculumAuthoringLab />;
}
