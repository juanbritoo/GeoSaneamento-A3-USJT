-- GeoSaneamento US02: schema incremental e repetível (PostgreSQL + PostGIS).
-- Não remove tabelas/linhas. Valores só entram pelo pipeline de carga.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS fonte_dado (
    id_fonte       TEXT PRIMARY KEY,
    nome           TEXT NOT NULL,
    url            TEXT,
    classificacao  TEXT NOT NULL CHECK (classificacao IN ('oficial', 'nao_verificada', 'ficticia')),
    procedencia    TEXT NOT NULL
);

INSERT INTO fonte_dado (id_fonte, nome, url, classificacao, procedencia) VALUES
    ('nao_classificada', 'Fonte não classificada', NULL, 'nao_verificada',
     'A procedência da informação ainda não foi confirmada.'),
    ('ibge_localidades', 'IBGE - Localidades',
     'https://servicodados.ibge.gov.br/api/v1/localidades/municipios/3550308/distritos',
     'oficial', 'Códigos e nomes territoriais consultados na API de Localidades do IBGE.'),
    ('ibge_sidra_6803', 'IBGE - Censo 2022 - SIDRA tabela 6803',
     'https://apisidra.ibge.gov.br/values/t/6803/n6/3550308/v/all/p/2022',
     'oficial', 'Arquivo municipal SIDRA incluído no projeto; observações e classificações originais devem ser preservadas.'),
    ('ibge_sidra_6805', 'IBGE - Censo 2022 - SIDRA tabela 6805',
     'https://apisidra.ibge.gov.br/values/t/6805/n6/3550308/v/all/p/2022',
     'oficial', 'Arquivo municipal SIDRA incluído no projeto; observações e classificações originais devem ser preservadas.'),
    ('ibge_sidra_6892', 'IBGE - Censo 2022 - SIDRA tabela 6892',
     'https://apisidra.ibge.gov.br/values/t/6892/n6/3550308/v/all/p/2022',
     'oficial', 'Arquivo municipal SIDRA incluído no projeto; observações e classificações originais devem ser preservadas.'),
    ('projeto_json_nao_verificado', 'JSON de indicadores do projeto', NULL, 'nao_verificada',
     'Valores do arquivo json__distritos.json; o arquivo não registra uma fonte externa verificável.'),
    ('projeto_valor_ficticio', 'Valores sintéticos do projeto', NULL, 'ficticia',
     'Valores determinísticos gerados pelo merge_json.py para completar distritos ausentes; não são observações oficiais.'),
    ('malha_nao_verificada', 'GeoJSON de malha distrital do projeto', NULL, 'nao_verificada',
     'A procedência original da geometria em distritos.geojson não está documentada no arquivo.')
ON CONFLICT (id_fonte) DO NOTHING;

CREATE TABLE IF NOT EXISTS territorio (
    id_territorial TEXT PRIMARY KEY,
    nome           TEXT NOT NULL,
    id_municipio   TEXT NOT NULL DEFAULT '3550308',
    fonte          TEXT NOT NULL,
    periodo        TEXT NOT NULL,
    geom           geometry(MultiPolygon, 4326),
    nivel          TEXT NOT NULL DEFAULT 'distrito',
    id_fonte       TEXT NOT NULL DEFAULT 'nao_classificada',
    id_fonte_geom  TEXT,
    procedencia_geom TEXT
);

-- Adiciona os campos sem recriar nem apagar uma tabela legado já existente.
ALTER TABLE territorio ADD COLUMN IF NOT EXISTS geom geometry(MultiPolygon, 4326);
ALTER TABLE territorio ADD COLUMN IF NOT EXISTS nivel TEXT NOT NULL DEFAULT 'distrito';
ALTER TABLE territorio ADD COLUMN IF NOT EXISTS id_fonte TEXT NOT NULL DEFAULT 'nao_classificada';
ALTER TABLE territorio ADD COLUMN IF NOT EXISTS id_fonte_geom TEXT;
ALTER TABLE territorio ADD COLUMN IF NOT EXISTS procedencia_geom TEXT;

CREATE TABLE IF NOT EXISTS indicador (
    codigo  TEXT PRIMARY KEY,
    nome    TEXT NOT NULL,
    unidade TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS valor_indicador (
    id_territorial TEXT NOT NULL REFERENCES territorio(id_territorial),
    indicador      TEXT NOT NULL REFERENCES indicador(codigo),
    valor          NUMERIC,
    unidade        TEXT,
    fonte          TEXT NOT NULL,
    periodo        TEXT NOT NULL,
    is_mock        BOOLEAN NOT NULL DEFAULT FALSE,
    id_fonte       TEXT NOT NULL DEFAULT 'nao_classificada',
    dimensoes      JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id_territorial, indicador, periodo, fonte)
);

ALTER TABLE valor_indicador ADD COLUMN IF NOT EXISTS id_fonte TEXT NOT NULL DEFAULT 'nao_classificada';
ALTER TABLE valor_indicador ADD COLUMN IF NOT EXISTS dimensoes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Classifica dados legado usando a origem declarada. O sinalizador is_mock é mantido
-- para compatibilidade, mas não é usado sozinho para declarar uma fonte fictícia.
UPDATE territorio SET id_fonte = 'ibge_localidades'
 WHERE id_fonte = 'nao_classificada' AND fonte ILIKE '%IBGE - Localidades%';

UPDATE territorio SET id_fonte_geom = 'malha_nao_verificada',
       procedencia_geom = 'Origem não documentada no GeoJSON fornecido pelo projeto.'
 WHERE geom IS NOT NULL AND id_fonte_geom IS NULL;

UPDATE valor_indicador SET id_fonte = CASE
    WHEN fonte ILIKE '%mock%' OR fonte ILIKE '%fictício%' OR fonte ILIKE '%ficticio%'
        THEN 'projeto_valor_ficticio'
    WHEN fonte ILIKE '%IBGE - Censo 2022 - SIDRA%'
        THEN CASE
            WHEN fonte ILIKE '%6803%' THEN 'ibge_sidra_6803'
            WHEN fonte ILIKE '%6805%' THEN 'ibge_sidra_6805'
            WHEN fonte ILIKE '%6892%' THEN 'ibge_sidra_6892'
            ELSE 'nao_classificada'
        END
    WHEN fonte ILIKE '%JSON do projeto%' THEN 'projeto_json_nao_verificado'
    ELSE 'nao_classificada'
END
WHERE id_fonte = 'nao_classificada';

-- O registro municipal é uma identidade territorial, sem indicadores nem geometria inventados.
INSERT INTO territorio (id_territorial, nome, id_municipio, fonte, periodo, nivel, id_fonte)
VALUES ('3550308', 'São Paulo', '3550308', 'IBGE - Localidades', '2022', 'municipio', 'ibge_localidades')
ON CONFLICT (id_territorial) DO NOTHING;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_territorio_nivel') THEN
        ALTER TABLE territorio ADD CONSTRAINT ck_territorio_nivel
            CHECK (nivel IN ('municipio', 'distrito'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_territorio_escopo') THEN
        ALTER TABLE territorio ADD CONSTRAINT ck_territorio_escopo
            CHECK ((nivel = 'municipio' AND id_territorial = id_municipio)
                OR (nivel = 'distrito' AND id_territorial <> id_municipio));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_territorio_municipio') THEN
        ALTER TABLE territorio ADD CONSTRAINT fk_territorio_municipio
            FOREIGN KEY (id_municipio) REFERENCES territorio(id_territorial);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_territorio_fonte') THEN
        ALTER TABLE territorio ADD CONSTRAINT fk_territorio_fonte
            FOREIGN KEY (id_fonte) REFERENCES fonte_dado(id_fonte);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_territorio_geom_fonte') THEN
        ALTER TABLE territorio ADD CONSTRAINT fk_territorio_geom_fonte
            FOREIGN KEY (id_fonte_geom) REFERENCES fonte_dado(id_fonte);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_valor_indicador_fonte') THEN
        ALTER TABLE valor_indicador ADD CONSTRAINT fk_valor_indicador_fonte
            FOREIGN KEY (id_fonte) REFERENCES fonte_dado(id_fonte);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_territorio_nivel ON territorio (nivel);
CREATE INDEX IF NOT EXISTS idx_territorio_municipio ON territorio (id_municipio);
CREATE INDEX IF NOT EXISTS idx_territorio_geom ON territorio USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_valor_indicador_periodo ON valor_indicador (id_territorial, periodo, indicador);

-- BEGIN QUESTIONARIO MIGRATION
-- Bloco canonico compartilhado pela instalacao completa e --questionario-only.
-- Base V1 seguida de ALTERs: mesmos constraints em bancos novos e existentes.
CREATE TABLE IF NOT EXISTS resposta_questionario (
    id               BIGSERIAL PRIMARY KEY,
    id_territorial   TEXT NOT NULL REFERENCES territorio(id_territorial),
    respostas        JSONB NOT NULL,
    pontuacao        NUMERIC(5, 2) NOT NULL CHECK (pontuacao BETWEEN 0 AND 100),
    nivel_saneamento TEXT NOT NULL CHECK (nivel_saneamento IN ('critico', 'precario', 'regular', 'adequado')),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resposta_questionario_territorio
    ON resposta_questionario (id_territorial, criado_em DESC);

-- DEFAULT 1 identifica o legado e preserva o INSERT atual, que omite a versao.
-- Nao inferir respostas ou vinculo territorial para registros anteriores.
ALTER TABLE resposta_questionario
    ADD COLUMN IF NOT EXISTS versao_questionario INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS vinculo_territorial TEXT,
    ADD COLUMN IF NOT EXISTS comentario VARCHAR(500);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'resposta_questionario'::regclass
                     AND conname = 'ck_resposta_questionario_versao') THEN
        ALTER TABLE resposta_questionario ADD CONSTRAINT ck_resposta_questionario_versao
            CHECK (versao_questionario IN (1, 2));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'resposta_questionario'::regclass
                     AND conname = 'ck_resposta_questionario_legado_v1') THEN
        ALTER TABLE resposta_questionario ADD CONSTRAINT ck_resposta_questionario_legado_v1
            CHECK (versao_questionario <> 1 OR
                   (pontuacao IS NOT NULL AND nivel_saneamento IS NOT NULL));
    END IF;
END $$;

-- CHECKs originais de faixa e classificacao continuam validando valores presentes.
ALTER TABLE resposta_questionario
    ALTER COLUMN pontuacao DROP NOT NULL,
    ALTER COLUMN nivel_saneamento DROP NOT NULL;

COMMENT ON COLUMN resposta_questionario.versao_questionario IS
    '1 = questionario original (Gabriel); 2 = participativo. Filtrar explicitamente a versao em futuras analises.';
COMMENT ON COLUMN resposta_questionario.vinculo_territorial IS
    'Vinculo declarado com o distrito; NULL no legado. Categorias serao definidas no contrato V2.';
COMMENT ON COLUMN resposta_questionario.respostas IS
    'Respostas da versao indicada: JSONB suporta categorias, numeros e null (nao aplicavel).';
-- END QUESTIONARIO MIGRATION
