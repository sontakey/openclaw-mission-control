# Contributing

Thanks for your interest in improving Mission Control.

## Before you start

Please open an issue first for bug fixes, features, or larger refactors so we can align on scope before work begins.

## Workflow

1. Fork the repository.
2. Create a focused branch from `main`.
3. Make your changes.
4. Run the checks below.
5. Open a pull request with a clear summary and testing notes.

## Required checks

Run these before submitting a PR:

```bash
npm run build
npx tsc --noEmit
```

## Code style

- Write code in TypeScript.
- Use Tailwind CSS for styling.
- Prefer shadcn/ui components and patterns where applicable.
- Keep changes scoped, readable, and production-ready.

## Pull requests

- Link the issue when relevant.
- Describe user-facing changes clearly.
- Include screenshots for UI changes when possible.

We review for clarity, maintainability, and fit with the product.
