# Payinter — Web App Offline (PWA)

Payinter é um controle financeiro **100% offline**, inspirado no Inter, transformado em PWA instalável.

## ✨ O que mudou para offline?

### 1. PWA Completo
- `manifest.json` com ícones 72-512, shortcuts, display standalone, theme #FF7A00
- `sw.js` Service Worker com estratégia **Cache First + Network Revalidate**
- Instalável na tela inicial (Android, iOS, Desktop)
- Funciona no modo avião

### 2. Armazenamento Local
- **IndexedDB** (`js/db.js`) para transações e categorias
- Nenhum dado sai do aparelho
- `navigator.storage.estimate()` para mostrar uso
- Export / Import JSON para backup

### 3. Zero Dependência Externa
- Sem CDN, sem Google Fonts, sem frameworks
- CSS e JS 100% locais
- Ícones gerados localmente
- Funciona com `file://` ou qualquer static server

### 4. Experiência Offline
- Badge Online/Offline em tempo real (`navigator.onLine`)
- Toasts de status
- Gráfico em Canvas puro (sem Chart.js)
- Atalho teclado `N` para nova transação
- FAB e navegação mobile

## 🚀 Como rodar

```bash
# qualquer servidor estático
python -m http.server 8000
# ou
npx serve .
```

Abra http://localhost:8000

## 📱 Instalar

1. Chrome/Edge: ícone Instalar na barra de endereço
2. Android: Menu > Adicionar à tela inicial
3. iOS: Compartilhar > Adicionar à Tela de Início

## 🗂️ Estrutura

```
/index.html      -> App shell
/manifest.json   -> PWA manifest
/sw.js           -> Service Worker offline-first
/css/styles.css  -> Design system Inter-like
/js/db.js        -> IndexedDB wrapper
/js/app.js       -> UI, filtros, charts, PWA install
/icons/          -> Ícones 72-512
```

## 🔒 Privacidade

- Sem login
- Sem tracking
- Sem nuvem
- Dados ficam em IndexedDB local
- Código auditável, < 100KB total

## 🧪 Testar offline

1. Abra DevTools > Application > Service Workers > Offline
2. Ou: DevTools > Network > Offline
3. Recarregue - app continua funcionando
4. Adicione transações offline - persistem

## 📦 Tecnologias offline-first

- Cache API + Service Worker
- IndexedDB
- `beforeinstallprompt`
- `navigator.storage`
- Canvas API para gráficos

Feito para funcionar **sem internet, para sempre**.
