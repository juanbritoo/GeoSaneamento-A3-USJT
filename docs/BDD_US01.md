# BDD --- US01: Visualização do Mapa

## 1. Identificação

-   **Código:** US01
-   **Título:** Visualização do Mapa
-   **Épico:** MVP1 --- GeoSaneamento
-   **Produto:** GeoSaneamento
-   **Prioridade:** Alta
-   **Status:** Em andamento
-   **Sprint:** Sprint 2

## 2. História de usuário

**EU COMO** usuário do GeoSaneamento,\
**QUERO** visualizar São Paulo - SP em um mapa interativo dividido em
regiões,\
**PARA** consultar e explorar informações relacionadas ao território e
ao saneamento.

## 3. Funcionalidade

**Funcionalidade:** Visualização e interação com o mapa do
GeoSaneamento.

Os cenários abaixo descrevem os comportamentos esperados para a US01,
com base nos requisitos funcionais, regras de negócio, fluxos
alternativos, exceções e critérios de aceitação definidos na
especificação da história.

## 4. Cenários BDD

### Cenário 01 --- Carregar o mapa de São Paulo com sucesso

``` gherkin
Cenário: Carregar o mapa de São Paulo com sucesso
  Dado que o usuário acessa a funcionalidade de visualização do mapa
  Quando o sistema carrega os dados cartográficos necessários
  Então o mapa de São Paulo - SP deve ser apresentado na interface
  E a visualização inicial deve estar centralizada na área do município de São Paulo
```

### Cenário 02 --- Exibir a divisão territorial do município

``` gherkin
Cenário: Exibir a divisão territorial do município
  Dado que o mapa de São Paulo foi carregado corretamente
  Quando o sistema apresenta os dados geográficos das regiões
  Então as regiões correspondentes à unidade territorial definida para o MVP1 devem ser exibidas sobre o mapa
  E os limites territoriais devem ser visualmente identificáveis
```

### Cenário 03 --- Identificar as regiões do mapa

``` gherkin
Cenário: Identificar as regiões do mapa
  Dado que as regiões territoriais estão carregadas no mapa
  Quando o usuário visualiza a divisão territorial
  Então cada região deve estar associada à sua identificação territorial
  E os dados geográficos devem permitir relacionar cada região ao seu identificador único
```

### Cenário 04 --- Movimentar o mapa

``` gherkin
Cenário: Movimentar o mapa
  Dado que o mapa de São Paulo está sendo exibido
  Quando o usuário movimenta o mapa horizontal ou verticalmente
  Então o sistema deve atualizar a área visualizada conforme a movimentação realizada
  E deve manter a integridade dos dados e dos limites territoriais apresentados
```

### Cenário 05 --- Aproximar a visualização do mapa

``` gherkin
Cenário: Aproximar a visualização do mapa
  Dado que o mapa está sendo exibido
  Quando o usuário aumenta o nível de zoom
  Então o sistema deve ampliar a área visualizada
  E deve manter a representação das regiões territoriais
```

### Cenário 06 --- Afastar a visualização do mapa

``` gherkin
Cenário: Afastar a visualização do mapa
  Dado que o mapa está sendo exibido com um determinado nível de zoom
  Quando o usuário reduz o nível de zoom
  Então o sistema deve afastar a visualização
  E deve manter a divisão territorial disponível no mapa
```

### Cenário 07 --- Selecionar uma região do mapa

``` gherkin
Cenário: Selecionar uma região do mapa
  Dado que o mapa foi carregado e as regiões estão disponíveis para interação
  Quando o usuário seleciona uma região representada no mapa
  Então o sistema deve identificar a região selecionada
  E deve destacar visualmente essa região
  E deve disponibilizar sua identificação territorial básica
```

### Cenário 08 --- Substituir a região selecionada

``` gherkin
Cenário: Substituir a região selecionada
  Dado que o usuário já selecionou uma região do mapa
  Quando o usuário seleciona outra região
  Então o sistema deve substituir a seleção anterior pela nova seleção
  E deve destacar visualmente a nova região
  E deve apresentar a identificação territorial correspondente à nova região
```

### Cenário 09 --- Clicar fora de uma região

``` gherkin
Cenário: Clicar fora de uma região
  Dado que o mapa está sendo exibido
  Quando o usuário clica em uma área que não corresponde a uma região selecionável
  Então o sistema não deve selecionar nenhuma região em decorrência desse clique
```

### Cenário 10 --- Retornar à visualização inicial do mapa

``` gherkin
Cenário: Retornar à visualização inicial do mapa
  Dado que o usuário movimentou ou alterou o nível de zoom do mapa
  Quando o usuário aciona a opção de retornar à visualização inicial
  Então o sistema deve reposicionar o mapa para a área inicial definida de São Paulo - SP
  E deve restaurar o enquadramento inicial do mapa
```

### Cenário 11 --- Tratar falha no carregamento do mapa

``` gherkin
Cenário: Tratar falha no carregamento do mapa
  Dado que o usuário acessa a funcionalidade de visualização do mapa
  Quando ocorre uma falha no carregamento do mapa-base
  Então o sistema deve informar que o mapa não pôde ser carregado
  E não deve apresentar a visualização como se o carregamento tivesse sido concluído com sucesso
```

### Cenário 12 --- Tratar indisponibilidade dos dados territoriais

``` gherkin
Cenário: Tratar indisponibilidade dos dados territoriais
  Dado que o usuário acessa a funcionalidade de visualização do mapa
  Quando os dados necessários para representar as regiões não podem ser carregados
  Então o sistema deve informar a indisponibilidade dos dados territoriais
  E não deve apresentar uma divisão territorial inconsistente
```

### Cenário 13 --- Impedir a utilização de geometria inválida

``` gherkin
Cenário: Impedir a utilização de geometria inválida
  Dado que o sistema recebeu dados geográficos para representar as regiões
  Quando identifica uma geometria inválida ou incompatível com a malha territorial utilizada
  Então o sistema não deve apresentar a região com geometria inconsistente
  E deve preservar a integridade da representação territorial
```

### Cenário 14 --- Impedir a associação de uma região sem identificador válido

``` gherkin
Cenário: Impedir a associação de uma região sem identificador válido
  Dado que o sistema está processando os dados geográficos das regiões
  Quando identifica uma região sem identificador territorial válido
  Então o sistema deve impedir que essa região seja utilizada para associação posterior de dados
```

### Cenário 15 --- Exibir o mapa em diferentes navegadores

``` gherkin
Cenário: Exibir o mapa em diferentes navegadores
  Dado que o usuário acessa o GeoSaneamento por um navegador compatível
  Quando abre a funcionalidade de visualização do mapa
  Então o mapa deve ser apresentado adequadamente
  E as principais funcionalidades de visualização e interação devem estar disponíveis
```

### Cenário 16 --- Adaptar a interface a diferentes tamanhos de tela

``` gherkin
Cenário: Adaptar a interface a diferentes tamanhos de tela
  Dado que o usuário acessa o GeoSaneamento por uma tela de determinada resolução
  Quando a interface do mapa é apresentada
  Então a área do mapa deve se adaptar ao tamanho da tela
  E suas principais funcionalidades devem permanecer utilizáveis
```

### Cenário 17 --- Manter a identificação territorial para associação futura

``` gherkin
Cenário: Manter a identificação territorial para associação futura
  Dado que as regiões do município de São Paulo foram carregadas corretamente
  Quando o sistema disponibiliza os dados geográficos de cada região
  Então cada região deve possuir um identificador territorial único
  E esse identificador deve permitir a associação posterior de informações relacionadas ao saneamento
```

## 5. Rastreabilidade dos cenários

  Cenário                                  Critérios de aceitação / requisitos relacionados
  ---------------------------------------- --------------------------------------------------
  01 --- Carregar o mapa                   CA01, RF01, RF02
  02 --- Exibir divisão territorial        CA02, RF03
  03 --- Identificar regiões               CA04, RF04
  04 --- Movimentar o mapa                 CA03, RF05
  05 --- Aproximar o mapa                  CA03, RF06
  06 --- Afastar o mapa                    CA03, RF06
  07 --- Selecionar região                 CA05, CA06, CA07, RF07, RF08, RF09
  08 --- Substituir seleção                RF07, RF08, RF09, RN05, RN06, FA01
  09 --- Clicar fora de uma região         FA02
  10 --- Retornar à visualização inicial   CA09, RF14, FA06
  11 --- Falha no mapa                     RF13, EX01
  12 --- Falha nos dados territoriais      RF12, RF13, EX02
  13 --- Geometria inválida                RN04, EX03, RNF06
  14 --- Região sem identificador          RF10, RN03, EX04
  15 --- Compatibilidade com navegadores   CA10, RNF03
  16 --- Diferentes tamanhos de tela       CA10, RNF04
  17 --- Associação futura                 CA08, RF10, RN03, RN07

## 6. Observações

1.  **Unidade territorial:** a especificação estabelece que será
    utilizada a unidade territorial definida para o MVP1, mas não
    determina neste documento se ela será distrito, subprefeitura ou
    outra divisão. O cenário deve ser atualizado quando essa decisão for
    confirmada.
2.  **Desempenho:** o RNF02 prevê carregamento em tempo adequado e
    navegação fluida, mas a especificação não define um limite numérico
    de tempo. Para testar esse requisito objetivamente, a equipe deverá
    estabelecer uma métrica e condições de teste.
3.  **Escopo:** esta US trata da base geográfica e da interação com o
    mapa. Indicadores oficiais, questionários, relatos, cruzamento de
    dados e classificação de regiões permanecem fora do escopo desta
    história.
4.  **Automação:** estes cenários estão escritos em Gherkin para
    documentação. A execução automatizada exige a configuração de uma
    ferramenta de testes e a implementação das etapas correspondentes.
