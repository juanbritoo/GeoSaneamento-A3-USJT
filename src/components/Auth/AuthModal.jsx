import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, X } from "lucide-react";

import { useAuth } from "../../auth/useAuth";
import "./AuthModal.css";

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAMPOS_VAZIOS = { nome: "", email: "", senha: "" };

/**
 * Modal de acesso: abas Entrar / Cadastrar e a saída "Continuar como visitante".
 *
 * Props:
 *  - onFechar: chamado ao fechar (X, Esc, clique fora ou "Continuar como visitante");
 *  - onSucesso: chamado depois de entrar ou cadastrar com sucesso (antes de onFechar);
 *  - mensagem: aviso opcional no topo do formulário (ex.: motivo do login);
 *  - abaInicial: "entrar" (padrão) ou "cadastrar".
 */
export default function AuthModal({ onFechar, onSucesso, mensagem = "", abaInicial = "entrar" }) {
  const { entrar, cadastrar } = useAuth();
  const [aba, setAba] = useState(abaInicial);
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ativoRef = useRef(true);
  const idBase = useId();

  const cadastro = aba === "cadastrar";
  const idAbaAtual = `${idBase}-aba-${aba}`;
  const idPainel = `${idBase}-painel`;

  // Evita agir (abrir outro modal, atualizar estado) se o usuário fechou durante o envio.
  useEffect(() => {
    ativoRef.current = true;
    return () => {
      ativoRef.current = false;
    };
  }, []);

  useEffect(() => {
    function aoPressionarTecla(evento) {
      if (evento.key === "Escape") onFechar();
    }

    document.addEventListener("keydown", aoPressionarTecla);
    return () => document.removeEventListener("keydown", aoPressionarTecla);
  }, [onFechar]);

  function trocarAba(novaAba) {
    if (novaAba === aba || enviando) return;
    setAba(novaAba);
    setErro("");
    setMostrarSenha(false);
    setCampos((atuais) => ({ ...atuais, senha: "" }));
  }

  function alterarCampo(campo) {
    return (evento) => {
      const valor = evento.target.value;
      setCampos((atuais) => ({ ...atuais, [campo]: valor }));
      setErro("");
    };
  }

  function validar() {
    if (cadastro && campos.nome.trim().length < 2) {
      return "Informe seu nome (mínimo de 2 caracteres).";
    }
    if (!EMAIL_VALIDO.test(campos.email.trim())) {
      return "Informe um e-mail válido.";
    }
    if (cadastro && campos.senha.length < 8) {
      return "A senha deve ter pelo menos 8 caracteres.";
    }
    if (!cadastro && campos.senha.length === 0) {
      return "Informe sua senha.";
    }
    return "";
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (enviando) return;

    const mensagemErro = validar();
    if (mensagemErro) {
      setErro(mensagemErro);
      return;
    }

    setEnviando(true);
    setErro("");

    const email = campos.email.trim();

    try {
      if (cadastro) {
        await cadastrar({ nome: campos.nome.trim(), email, senha: campos.senha });
      } else {
        await entrar({ email, senha: campos.senha });
      }

      if (!ativoRef.current) return;
      onSucesso?.();
      onFechar();
    } catch (falha) {
      if (ativoRef.current) setErro(falha.message);
    } finally {
      if (ativoRef.current) setEnviando(false);
    }
  }

  function fecharAoClicarFora(evento) {
    if (evento.target === evento.currentTarget) onFechar();
  }

  return (
    <div className="auth-overlay" onMouseDown={fecharAoClicarFora}>
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idBase}-titulo`}
      >
        <header className="auth-header">
          <div className="auth-identidade">
            <img className="auth-icone" src="/icon_gota.png" alt="" />
            <h2 id={`${idBase}-titulo`}>GeoSaneamento</h2>
          </div>

          <button
            type="button"
            className="auth-fechar"
            onClick={onFechar}
            aria-label="Fechar"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        <div className="auth-conteudo">
          <div className="auth-abas" role="tablist" aria-label="Acesso à conta">
            <button
              type="button"
              role="tab"
              id={`${idBase}-aba-entrar`}
              aria-selected={!cadastro}
              aria-controls={idPainel}
              className={`auth-aba ${!cadastro ? "ativa" : ""}`}
              onClick={() => trocarAba("entrar")}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              id={`${idBase}-aba-cadastrar`}
              aria-selected={cadastro}
              aria-controls={idPainel}
              className={`auth-aba ${cadastro ? "ativa" : ""}`}
              onClick={() => trocarAba("cadastrar")}
            >
              Cadastrar
            </button>
          </div>

          <form
            id={idPainel}
            role="tabpanel"
            aria-labelledby={idAbaAtual}
            className="auth-form"
            onSubmit={enviar}
            noValidate
          >
            <h3>{cadastro ? "Crie sua conta" : "Acesse sua conta"}</h3>
            <p className="auth-subtitulo">
              Participe da avaliação do saneamento da sua região.
            </p>

            {mensagem && (
              <p className="auth-aviso" role="status">
                {mensagem}
              </p>
            )}

            {cadastro && (
              <div className="auth-campo">
                <label htmlFor={`${idBase}-nome`}>Nome</label>
                <input
                  id={`${idBase}-nome`}
                  type="text"
                  autoComplete="name"
                  autoFocus
                  maxLength={100}
                  placeholder="Seu nome"
                  value={campos.nome}
                  onChange={alterarCampo("nome")}
                />
              </div>
            )}

            <div className="auth-campo">
              <label htmlFor={`${idBase}-email`}>E-mail</label>
              <input
                id={`${idBase}-email`}
                type="email"
                autoComplete="email"
                autoFocus={!cadastro}
                maxLength={254}
                placeholder="exemplo@email.com"
                value={campos.email}
                onChange={alterarCampo("email")}
              />
            </div>

            <div className="auth-campo">
              <label htmlFor={`${idBase}-senha`}>Senha</label>
              <div className="auth-senha">
                <input
                  id={`${idBase}-senha`}
                  type={mostrarSenha ? "text" : "password"}
                  autoComplete={cadastro ? "new-password" : "current-password"}
                  maxLength={128}
                  placeholder={cadastro ? "Mínimo de 8 caracteres" : "Digite sua senha"}
                  value={campos.senha}
                  onChange={alterarCampo("senha")}
                />
                <button
                  type="button"
                  className="auth-senha-alternar"
                  onClick={() => setMostrarSenha((atual) => !atual)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={mostrarSenha}
                >
                  {mostrarSenha
                    ? <EyeOff size={20} aria-hidden="true" />
                    : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {erro && (
              <p className="auth-erro" role="alert">
                {erro}
              </p>
            )}

            <button type="submit" className="auth-botao-principal" disabled={enviando}>
              {enviando ? (
                <>
                  <LoaderCircle className="auth-spinner" size={18} aria-hidden="true" />
                  Aguarde...
                </>
              ) : cadastro ? (
                "Criar conta"
              ) : (
                "Entrar"
              )}
            </button>

            <button type="button" className="auth-visitante" onClick={onFechar}>
              Continuar como visitante
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}