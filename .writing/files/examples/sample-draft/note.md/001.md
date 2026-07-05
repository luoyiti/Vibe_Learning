# Database isolation levels

**In one sentence:** Isolation levels are a dial that trades transactional consistency
for concurrency by declaring which read anomalies the database is allowed to expose.

## The problem they solve

When transactions run concurrently, a transaction can observe inconsistent intermediate
state created by others. The SQL standard names three classic **read anomalies**:

- **Dirty read** — you read a row another transaction wrote but has not committed; if it
  rolls back, you read something that never existed.
- **Non-repeatable read** — you read a row twice in one transaction and get different
  values because another transaction committed an `UPDATE` in between.
- **Phantom read** — you run the same range query twice and the *set of rows* changes
  because another transaction committed an `INSERT`/`DELETE` matching your predicate.

## The four levels

Each level is defined by which anomalies it *permits* (lower = more concurrency, less safety):

| Level             | Dirty read | Non-repeatable read | Phantom read |
|-------------------|:----------:|:-------------------:|:------------:|
| READ UNCOMMITTED  | possible   | possible            | possible     |
| READ COMMITTED    | prevented  | possible            | possible     |
| REPEATABLE READ   | prevented  | prevented           | possible*    |
| SERIALIZABLE      | prevented  | prevented           | prevented    |

\* In the SQL standard phantoms are allowed at REPEATABLE READ. Real engines vary — see
the easy-to-miss points below.

## How engines actually implement this

Most modern databases use **MVCC** (multi-version concurrency control): writers create new
row versions instead of overwriting, so readers see a consistent **snapshot** and rarely
block on writers. SERIALIZABLE is then provided either by strict two-phase locking or, in
Postgres, by **Serializable Snapshot Isolation (SSI)**, which detects dangerous read/write
dependency cycles and aborts one transaction.

## How to choose

- Default to **READ COMMITTED** for typical OLTP — cheap, avoids dirty reads.
- Use **REPEATABLE READ / snapshot** when a transaction reads the same data multiple times
  and must see a stable view (reports, multi-step reads).
- Use **SERIALIZABLE** when correctness depends on the *absence* of concurrency anomalies
  (financial invariants, "check-then-act" logic) — and be ready to retry on serialization
  failures.

## Easy-to-miss points

- **The names are guarantees, not implementations.** PostgreSQL's REPEATABLE READ is
  snapshot isolation and already prevents phantoms; its READ UNCOMMITTED behaves like READ
  COMMITTED (no dirty reads at all).
- **Higher isolation ⇒ more aborts, not more blocking.** Under SERIALIZABLE you must handle
  `serialization_failure` by retrying the whole transaction with backoff.
- **Snapshot isolation is not serializable.** It still allows *write skew*, where two
  transactions each read an overlapping set and write disjoint rows, together violating an
  invariant neither saw violated alone.
