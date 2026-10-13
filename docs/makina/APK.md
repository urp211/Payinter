# PayInter — APK Android

Documento de apoio para instalação e verificação do APK gerado
automaticamente pelo GitHub Actions (workflow *Build Android APK*).

## Descarregar

**https://github.com/urp211/Payinter/releases/download/apk-latest/payinter.apk**

A release `apk-latest` é substituída a cada compilação bem-sucedida.

## Identificação do pacote

| Campo | Valor |
|---|---|
| Nome da aplicação | PayInter |
| Identificador | `app.payinter.demo` |
| Versão | 1.0 (versionCode 1) |
| minSdkVersion | 22 (Android 5.1 ou superior) |
| targetSdkVersion / compileSdk | 34 (Android 14) |
| Permissões | `android.permission.INTERNET` |
| Tipo de construção | *debug* — assinado com chave de desenvolvimento |

## Verificação da última construção

| Campo | Valor |
|---|---|
| Commit | `0fd290b563927fa55cca7ad6c992aff21f77c8bf` |
| Tamanho | 5 458 494 bytes (~5,2 MB) |
| SHA-256 | `95951f5e99d586051a3d4d42fca7498f42b529c83e36afe4c9c0faadd02f367c` |

Para confirmar que o ficheiro descarregado não foi corrompido:

```bash
sha256sum payinter.apk
```

O valor tem de coincidir com o indicado acima. Os metadados de cada nova
compilação ficam publicados na branch `ci-diag`, no ficheiro
`ci-diag/build-info.md` — é aí que se consulta o valor mais recente, porque
cada compilação gera um APK com impressão digital diferente.

## Instalação

1. Descarregue o ficheiro `payinter.apk` directamente **no telemóvel**.
2. Abra-o. O Android vai avisar que a instalação de origens desconhecidas está
   bloqueada — permita a instalação para a aplicação a partir da qual abriu
   o ficheiro (normalmente o navegador ou o gestor de ficheiros).
3. Confirme a instalação. O ícone **PayInter** aparece no ecrã inicial.

Credenciais de demonstração:

- Utilizador: `demo@payinter.app` — palavra-passe `Demo1234!`
- PIN: `2468` — código de uso único: `123456`

## ⚠️ Limitação a ter em conta

Este APK tem **embutido o endereço do servidor do ambiente de
pré-visualização**:

```
https://4000-i422fnjyga662l1ys67f0.e2b.app
```

Esse endereço é temporário — deixa de responder quando a sessão de
desenvolvimento terminar. Consequências:

- **Enquanto o servidor estiver activo:** a aplicação instala-se, o início de
  sessão funciona e todas as funcionalidades respondem.
- **Depois de o servidor terminar:** a aplicação continua a abrir e a mostrar
  os dados guardados localmente (é offline-first), mas não conseguirá
  autenticar-se nem sincronizar.

Para produzir um APK verdadeiramente duradouro é necessário:

1. Publicar o servidor (pasta `backend/`) num endereço HTTPS permanente.
2. Recompilar indicando esse endereço — no GitHub, *Actions* → *Build Android
   APK* → *Run workflow*, preenchendo o campo `apiUrl`. Em alternativa, alterar
   o valor por omissão de `VITE_API_BASE` em `.github/workflows/android-apk.yml`.

## Notas técnicas

- O APK é uma aplicação Android nativa que embrulha a aplicação web
  (PWA) através do Capacitor. O pacote web vai embutido em
  `assets/public/` dentro do APK, pelo que o funcionamento offline
  (*service worker*, cache local e fila de operações) funciona também
  dentro do Android.
- Sendo uma construção de tipo *debug*, **não está pronta para a Google Play**:
  para publicação é necessária uma chave de assinatura de produção e a geração
  de um ficheiro `.aab`.
- A compilação demora cerca de 2 minutos e corre automaticamente sempre que
  houver alterações em `mobile/` ou no próprio workflow.
