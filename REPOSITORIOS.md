# Estrutura de Repositórios

Este projeto usa **2 repositórios Git diferentes**:

## 1. 📊 `origin` — relatoriodemidia.git
**GitHub**: `https://github.com/ComercialTurbinado/relatoriodemidia.git`

Contém:
- Relatórios de mídia e análises
- Previews de projetos
- Auditorias
- Dashboards internos
- Protótipos e testes

**Arquivos**:
- `relatorio-*.html`
- `preview-*.html`
- `auditoria_preview.html`
- `d4u_*.html`
- `dashboard.html`
- `protocolo-de-performance.html`
- Etc.

---

## 2. 🚀 `firemode` — firemode.git
**GitHub**: `https://github.com/ComercialTurbinado/firemode.git`

Contém:
- **Landing page do Firemode Signal**
- Site de vendas
- Página de produto

**Diretório**: `/firemode-site/`

---

## ⚠️ Instruções de Push

### Para o Firemode Signal:
```bash
cd firemode-site/
git add .
git commit -m "..."
git push firemode main  # ← use "firemode", NÃO "origin"
```

### Para Relatórios/Dashboards:
```bash
git add relatorio-*.html preview-*.html
git commit -m "..."
git push origin main  # ← use "origin"
```

---

## 🔄 Remotes Configurados
```bash
git remote -v

origin   git@github.com:ComercialTurbinado/relatoriodemidia.git
firemode https://github.com/ComercialTurbinado/firemode.git
```

Se precisar mudar:
```bash
git remote set-url firemode [nova-url]
git remote set-url origin [nova-url]
```
