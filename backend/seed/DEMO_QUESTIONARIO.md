# Seed demonstrativo no banco local atual

Na raiz do projeto, com os containers atuais `api` e `db` em execução:

```powershell
cmd /c "docker compose -f backend/docker-compose.yml exec -T api python - --apply < backend\seed\seed_questionario_demo.py"
```

O comando transmite o script atualizado ao container existente e usa sua
`DATABASE_URL`, sem rebuild, cópia permanente, novos containers ou configurações.
Sem `--apply`, o script apenas planeja a carga.

Reaproveita os 564 questionários do lote de 26/11/2026, com a mesma semente,
respostas, comentários e datas (28/10 a 26/11/2026). Todos são demonstrativos,
identificados pela faixa reservada de IDs **−10006999 a −10000000**; os 141
comentários presentes também têm prefixo demonstrativo. A sequência BIGSERIAL
não é alterada. Registros idênticos são ignorados; colisões com conteúdo diferente
cancelam toda a transação. Nenhum registro existente é sobrescrito ou excluído.

| Distrito | ID territorial | Questionários do lote | Cenário originalmente planejado |
|---|---|---:|---|
| Pinheiros | 355030862 | 120 | Sem alerta |
| Mooca | 355030853 | 16 | Amostra insuficiente |
| Campo Belo | 355030815 | 68 | Não comparável |
| Itaquera | 355030837 | 120 | Possível divergência |
| Capão Redondo | 355030819 | 120 | Divergência elevada |
| Sé | 355030878 | 120 | Dados simulados |
| Vila Mariana | 355030890 | 0 | Sem participação no lote |

**Os cenários são intenções do lote, não status garantidos no banco atual.**
Não são criadas referências fictícias nem alterados valores oficiais, fontes,
períodos, métodos ou `is_mock`. O backend continua decidindo a comparabilidade.
Referências simuladas, de outro ano ou incompatíveis não gerarão alertas reais.
Participações preexistentes permanecem intactas e podem mudar os totais/status,
inclusive produzir pin em Vila Mariana.

Os registros demonstrativos entram nos agregados junto com as demais respostas:
o motor existente não filtra IDs negativos. A identificação por ID permite
reconhecer o lote, mas não o exclui automaticamente das análises. Não apresentar
os resultados misturados como observações exclusivamente reais.

A carga e qualquer validação ficam a cargo do responsável. Nenhum teste, lint,
build ou consulta de validação foi executado nesta simplificação.
