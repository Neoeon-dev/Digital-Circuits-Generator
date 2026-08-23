# LogicFlow production checklist

## Runtime
- Next.js 14.2.x
- React 18.3.x
- Framer Motion 11.x
- Tailwind CSS 3.4.x

## Environment
Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL`. Set `NEXT_PUBLIC_SITE_URL` to the deployed site URL for the generated sitemap.

## Commands
```bash
npm install
npm run typecheck
npm run build
npm start
```

## Notes
- The API remains the source of truth for Boolean synthesis and generated circuit graphs.
- Browser-only features are isolated inside client components.
- API calls have timeouts and cancellation to prevent stale requests.
- An App Router error boundary and loading state prevent a single workspace failure from producing an opaque page.
- Sound uses one reusable AudioContext and closes it during teardown.
- Exported files are downloaded using revocable Blob URLs.
- Light/dark theme preference is bootstrapped before hydration to reduce theme flash.
