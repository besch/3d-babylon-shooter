# 3D Babylon Shooter

A 3D multiplayer first-person shooter built with Next.js, Babylon.js, and Supabase.

## Map Objects Initialization

The game now uses persistent map objects that are stored in the Supabase database. These objects are initialized once and persist even when there are no active players in the game. This makes the game world stable and consistent across sessions.

Map objects are initialized in one of three ways:

1. **Automatically on first load**: When anyone visits the game, the `MapInitializer` component will check if map objects exist and create them if needed.

2. **During deployment**: The build process includes a `postbuild` script that initializes map objects automatically.

3. **Manually**: You can manually trigger map initialization by running:
   ```
   npm run init-map [baseUrl]
   ```
   Where `baseUrl` is optional and defaults to `http://localhost:3000`. For production, you would use:
   ```
   npm run init-map https://your-deployed-site.vercel.app
   ```

## Development

```bash
npm run dev
```

## Deployment

Deploy to Vercel as a Next.js application. The map objects will be automatically initialized during the build process.

## Local Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables for Supabase in `.env.local`
4. Run the development server: `npm run dev`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
