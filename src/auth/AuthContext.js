import { createContext } from "react";

// Valor: { usuario, autenticado, carregando, entrar, cadastrar, sair } (ver AuthProvider).
export const AuthContext = createContext(null);