Funcionalidade: Consulta de Dados Oficiais de Saneamento no Mapa
  Como usuario do GeoSaneamento
  Quero consultar os dados oficiais de saneamento de uma regiao de Sao Paulo, SP
  Para compreender os indicadores de saneamento associados ao territorio e suas respectivas fontes oficiais.

  Contexto:
    Dado que o usuario acessou o sistema GeoSaneamento
    E a visualizacao inicial do mapa de Sao Paulo, SP esta carregada

  @us02 @critico @smoke
  Cenario: Consultar dados oficiais de uma regiao com sucesso
    Dado que o usuario seleciona uma regiao valida no mapa
    Quando o usuario solicita a consulta dos dados oficiais de saneamento da regiao
    Entao o sistema deve apresentar os dados oficiais disponiveis para a regiao conforme os indicadores definidos para o MVP
    E os dados apresentados devem estar corretamente associados a respectiva regiao selecionada no mapa

  @us02 @transparencia
  Cenario: Identificar a fonte e referencia temporal dos dados
    Dado que os dados oficiais de saneamento de uma regiao estao sendo apresentados ao usuario
    Quando o sistema exibe as informacoes na interface
    Entao o sistema deve exibir a identificacao da fonte oficial de origem dos dados
    E deve apresentar a referencia temporal correspondente aos dados exibidos, quando disponivel

  @us02 @navegacao
  Cenario: Consultar dados de uma nova regiao selecionada
    Dado que o usuario esta visualizando os dados oficiais de uma regiao
    Quando o usuario seleciona outra regiao no mapa
    Entao o sistema deve realizar uma nova consulta considerando a regiao recem-selecionada
    E deve atualizar a interface com os indicadores, valores e fontes correspondentes a nova localidade

  @us02 @dados_parciais
  Cenario: Apresentar disponibilidade parcial de indicadores
    Dado que o usuario seleciona uma regiao no mapa que possui apenas alguns indicadores de saneamento cadastrados
    Quando o sistema processa e apresenta as informacoes da regiao
    Entao o sistema deve exibir somente os indicadores disponiveis
    E deve manter visivel a identificacao da respectiva fonte oficial dos dados exibidos

  @us02 @dados_indisponiveis
  Cenario: Informar ausencia de dados oficiais para a regiao
    Dado que o usuario seleciona uma regiao no mapa que nao possui dados oficiais cadastrados ou validados
    Quando o usuario solicita a consulta dos dados de saneamento
    Entao o sistema deve informar claramente ao usuario que nao ha dados oficiais disponiveis para a regiao consultada
    E deve garantir que a mensagem de indisponibilidade nao seja interpretada como ausencia de saneamento ou atendimento do servicio

  @us02 @qualidade_dados
  Cenario: Ocultar dados invalidos ou inconsistentes
    Dado que o sistema processa os dados oficiais oriundos das bases validadas para o MVP
    Quando sao identificados registros corrompidos, invalidos ou inconsistentes para uma regiao
    Entao o sistema nao deve apresentar essas informacoes na interface
    E deve garantir a integridade dos dados exibidos ao usuario final

  @us02 @excecao @api
  Cenario: Informar falha na consulta ou carregamento dos dados
    Dado que o usuario seleciona uma regiao no mapa para consultar os dados oficiais
    Quando ocorre uma falha na comunicacao com a API ou no carregamento das informacoes
    Entao o sistema deve informar o problema ao usuario
    E deve permitir que o usuario continue utilizando o mapa normalmente sem travamentos

  @us02 @confiabilidade
  Cenario: Manter consistencia com as fontes oficiais definidas
    Dado que os dados oficiais foram tratados e organizados pelas rotinas em Python
    Quando o sistema disponibiliza as informacoes atraves da API
    Entao os dados apresentados na interface devem manter consistencia com as informacoes disponibilizadas pelas fontes definidas para o MVP