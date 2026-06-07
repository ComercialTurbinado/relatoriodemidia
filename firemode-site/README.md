# Firemode Signal — Landing Page

Este diretório contém o site/landing page do **Firemode Signal** que é sincronizado com o repositório:
- **GitHub**: `https://github.com/ComercialTurbinado/firemode.git`
- **Branch**: `main`

## Estrutura

- `index.html` - Landing page completa do Firemode Signal
  - Hero section
  - Seção de problema
  - Solução
  - Tabela de planos (Diagnostic, Pro, Elite)
  - FAQ
  - Modal de desconto com animações em cascata
  - Sistema de cupom horário

## Deploy

Qualquer mudança nesta pasta deve ser:
1. Commitada localmente
2. Feita push para `firemode` remote (não `origin`)

```bash
git add firemode-site/
git commit -m "feat: [descrição da mudança]"
git push firemode main
```

## Importante

⚠️ **NÃO fazer push para `origin` (relatoriodemidia.git)**
Use apenas `firemode` remote para este diretório.
