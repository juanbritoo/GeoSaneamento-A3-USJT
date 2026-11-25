import { useContext } from "react";

import { AuthContext } from "./AuthContext";

export function useAuth() {
  const contexto = useContext(AuthContext);

  if (contexto === null) {
    throw new Error("useAuth deve ser usado dentro de <AuthProvider>.");
  }

  return contexto;
}   