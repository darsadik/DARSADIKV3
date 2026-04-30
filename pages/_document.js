import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="fr">
      <Head>
        {/* ── DAR SADIK favicon — inline SVG brick logo ── */}
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='9' fill='%231a5fa8'/%3E%3Crect x='7' y='10' width='11' height='6' rx='1' fill='white'/%3E%3Crect x='21' y='10' width='12' height='6' rx='1' fill='white'/%3E%3Crect x='7' y='18' width='7' height='6' rx='1' fill='%23e8f0fb'/%3E%3Crect x='17' y='18' width='11' height='6' rx='1' fill='white'/%3E%3Crect x='31' y='18' width='2' height='6' rx='1' fill='%23e8f0fb'/%3E%3Crect x='7' y='26' width='11' height='6' rx='1' fill='white'/%3E%3Crect x='21' y='26' width='12' height='6' rx='1' fill='white'/%3E%3C/svg%3E" />
        {/* Apple touch icon for iPhone home screen */}
        <link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='9' fill='%231a5fa8'/%3E%3Crect x='7' y='10' width='11' height='6' rx='1' fill='white'/%3E%3Crect x='21' y='10' width='12' height='6' rx='1' fill='white'/%3E%3Crect x='7' y='18' width='7' height='6' rx='1' fill='%23e8f0fb'/%3E%3Crect x='17' y='18' width='11' height='6' rx='1' fill='white'/%3E%3Crect x='31' y='18' width='2' height='6' rx='1' fill='%23e8f0fb'/%3E%3Crect x='7' y='26' width='11' height='6' rx='1' fill='white'/%3E%3Crect x='21' y='26' width='12' height='6' rx='1' fill='white'/%3E%3C/svg%3E" />
        <meta name="theme-color" content="#1a5fa8" />
        <meta name="application-name" content="DAR SADIK" />
        <title>DAR SADIK — Gestion Commerciale</title>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
