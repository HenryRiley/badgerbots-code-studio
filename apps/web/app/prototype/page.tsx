import type { Metadata } from "next";
import { ConnectedPrototypeLab } from "./connected-prototype-lab";

export const metadata: Metadata = {
  title: "Connected prototype | BadgerBots Code Studio",
  description: "Loopback-only proof connecting Web, control plane, Host protocol, and runtime.",
};

export default function PrototypePage() {
  return <ConnectedPrototypeLab />;
}
