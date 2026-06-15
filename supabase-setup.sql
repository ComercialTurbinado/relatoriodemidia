-- Tabela para análises de vídeo aguardando aprovação do cliente
CREATE TABLE IF NOT EXISTS aprovacoes_pendentes (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  handle TEXT,
  nome_cliente TEXT,
  analise_texto TEXT,
  titulo TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  expira_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours')
);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_phone ON aprovacoes_pendentes(phone);

-- Criar tabela leads para capturar contatos com desconto
CREATE TABLE IF NOT EXISTS leads (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nome TEXT NOT NULL,
  empresa TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  instagram TEXT NOT NULL,
  cupom_utilizado TEXT NOT NULL,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índice para buscar rápido por cupom
CREATE INDEX idx_leads_cupom ON leads(cupom_utilizado);

-- Criar índice para buscar por data
CREATE INDEX idx_leads_data ON leads(data_criacao DESC);

-- Habilitar RLS (Row Level Security)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy: Qualquer um pode inserir (public insert)
CREATE POLICY "Qualquer um pode inserir leads"
ON leads FOR INSERT
WITH CHECK (true);

-- Policy: Apenas você pode ler seus leads
-- Substitua 'auth.uid()' pela sua estratégia de auth, ou deixe como está para permitir leitura pública
CREATE POLICY "Pode ler leads"
ON leads FOR SELECT
USING (true);

-- Mensagem de sucesso
SELECT 'Tabela leads criada com sucesso!' AS message;
