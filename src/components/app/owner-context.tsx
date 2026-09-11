import { createContext, type ReactNode, useContext } from "react";
import type { OwnerContext } from "@/lib/owner";

const Context = createContext<OwnerContext | null>(null);

export function OwnerProvider({ value, children }: { value: OwnerContext; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOwner(): OwnerContext {
  const value = useContext(Context);
  if (!value) throw new Error("useOwner outside of the app shell");
  return value;
}
