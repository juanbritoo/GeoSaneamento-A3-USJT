# Procedência dos dados SIDRA

## Metadados disponíveis

`sidra_municipio_sp.csv` contém, por linha, o identificador e a descrição da tabela, o nível territorial, o código e nome do município, o código e nome da variável, a unidade, o valor, o ano e as classificações SIDRA que se aplicam à tabela. A coluna `fonte` identifica o Censo 2022 e o número da tabela. As linhas presentes referem-se ao município 3550308 e ao ano de referência 2022.

O gerador `geosaneamento_seed.py` consulta os metadados em `https://servicodados.ibge.gov.br/api/v3/agregados/{tabela}/metadados` e constrói uma consulta para `https://apisidra.ibge.gov.br/values/t/{tabela}/n6/3550308/v/all/p/last{classificacoes}`. Ele grava as respostas no CSV e atribui a coluna `fonte`. A documentação do SIDRA identifica as tabelas 6803, 6805 e 6892 como tabelas do Censo Demográfico 2022 disponíveis no nível municipal.

Esta evidência sustenta a atribuição da fonte oficial indicada pelo projeto. Não comprova, por si só, que cada valor do arquivo atual foi comparado com uma resposta arquivada ou atual da API.

## Metadados de extração ausentes

Os arquivos atuais não registram:

- data e hora da extração;
- URL completa efetivamente solicitada para cada tabela, com as classificações expandidas a partir da resposta de metadados;
- resposta original da API ou checksum do arquivo baixado;
- versão do gerador usada para produzir este CSV;
- data de revisão ou uma comparação dos valores com a fonte oficial.

O gerador usa o seletor de período `last`, enquanto as linhas do CSV indicam 2022. O período de referência está preservado, mas a data da extração e a versão da resposta devem ser confirmadas antes de se afirmar que os valores foram verificados contra uma edição específica do SIDRA. Nenhuma data de extração é inferida neste registro.

## Códigos das séries e API planejada

O carregador deriva códigos no formato `SIDRA_<tabela>_<variável>_<unidade>_<código(s) de classificação>`. Os 72 códigos das linhas atuais são únicos. Isso permite selecioná-los como identificadores opacos, mas a quantidade e o significado das partes finais dependem das classificações de cada tabela; o formato não deve ser tratado como contrato de parsing.

O esquema atual preserva as colunas SIDRA em `valor_indicador.dimensoes`, mas os modelos/consultas existentes da API não expõem esse campo. Além disso, o catálogo municipal representa séries SIDRA por categoria e unidade, enquanto os quatro indicadores distritais são percentuais de teste: não há um cruzamento que permita tratá-los como o mesmo indicador entre escalas. Se clientes da API precisarem interpretar uma série programaticamente, a correção mínima proposta é expor `dimensoes` junto ao valor e documentar `codigo` como opaco. Nenhuma alteração no esquema ou no contrato da API foi feita nesta etapa; essa decisão fica para revisão antes da implementação da API funcional.
