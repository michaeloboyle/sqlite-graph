# Intellectual Property Analysis: Pattern Matching for Graph Databases

**Date:** November 14, 2025
**Project:** sqlite-graph Phase 3
**Concern:** Cypher-like pattern matching may infringe on Neo4j IP

## Problem Statement

The original Phase 3 specification called for "Cypher-like declarative graph queries" with MATCH clause syntax. This raises IP concerns:

1. **Cypher** is a trademark of Neo4j, Inc.
2. Cypher syntax may be protected intellectual property
3. Even if openCypher is available, compatibility claims could be problematic
4. Legal risk for an open-source project without legal counsel

## IP Risk Assessment

### High Risk: Cypher-Compatible Syntax
```cypher
// This syntax is associated with Neo4j's Cypher
MATCH (j:Job)-[:POSTED_BY]->(c:Company)
WHERE c.name = 'TechCorp'
RETURN j, c
```

**Risks:**
- ❌ Uses Neo4j's trademarked language name
- ❌ Mimics proprietary syntax structure
- ❌ Could be seen as creating a competing implementation
- ❌ May confuse users about Neo4j affiliation
- ❌ Difficult to defend as "independent creation"

### Lower Risk: SQL-Based Pattern Queries
```sql
-- Standard SQL with graph extensions (GQL standard)
SELECT * FROM nodes n1
JOIN edges e ON e.from_id = n1.id
JOIN nodes n2 ON e.to_id = n2.id
WHERE n1.type = 'Job' AND n2.type = 'Company'
  AND e.type = 'POSTED_BY'
  AND n2.properties->>'name' = 'TechCorp'
```

**Benefits:**
- ✅ Based on SQL (public domain, ISO standard)
- ✅ GQL (Graph Query Language) is an ISO standard (ISO/IEC 39075:2024)
- ✅ No trademark issues
- ✅ Clear lineage from standard SQL

### Safe: Fluent API (Library-Specific)
```typescript
// TypeScript fluent API - clearly original work
db.pattern()
  .node('j', 'Job')
  .edge('POSTED_BY', 'out')
  .node('c', 'Company')
  .where({ c: { name: 'TechCorp' } })
  .select(['j', 'c'])
  .exec();
```

**Benefits:**
- ✅ Original TypeScript API design
- ✅ No resemblance to Cypher syntax
- ✅ Language-idiomatic (TypeScript/JavaScript)
- ✅ Clearly independent implementation
- ✅ Can't be confused with Neo4j

## Recommended Approaches (IP-Safe)

### Option 1: SQL-Based with GQL Alignment (RECOMMENDED)

**Rationale:** GQL is an ISO standard (39075:2024) that incorporates graph patterns into SQL. Using GQL-aligned syntax provides:
- Legal safety (ISO standard, not proprietary)
- Industry recognition
- Future compatibility with standard databases

**API Design:**
```typescript
// SQL-like but type-safe
db.select()
  .from('Job', 'j')
  .join('POSTED_BY', 'out', 'Company', 'c')
  .where({ 'c.name': 'TechCorp' })
  .exec();

// Or more graph-specific (GQL-inspired)
db.graphQuery(`
  FROM (j:Job)-[:POSTED_BY]->(c:Company)
  WHERE c.name = 'TechCorp'
  SELECT j, c
`);
```

### Option 2: Fluent TypeScript API (SAFEST)

**Rationale:** Original library design, no IP concerns.

**API Design:**
```typescript
// Fully fluent, TypeScript-native
const pattern = db.pattern()
  .node('j', { type: 'Job' })
  .relatedTo({ type: 'POSTED_BY', direction: 'out' })
  .node('c', { type: 'Company', properties: { name: 'TechCorp' } })
  .build();

const results = pattern.execute();
```

### Option 3: SQL Query Builder (CONSERVATIVE)

**Rationale:** Stay close to SQLite, no new query language.

**API Design:**
```typescript
// SQL query builder with graph helpers
db.query()
  .selectNodes('Job', 'j')
  .whereConnected('POSTED_BY', 'Company', 'c')
  .whereProperty('c', 'name', 'TechCorp')
  .exec();
```

## Legal Considerations

### What We CAN Do:
- ✅ Implement graph query functionality
- ✅ Use SQL (public domain)
- ✅ Reference GQL standard (ISO 39075:2024)
- ✅ Create original fluent APIs
- ✅ Implement common graph concepts (nodes, edges, patterns)

### What We SHOULD NOT Do:
- ❌ Use "Cypher" in code, docs, or marketing
- ❌ Claim "Cypher compatibility"
- ❌ Copy Neo4j's specific syntax structure
- ❌ Use openCypher branding without review
- ❌ Implement a "Cypher parser"

### Gray Areas (Avoid Without Legal Counsel):
- ⚠️ "Cypher-like" or "Cypher-inspired" language
- ⚠️ Syntax that closely mimics MATCH...WHERE...RETURN
- ⚠️ Using openCypher specification (may have license terms)
- ⚠️ ASCII art patterns: `(a)-[:REL]->(b)` (too similar)

## Prior Art / Safe References

### ISO GQL (Graph Query Language)
- **Status:** ISO/IEC 39075:2024 published April 2024
- **Scope:** SQL extension for property graphs
- **Safety:** International standard, free to implement
- **Syntax:** SQL-based with graph extensions

### Apache TinkerPop / Gremlin
- **Status:** Apache 2.0 license
- **Scope:** Graph traversal language (Java-based)
- **Safety:** Open source, permissive license
- **Approach:** Functional/fluent API

### SPARQL (W3C Standard)
- **Status:** W3C Recommendation
- **Scope:** RDF graph queries
- **Safety:** Open standard
- **Approach:** SQL-like with graph patterns

## Recommendation for sqlite-graph

**Phase 3 Pattern Matching Implementation:**

### PRIMARY: GQL-Aligned SQL Extension
```typescript
// Based on ISO GQL standard, no IP issues
db.gql(`
  FROM GRAPH
  MATCH (j:Job)-[:POSTED_BY]->(c:Company)
  WHERE c.name = 'TechCorp'
  RETURN j, c
`);
```

**Why:**
- ISO standard (legally safe)
- Industry credibility
- Future-proof (standard adoption)
- Clear non-Neo4j affiliation

### ALTERNATIVE: Original Fluent API
```typescript
// Original TypeScript design, zero IP risk
db.findPattern()
  .start('j', 'Job')
  .through('POSTED_BY', 'outgoing')
  .end('c', 'Company')
  .filter({ 'c.name': 'TechCorp' })
  .execute();
```

**Why:**
- Completely original
- TypeScript-idiomatic
- Type-safe
- No confusion with Neo4j

## Action Items

1. **STOP** implementing Cypher-like syntax
2. **DELETE** any Cypher references from spec/architecture docs
3. **RESEARCH** GQL standard (ISO 39075:2024) for safe syntax
4. **DESIGN** either:
   - GQL-aligned API (SQL extension approach)
   - Original fluent API (safest, most TypeScript-native)
5. **DOCUMENT** clearly: "Not affiliated with Neo4j, not Cypher-compatible"
6. **TRADEMARK CHECK** on any query language names we create

## Conclusion

**Verdict:** PIVOT AWAY FROM CYPHER-LIKE SYNTAX

**Recommended Path:**
1. Implement **GQL-aligned queries** (ISO standard, safe)
2. OR implement **original fluent TypeScript API** (safest)
3. Focus on **SQL-based** or **library-specific** patterns
4. Avoid any Neo4j/Cypher association

**Legal Safety:** HIGH (with GQL or fluent API)
**Feature Parity:** Can achieve same functionality without IP risk
**Timeline Impact:** Minimal (design change, not functionality loss)

---

**Next Steps:**
- Update Phase 3 spec to use GQL or fluent API
- Remove all Cypher references
- Proceed with IP-safe implementation
