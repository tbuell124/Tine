# Tine

Tine — Zero-touch tuning

## Project Structure

The project now follows a feature-oriented source layout:

```
src/
├── components/   # Shared UI components
├── hooks/        # Reusable stateful logic
├── native/       # Platform-specific bindings and implementations
└── utils/        # Framework-agnostic helpers and utilities
```

TypeScript path aliases have been configured in `tsconfig.json` so that modules can be imported using `@components/...`, `@hooks/...`, `@native/...`, and `@utils/...` from anywhere in the project.
