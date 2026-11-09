# BDD — US02: Dados Oficiais

## 1. Identificação

-   **Código:** US2
-   **Título:** Dados oficiais de Saneamento
-   **Épico:** MVP1 — GeoSaneamento
-   **Produto:** GeoSaneamento
-   **Prioridade:** Alta
-   **Status:** Em andamento
-   **Sprint:** Sprint 2

## 2. História de usuário

**EU COMO** usuário do GeoSaneamento,\
**QUERO** consultar os dados oficiais de saneamento de uma região de São Paulo, SP,\
**PARA** compreender os indicadores de saneamento associados ao território e suas respectivas fontes oficiais.

## 3. Funcionalidade

**Funcionalidade:** Consulta e apresentação de dados oficiais de saneamento associados às regiões do mapa.

Os cenários abaixo descrevem os comportamentos esperados para a US02, com base nos requisitos funcionais, regras de negócio, fluxos alternativos, exceções, critérios de aceitação e itens de escopo definidos na especificação da história.

## 4. Cenários BDD

### Cenário 01 — Selecionar região no mapa para consulta

``` gherkin
Cenário: Selecionar região no mapa para consulta
  Dado que o usuário está acessando o sistema GeoSaneamento na interface do mapa
  Quando o usuário clica sobre uma região do município de São Paulo
  Então o sistema deve permitir a seleção da região e identificar o território consultado
```

### Cenário 02 — Apresentar dados oficiais disponíveis da região

``` gherkin
Cenário: Apresentar dados oficiais disponíveis da região
  Dado que o usuário selecionou uma região de São Paulo no mapa
  Quando o sistema realiza a consulta dos dados de saneamento
  Então o sistema deve apresentar corretamente na interface todos os dados oficiais disponíveis para a região selecionada
  E os dados apresentados devem estar associados à respectiva unidade territorial
```

### Cenário 03 — Apresentar indicadores definidos para o MVP

``` gherkin
Cenário: Apresentar indicadores definidos para o MVP
  Dado que os dados oficiais de saneamento foram carregados para a região selecionada
  Quando as informações são exibidas no painel da interface
  Então o sistema deve apresentar somente os indicadores de saneamento definidos para o MVP
  E as informações devem ser organizadas de forma clara e legível
```

### Cenário 04 — Identificar a fonte oficial de origem dos dados

``` gherkin
Cenário: Identificar a fonte oficial de origem dos dados
  Dado que os dados oficiais de saneamento estão sendo exibidos para uma região
  Quando o usuário visualiza as informações na interface
  Então o sistema deve exibir a identificação da fonte oficial de origem dos dados
```

### Cenário 05 — Exibir a referência temporal dos dados

``` gherkin
Cenário: Exibir a referência temporal dos dados
  Dado que os dados oficiais possuem informação sobre o período de coleta
  Quando os indicadores da região são exibidos na interface
  Então o sistema deve apresentar a referência temporal correspondente aos dados exibidos
```

### Cenário 06 — Consultar dados de uma nova região selecionada

``` gherkin
Cenário: Consultar dados de uma nova região selecionada
  Dado que o usuário já visualiza os dados oficiais de uma região selecionada
  Quando o usuário seleciona outra região no mapa
  Então o sistema deve realizar uma nova consulta considerando a nova região
  E deve atualizar a interface com os indicadores e fontes correspondentes
```

### Cenário 07 — Apresentar disponibilidade parcial de indicadores

``` gherkin
Cenário: Apresentar disponibilidade parcial de indicadores
  Dado que a região selecionada possui apenas alguns indicadores oficiais disponíveis
  Quando o sistema carrega e exibe os dados da região
  Então o sistema deve apresentar apenas os indicadores existentes
  E deve manter visível a identificação da fonte oficial
```

### Cenário 08 — Informar ausência de dados oficiais para a região

``` gherkin
Cenário: Informar ausência de dados oficiais para a região
  Dado que o usuário seleciona uma região que não possui dados oficiais disponíveis
  Quando o sistema tenta carregar as informações de saneamento
  Então o sistema deve informar claramente a indisponibilidade das informações
  E não deve interpretar a ausência de dados como falta de atendimento do serviço
```

### Cenário 09 — Ocultar dados inválidos ou inconsistentes

``` gherkin
Cenário: Ocultar dados inválidos ou inconsistentes
  Dado que o sistema processa os dados de saneamento para apresentação
  Quando identifica registros corrompidos, inválidos ou inconsistentes
  Então o sistema não deve exibir esses dados na interface
  E deve preservar a integridade das informações apresentadas
```

### Cenário 10 — Informar falha na consulta ou carregamento de dados

``` gherkin
Cenário: Informar falha na consulta ou carregamento de dados
  Dado que o usuário solicita a consulta dos dados de uma região
  Quando ocorre uma falha na comunicação com a API ou no carregamento dos dados
  Então o sistema deve informar que não foi possível carregar os dados
  E deve permitir que o usuário continue navegando pelo mapa normalmente
```

### Cenário 11 — Impedir a apresentação de dados com falha na associação territorial

``` gherkin
Cenário: Impedir a apresentação de dados com falha na associação territorial
  Dado que o sistema consulta os dados oficiais para uma região
  Quando ocorre uma falha na associação entre os dados e o território
  Então o sistema deve impedir a apresentação de dados associados incorretamente
  E deve informar a indisponibilidade da associação ao usuário
```

### Cenário 12 — Manter consistência com as fontes oficiais

``` gherkin
Cenário: Manter consistência com as fontes oficiais
  Dado que os dados foram armazenados e processados pelo sistema
  Quando a interface apresenta as informações da consulta
  Então os dados exibidos devem manter consistência com as fontes oficiais validadas para o MVP
```

## 5. Rastreabilidade dos cenários

| Cenário | Critérios de aceitação / Requisitos relacionados |
| :--- | :--- |
| 01 — Selecionar região | CA01, RF08, INT01, FP01 |
| 02 — Apresentar dados oficiais | CA02, CA05, RF08, RF10, INT02, INT05, FP02, FP04, FP05 |
| 03 — Apresentar indicadores do MVP | CA03, RF11, RNF07, RN05, INT03, FP05, FP06 |
| 04 — Identificar fonte oficial | CA04, RF09, RNF05, RN03, INT04, FP07 |
| 05 — Exibir referência temporal | CA06, RN03 |
| 06 — Consultar nova região | FA01 |
| 07 — Disponibilidade parcial | FA02 |
| 08 — Ausência de dados oficiais | CA07, RF12, RN07, INT06, FA03 |
| 09 — Ocultar dados inválidos | CA08, RN06, EX03 |
| 10 — Falha na consulta ou API | CA09, EX01, EX04 |
| 11 — Falha na associação territorial | EX02 |
| 12 — Consistência com fontes oficiais | CA10, RNF06, RN04, RN08 |

## 6. Observações

1. **Fontes de Dados:** As fontes IBGE e SNIS são consideradas inicialmente como candidatas para o MVP1, dependendo de validação técnica quanto à disponibilidade, granularidade e viabilidade de integração.
2. **Integração de Arquitetura:** O processamento prévio dos dados será realizado em Python (GeoPandas) e PostgreSQL/PostGIS. A API construída em FastAPI fornecerá os dados tratados para consumo do frontend em React.
3. **Escopo:** Esta US restringe-se à consulta e apresentação dos dados oficiais em regiões do município de São Paulo. Funcionalidades como cadastro de usuários, questionários e relatos geolocalizados pertencem a histórias futuras.
4. **Automação:** Os cenários descritos em Gherkin servem de documentação executável para guiar os testes manuais e a automação de testes correspondente à task `TAS22-28`.