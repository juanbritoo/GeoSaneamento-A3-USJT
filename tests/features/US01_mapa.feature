funcionalidade: Visualização do mapa do GeoSaneamento
  Como usuário do GeoSaneamento
  Quero visualizar São Paulo - SP em um mapa interativo dividido em regiões
  Para consultar e explorar informações relacionadas ao território e ao saneamento

  Contexto:
    Dado que a aplicação GeoSaneamento está disponível para acesso

  @mapa @carregamento @CA01
  Cenário: Carregar o mapa de São Paulo com sucesso
    Quando o usuário acessa a funcionalidade de visualização do mapa
    Então o mapa-base deve ser apresentado na interface
    E a visualização inicial deve estar centralizada na área do município de São Paulo

  @territorio @divisao @CA02
  Cenário: Exibir a divisão territorial do município
    Dado que o mapa-base foi carregado corretamente
    Quando os dados geográficos das regiões são carregados
    Então as regiões correspondentes à unidade territorial definida para o MVP1 devem ser exibidas sobre o mapa
    E os limites territoriais devem ser visualmente identificáveis

  @territorio @identificacao @CA04 @CA08
  Cenário: Identificar as regiões do mapa
    Dado que as regiões territoriais estão carregadas no mapa
    Quando o usuário consulta a divisão territorial
    Então cada região deve estar associada à sua identificação territorial
    E cada região deve possuir um identificador único

  @navegacao @CA03
  Cenário: Movimentar o mapa
    Dado que o mapa de São Paulo está sendo exibido
    Quando o usuário movimenta o mapa horizontal ou verticalmente
    Então a área visualizada deve ser atualizada conforme a movimentação realizada
    E os limites territoriais devem permanecer consistentes

  @zoom @CA03
  Cenário: Aproximar a visualização do mapa
    Dado que o mapa está sendo exibido
    Quando o usuário aumenta o nível de zoom
    Então a escala da visualização deve ser ampliada
    E as regiões territoriais devem continuar representadas

  @zoom @CA03
  Cenário: Afastar a visualização do mapa
    Dado que o mapa está sendo exibido com um determinado nível de zoom
    Quando o usuário reduz o nível de zoom
    Então a escala da visualização deve ser reduzida
    E a divisão territorial deve continuar disponível no mapa

  @selecao @CA05 @CA06 @CA07
  Cenário: Selecionar uma região do mapa
    Dado que o mapa foi carregado e as regiões estão disponíveis para interação
    Quando o usuário seleciona uma região representada no mapa
    Então o sistema deve identificar a região selecionada
    E deve destacar visualmente essa região
    E deve disponibilizar a identificação territorial básica da região

  @selecao @RN05 @RN06
  Cenário: Substituir a região selecionada
    Dado que o usuário já selecionou uma região do mapa
    Quando o usuário seleciona outra região
    Então a nova região deve substituir a seleção anterior
    E somente a nova região deve permanecer destacada
    E a identificação territorial exibida deve corresponder à nova região

  @selecao @fluxo-alternativo
  Cenário: Clicar fora de uma região
    Dado que o mapa está sendo exibido
    Quando o usuário clica em uma área que não corresponde a uma região selecionável
    Então nenhuma região deve ser selecionada em decorrência desse clique

  @visualizacao-inicial @CA09
  Cenário: Retornar à visualização inicial do mapa
    Dado que o usuário movimentou o mapa ou alterou seu nível de zoom
    Quando o usuário aciona a opção de retornar à visualização inicial
    Então o mapa deve retornar à área inicial definida para São Paulo - SP
    E o enquadramento inicial deve ser restaurado

  @erro @carregamento @RF13
  Cenário: Informar falha no carregamento do mapa-base
    Dado que o usuário acessa a funcionalidade de visualização do mapa
    Quando ocorre uma falha no carregamento do mapa-base
    Então o sistema deve informar que o mapa não pôde ser carregado
    E não deve indicar que o carregamento foi concluído com sucesso

  @erro @dados-geograficos @RF13
  Cenário: Informar indisponibilidade dos dados territoriais
    Dado que o usuário acessa a funcionalidade de visualização do mapa
    Quando os dados necessários para representar as regiões não podem ser carregados
    Então o sistema deve informar a indisponibilidade dos dados territoriais
    E não deve apresentar uma divisão territorial inconsistente

  @integridade @RN04 @EX03
  Cenário: Não apresentar região com geometria inválida
    Dado que o sistema recebeu dados geográficos para representar as regiões
    Quando identifica uma geometria inválida ou incompatível com a malha territorial utilizada
    Então a região com geometria inválida não deve ser apresentada como válida
    E o sistema deve preservar a integridade da representação territorial

  @identificador @RN03 @EX04
  Cenário: Impedir associação futura de região sem identificador válido
    Dado que o sistema está processando os dados geográficos das regiões
    Quando identifica uma região sem identificador territorial válido
    Então essa região não deve ser disponibilizada para associação posterior de dados

  @compatibilidade @RNF03 @CA10
  Cenário: Disponibilizar o mapa em navegadores compatíveis
    Dado que o usuário acessa o GeoSaneamento por um navegador compatível
    Quando abre a funcionalidade de visualização do mapa
    Então o mapa deve ser apresentado adequadamente
    E as principais funcionalidades de visualização e interação devem estar disponíveis

  @responsividade @RNF04 @CA10
  Cenário: Adaptar a interface a diferentes tamanhos de tela
    Dado que o usuário acessa o GeoSaneamento por uma tela de determinada resolução
    Quando a interface do mapa é apresentada
    Então a área do mapa deve se adaptar ao tamanho da tela
    E as principais funcionalidades devem permanecer utilizáveis

  @identificador @associacao-futura @CA08 @RN07
  Cenário: Manter identificador territorial para associação futura
    Dado que as regiões do município de São Paulo foram carregadas corretamente
    Quando o sistema disponibiliza os dados geográficos de cada região
    Então cada região deve possuir um identificador territorial único
    E esse identificador deve permitir a associação posterior de informações relacionadas ao saneamento

  @desempenho @RNF02 @pendente-de-parametrizacao
  Cenário: Carregar o mapa e permitir navegação fluida
    Dado que a aplicação está sendo executada em um ambiente de teste definido
    Quando o usuário acessa o mapa e realiza operações de navegação
    Então o mapa e as regiões devem ser carregados em tempo adequado
    E a navegação deve ocorrer de forma fluida
