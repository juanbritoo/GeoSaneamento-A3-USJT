import { LogIn, LogOut, UserRound } from "lucide-react";

import { useAuth } from "../../auth/useAuth";
import "./ContaUsuario.css";

/** Área da conta no cabeçalho: botão "Entrar" (visitante) ou nome + "Sair" (cadastrado). */
export default function ContaUsuario({ onEntrar }) {
  const { usuario, autenticado, carregando, sair } = useAuth();

  // Enquanto o token salvo é validado, não mostra nada para evitar "piscar" Entrar/Sair.
  if (carregando) return null;

  if (!autenticado) {
    return (
      <div className="conta-usuario">
        <button type="button" className="conta-botao" onClick={onEntrar}>
          <LogIn size={22} aria-hidden="true" />
          Entrar
        </button>
      </div>
    );
  }

  return (
    <div className="conta-usuario">
      <span className="conta-nome" title={usuario.email}>
        <UserRound size={22} aria-hidden="true" />
        {usuario.nome}
      </span>
      <button type="button" className="conta-botao" onClick={sair}>
        <LogOut size={22} aria-hidden="true" />
        Sair
      </button>
    </div>
  );
}