# Domain Crawl

Domain Crawl is a domain-name suggestion tool. Enter a keyword, choose the domain endings (TLDs) you want to consider, and get suggested domain names generated through the Supabase `suggest-domains` edge function.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase, including the `suggest-domains` edge function in `supabase/functions/suggest-domains`

## Run locally

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Run tests:

```sh
npm test
```

## Environment

The `.env` file holds the Supabase project URL and publishable (anon) key used by the browser client. These are client-side public values for this app; do not put service-role keys or other private secrets in `.env`.
