# Coding and documentation standards

## Architectural rules

- Use a **modular monolith** with dependency direction: HTTP/infrastructure → application → domain. Domain code imports no framework, ORM, transport, or UI code.
- Prefer **ports and adapters** at real boundaries (database, clock, IDs, hashing, object storage), not an interface for every class.
- Use repository and unit-of-work patterns only where they preserve aggregate/transaction semantics; do not hide useful PostgreSQL capabilities behind a generic CRUD abstraction.
- Commands mutate; queries return read models. This is lightweight CQRS separation, not separate infrastructure.
- Use domain events plus a transactional outbox only for genuinely asynchronous optional features.
- Favor composition and pure functions over inheritance. Introduce factories/builders for complex test data, strategy only for real interchangeable behavior, and adapters only at external boundaries.

## Legibility

- TypeScript `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Names describe domain intent: `followUser`, not `process`; `timelineCursor`, not `data`.
- Functions have one level of abstraction, explicit inputs/outputs, early returns, and small cohesive bodies. Avoid arbitrary line limits.
- No boolean flag arguments when a named options object or separate function communicates intent better.
- Avoid `any`, non-null assertions, hidden global state, deep nesting, clever metaprogramming, and premature generic abstractions.
- Export the minimum surface. Keep modules cohesive and enforce dependency boundaries with lint rules.
- Comments explain **why, constraints, invariants, and trade-offs**—never narrate obvious syntax.

## JSDoc standard

Use JSDoc/TSDoc-compatible comments for every exported public contract whose intent, invariants, errors, side effects, security rules, or usage are not completely obvious from its name and type. Do not add boilerplate comments to private implementation details or repeat the TypeScript signature.

Required where applicable:

- Summary and important invariant.
- `@param` only when semantics/units/normalization are not obvious.
- `@returns` for non-obvious result semantics.
- `@throws` for errors callers are expected to handle.
- `@example` for shared APIs, cursor/config utilities, and tricky behavior.
- `@remarks` for security, transaction, performance, or ordering guarantees.
- `@deprecated` with replacement and removal plan.

````ts
/**
 * Returns one stable page of tweets visible in the member's home timeline.
 *
 * @param input.cursor - Opaque boundary returned by the previous page. It must
 * not be decoded or constructed by callers.
 * @param input.limit - Requested page size, clamped to the API maximum of 30.
 * @returns Tweets ordered by `createdAt DESC, id DESC` and the next opaque cursor.
 * @throws {InvalidCursorError} When the cursor signature or payload is invalid.
 * @remarks The query must remain keyset-paginated and execute without N+1 reads.
 *
 * @example
 * ```ts
 * const page = await timeline.list({ memberId, limit: 20 });
 * ```
 */
export async function listTimeline(
  input: ListTimelineInput,
): Promise<TimelinePage> {
  // Implementation.
}
````

Rules:

- Use `/** ... */`, never `//` for API documentation.
- Keep documentation next to the symbol and update it in the same PR as behavior.
- Never include secrets, real personal data, or unstable implementation details in examples.
- Validate links/examples and generate API documentation in CI once packages exist.
- ESLint should require documentation for exported package APIs while allowing self-explanatory React components, schema constants, and test helpers through explicit configuration—not inline blanket disables.

## Error and validation patterns

- Parse untrusted data once at the boundary with Zod; pass typed domain values inward.
- Use typed domain/application errors and one HTTP mapping layer. Do not throw string literals or leak database errors.
- Preserve causal errors with `cause`; log once at the boundary with request ID and safe structured context.
- Expected absence is a typed result where appropriate; exceptional infrastructure failure throws.

## Testing and review

- Arrange–Act–Assert with behavior-focused names containing acceptance-criteria IDs when applicable.
- Prefer real Postgres integration tests over ORM mocks, and Testing Library roles over DOM internals.
- Every bug fix begins with a reproducing test. Every authorization rule includes a negative test.
- Review for correctness, clarity, security, accessibility, performance, operability, and documentation—not formatting, which tooling owns.
