import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buscarUsuarioAtual,
  cadastrarUsuario,
  entrarUsuario,
  lerToken,
  registrarAoSessaoExpirar,
  removerToken,
  salvarToken,
} from "../services/api";
import { AuthContext } from "./AuthContext";

export default function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  // Só há o que carregar se existe um token salvo para validar.
  const [carregando, setCarregando] = useState(() => Boolean(lerToken()));

  // Token recusado pela API em qualquer chamada: volta ao perfil visitante.
  useEffect(() => registrarAoSessaoExpirar(() => setUsuario(null)), []);

  // Restaura a sessão ao abrir o site (o servidor confirma que o token ainda vale).
  useEffect(() => {
    if (!lerToken()) return undefined;

    const controller = new AbortController();

    buscarUsuarioAtual({ signal: controller.signal })
      .then((dados) => {
        if (!controller.signal.aborted) setUsuario(dados);
      })
      .catch(() => {
        // 401: a api.js já limpou o token. Falha de rede: segue como visitante.
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false);
      });

    return () => controller.abort();
  }, []);

  const iniciarSessao = useCallback((resposta) => {
    salvarToken(resposta.access_token);
    setUsuario(resposta.usuario);
    return resposta.usuario;
  }, []);

  // Os erros da API (e-mail repetido, senha errada...) sobem para o formulário tratar.
  const entrar = useCallback(
    async (credenciais) => iniciarSessao(await entrarUsuario(credenciais)),
    [iniciarSessao],
  );

  const cadastrar = useCallback(
    async (dados) => iniciarSessao(await cadastrarUsuario(dados)),
    [iniciarSessao],
  );

  const sair = useCallback(() => {
    removerToken();
    setUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario, autenticado: usuario !== null, carregando, entrar, cadastrar, sair }),
    [usuario, carregando, entrar, cadastrar, sair],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}