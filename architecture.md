# Digital Logic Design Platform — Architecture & Development Plan

## 1. Project Overview

The project is a web-based digital logic design platform that combines:

1. Natural-language problem interpretation using AI.
2. Deterministic Boolean-logic processing.
3. Truth-table generation.
4. Boolean-expression generation and simplification.
5. Logic-circuit graph generation.
6. Circuit simulation and verification.
7. Standard digital-circuit modules such as half adders, full adders, subtractors, and multipliers.
8. Gate-level implementations using AND/OR/NOT and NAND/NOR.
9. Interactive visualization in the frontend.

The central design principle is:

> **AI interprets the problem; the Logic Engine performs and verifies the digital-logic computation.**

The AI should not be trusted to perform the final mathematical simplification or circuit verification.

---

## 2. High-Level Architecture

```text
                         ┌──────────────────────┐
                         │         USER         │
                         │  Problem Statement   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │     NEXT.JS UI       │
                         │   + Tailwind CSS     │
                         │                      │
                         │ Input / Results /    │
                         │ Tables / Circuits    │
                         └──────────┬───────────┘
                                    │
                               REST / JSON
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │           FASTAPI             │
                    │                              │
                    │ Routing / Validation / API  │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
          ┌───────────────────┐       ┌────────────────────────┐
          │     AI LAYER      │       │      LOGIC ENGINE       │
          │                   │       │                         │
          │ Natural Language  │       │ Expression Parser       │
          │       ↓           │       │ Evaluator               │
          │ Boolean Expression│──────►│ Truth Table Generator   │
          │                   │       │ SOP/POS Generator       │
          │                   │       │ Simplifier              │
          └─────────┬─────────┘       │ Circuit Generator       │
                    │                 │ Circuit Simulator       │
                    │                 │ Verification            │
                    │                 └────────────┬────────────┘
                    │                              │
                    └──────────────┬───────────────┘
                                   ▼
                         ┌──────────────────────┐
                         │     COMMON MODELS    │
                         │                      │
                         │ ProblemSpecification│
                         │ BooleanExpression    │
                         │ TruthTable           │
                         │ CircuitGraph         │
                         │ VerificationResult   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │     FRONTEND VIEW    │
                         │                      │
                         │ Boolean Expression   │
                         │ Truth Table          │
                         │ Simplified Expression│
                         │ Circuit Diagram      │
                         │ Verification Status  │
                         └──────────────────────┘
```

---

## 3. Main End-to-End Pipeline

### AI-driven pipeline

```text
Natural Language Problem
          ↓
         AI
          ↓
Boolean Expression
          ↓
Expression Validation
          ↓
Truth Table
          ↓
SOP / POS / Minterms / Maxterms
          ↓
Simplification
          ↓
Circuit Graph
          ↓
Circuit Simulation
          ↓
Verification against Truth Table
          ↓
Frontend Visualization
```

### Example

Input:

> A bulb glows only if both switches A and B are ON.

AI output:

```text
F = A & B
```

The AI does not need to simplify it. The Logic Engine then generates:

```text
Truth Table
A B | F
---------
0 0 | 0
0 1 | 0
1 0 | 0
1 1 | 1
```

and then derives the circuit:

```text
A ─────┐
       AND ─── F
B ─────┘
```

---

# 4. Component Architecture

## 4.1 Frontend

### Proposed stack

- Next.js
- TypeScript
- Tailwind CSS
- React Flow (or equivalent) for circuit diagrams

### Responsibilities

- Accept natural-language problem statements.
- Accept direct Boolean-expression input.
- Display generated Boolean expressions.
- Display truth tables.
- Display SOP/POS and minterm/maxterm forms.
- Display simplified expressions.
- Render interactive circuit graphs.
- Allow users to inspect gates and connections.
- Provide standard-circuit pages/components.
- Display verification results.

The frontend should **not implement the core Boolean algorithms**.

---

## 4.2 FastAPI Backend

FastAPI acts as the application/API layer.

### Responsibilities

- Expose REST endpoints.
- Validate incoming data.
- Call the AI layer when natural-language interpretation is requested.
- Call Logic Engine modules.
- Convert internal models to JSON responses.
- Handle errors and invalid expressions.

Example endpoints:

```text
POST /api/generate
GET  /api/circuits/half-adder
GET  /api/circuits/full-adder
GET  /api/circuits/half-subtractor
GET  /api/circuits/full-subtractor
GET  /api/circuits/multiplier
```

---

# 5. AI Layer

## 5.1 AI Responsibility

The AI converts natural language into a **machine-readable Boolean specification**.

It should primarily perform:

```text
Natural Language → Boolean Expression
```

Example:

```text
"The output is ON when A is ON and B is OFF."

→ A & ~B
```

Another example:

```text
"The bulb glows when either A or B is ON."

→ A | B
```

## 5.2 Structured AI Response

Do not depend on free-form text. Prefer structured JSON.

Example:

```json
{
  "inputs": ["A", "B"],
  "outputs": ["F"],
  "expression": "A & B",
  "explanation": "The bulb glows only when both switches are ON."
}
```

The backend should validate the expression after receiving it.

## 5.3 AI Safety / Correctness Strategy

The AI result should be treated as an **untrusted input**.

The Logic Engine must:

1. Parse it.
2. Validate it.
3. Check that all variables are declared.
4. Evaluate it independently.
5. Generate the truth table.
6. Generate the circuit.
7. Verify the circuit.

This creates a deterministic correctness boundary around the AI.

---

# 6. Logic Engine

The Logic Engine is the core of the project.

```text
logic/
├── expressions/
│   ├── nodes.py
│   ├── lexer.py
│   ├── parser.py
│   ├── evaluator.py
│   └── printer.py
│
├── truth_table/
│   ├── generator.py
│   └── converter.py
│
├── minimization/
│   ├── sop.py
│   ├── pos.py
│   ├── quine_mccluskey.py
│   └── kmap.py
│
├── circuit/
│   ├── graph.py
│   ├── generator.py
│   └── simulator.py
│
├── standard_circuits/
│   ├── half_adder.py
│   ├── full_adder.py
│   ├── half_subtractor.py
│   ├── full_subtractor.py
│   └── multiplier.py
│
└── verification/
    └── verifier.py
```

---

# 7. Boolean Expression Representation

The Logic Engine should use an **Abstract Syntax Tree (AST)** rather than passing strings between every module.

Example:

```text
A & (B | ~C)
```

becomes:

```text
             AND
            /   \
           A     OR
                /  \
               B   NOT
                    |
                    C
```

Suggested node types:

```text
Variable
Constant
NOT
AND
OR
XOR
NAND
NOR
XNOR
```

Start with AND, OR, NOT and XOR. Add derived gates later.

---

# 8. Parser

The parser converts a Boolean expression string into the AST.

Canonical syntax:

```text
&   → AND
|   → OR
~   → NOT
^   → XOR
( ) → grouping
```

Examples:

```text
A & B
A | B
~A
(A & B) | C
A ^ B
```

Later, user-friendly aliases can be supported:

```text
AND
OR
NOT
XOR
+
.
'
```

The parser should detect malformed expressions and return useful errors.

---

# 9. Expression Evaluator

Given:

```text
A & (B | ~C)
```

and an assignment:

```text
A = 1
B = 0
C = 1
```

the evaluator returns the Boolean output.

This evaluator is the foundation for truth-table generation and circuit verification.

---

# 10. Truth Table Engine

For `n` input variables, there are:

```text
2^n
```

possible input combinations.

The Truth Table Engine should:

1. Extract all variables.
2. Generate all binary combinations.
3. Evaluate the expression for each row.
4. Return a structured truth table.

Example:

```text
Expression: A & B

A B | F
--------
0 0 | 0
0 1 | 0
1 0 | 0
1 1 | 1
```

---

# 11. Truth Table → Boolean Expression

The engine should support conversion from truth tables to:

- Canonical SOP.
- Canonical POS.
- Minterm notation.
- Maxterm notation.

Example:

```text
A B C | F
---------
0 1 0 | 1
1 0 1 | 1
```

The corresponding minterms can be produced from the rows where `F = 1`.

This allows the system to move in both directions:

```text
Expression → Truth Table
Truth Table → Expression
```

---

# 12. Simplification Engine

The simplifier should be deterministic.

Recommended implementation order:

### Phase 1

Implement basic Boolean identities:

```text
A + 0 = A
A · 1 = A
A + A = A
A · A = A
A + A' = 1
A · A' = 0
```

### Phase 2

Add common absorption/distributive rules.

### Phase 3

Implement Quine–McCluskey for algorithmic minimization.

### Phase 4

Optionally implement K-map generation/visualization.

Recommended primary simplification pipeline:

```text
Truth Table
    ↓
Canonical SOP
    ↓
Quine–McCluskey
    ↓
Minimal / simplified expression
```

---

# 13. Circuit Graph Generator

The circuit generator converts a Boolean AST into a directed graph.

Example expression:

```text
F = (A & B) | C
```

becomes:

```text
A ───┐
     AND ───┐
B ───┘      │
            OR ─── F
C ──────────┘
```

The backend should return a JSON graph.

Example:

```json
{
  "nodes": [
    {"id": "g1", "type": "AND"},
    {"id": "g2", "type": "OR"}
  ],
  "edges": [
    {"from": "A", "to": "g1"},
    {"from": "B", "to": "g1"},
    {"from": "g1", "to": "g2"},
    {"from": "C", "to": "g2"}
  ],
  "outputs": ["g2"]
}
```

The frontend then renders this graph.

---

# 14. Circuit Simulator

The circuit simulator independently evaluates the generated graph.

For each input assignment:

```text
Input values
    ↓
Gate 1
    ↓
Gate 2
    ↓
...
    ↓
Output
```

Supported gates should initially include:

```text
AND
OR
NOT
XOR
NAND
NOR
XNOR
```

This simulator is separate from the expression evaluator so that the circuit can be independently checked.

---

# 15. Verification Engine

The Verification Engine compares:

```text
Original truth table
        vs.
Generated circuit truth table
```

Expected result:

```json
{
  "verified": true,
  "mismatches": []
}
```

If a mismatch occurs:

```json
{
  "verified": false,
  "mismatches": [
    {
      "inputs": {"A": 1, "B": 0},
      "expected": 1,
      "actual": 0
    }
  ]
}
```

This is a core quality feature of the platform.

---

# 16. Standard Circuit Library

The project should include predefined circuit modules.

## 16.1 Half Adder

Inputs:

```text
A, B
```

Outputs:

```text
Sum   = A XOR B
Carry = A AND B
```

The circuit uses an XOR gate and an AND gate.

---

## 16.2 Full Adder

Inputs:

```text
A, B, Cin
```

Outputs:

```text
Sum  = A XOR B XOR Cin
Cout = (A AND B) OR (Cin AND (A XOR B))
```

It can also be constructed hierarchically using:

```text
Half Adder + Half Adder + OR
```

---

## 16.3 Half Subtractor

Inputs:

```text
A, B
```

Outputs:

```text
Difference = A XOR B
Borrow     = ~A AND B
```

---

## 16.4 Full Subtractor

Inputs:

```text
A, B, Bin
```

Outputs:

```text
Difference
Bout
```

Build it from the Boolean equations and/or from two half subtractors plus an OR gate.

---

# 17. Multiplier

Start with a 2-bit × 2-bit multiplier.

For:

```text
A = A1 A0
B = B1 B0
```

generate the partial products:

```text
P0 = A0 & B0
P1 = A1 & B0
P2 = A0 & B1
P3 = A1 & B1
```

The partial products are added using half/full adders to obtain the final product.

Conceptually:

```text
Input bits
    ↓
AND gates
    ↓
Partial products
    ↓
Adders
    ↓
Final product
```

The frontend should display the partial products and the gate-level implementation.

---

# 18. NAND-only and NOR-only Implementations

The circuit transformation layer should support:

```text
Original circuit
      ↓
Gate replacement / transformation
      ↓
NAND-only circuit
```

and:

```text
Original circuit
      ↓
Gate replacement / transformation
      ↓
NOR-only circuit
```

Examples:

```text
NOT using NAND:
~A = A NAND A
```

```text
AND using NAND:
A & B = (A NAND B) NAND (A NAND B)
```

Equivalent transformations should be implemented as reusable gate rules.

---

# 19. Data Models

All components should exchange structured models.

### ProblemSpecification

```text
inputs
outputs
expression
metadata
```

### BooleanExpression

```text
AST root
variables
```

### TruthTable

```text
variables
rows
outputs
```

### CircuitGraph

```text
nodes
edges
inputs
outputs
```

### VerificationResult

```text
verified
mismatches
summary
```

Avoid passing unstructured strings between modules whenever a structured model can be used.

---

# 20. Suggested Backend Directory

```text
backend/
│
├── main.py
│
├── api/
│   ├── ai.py
│   ├── truth_table.py
│   ├── simplify.py
│   ├── circuit.py
│   └── standard_circuits.py
│
├── ai/
│   ├── interpreter.py
│   ├── prompts.py
│   └── schemas.py
│
├── logic/
│   ├── expressions/
│   │   ├── nodes.py
│   │   ├── lexer.py
│   │   ├── parser.py
│   │   ├── evaluator.py
│   │   └── printer.py
│   │
│   ├── truth_table/
│   │   ├── generator.py
│   │   └── converter.py
│   │
│   ├── minimization/
│   │   ├── sop.py
│   │   ├── pos.py
│   │   ├── quine_mccluskey.py
│   │   └── kmap.py
│   │
│   ├── circuit/
│   │   ├── graph.py
│   │   ├── generator.py
│   │   ├── simulator.py
│   │   └── transforms.py
│   │
│   ├── standard_circuits/
│   │   ├── half_adder.py
│   │   ├── full_adder.py
│   │   ├── half_subtractor.py
│   │   ├── full_subtractor.py
│   │   └── multiplier.py
│   │
│   └── verification/
│       └── verifier.py
│
└── models/
    ├── problem.py
    ├── expression.py
    ├── truth_table.py
    └── circuit.py
```

---

# 21. Suggested Frontend Directory

```text
frontend/
└── src/
    ├── app/
    │   ├── page.tsx
    │   ├── ai/
    │   ├── truth-table/
    │   ├── simplifier/
    │   ├── circuits/
    │   └── library/
    │
    ├── components/
    │   ├── ProblemInput.tsx
    │   ├── ExpressionView.tsx
    │   ├── TruthTable.tsx
    │   ├── CircuitCanvas.tsx
    │   ├── GateNode.tsx
    │   └── VerificationBadge.tsx
    │
    ├── lib/
    │   └── api.ts
    │
    └── types/
        ├── expression.ts
        ├── truthTable.ts
        └── circuit.ts
```

---

# 22. Four-Person Team Division

## Member 1 — AI / NLP

Responsibilities:

- AI prompt design.
- Natural-language problem interpretation.
- Structured AI output.
- AI response validation.
- AI integration with FastAPI.

Deliverable:

```text
Problem Statement → Boolean Expression
```

---

## Member 2 — Boolean / Truth Table Engine

Responsibilities:

- AST node model.
- Lexer/parser.
- Expression evaluator.
- Truth-table generator.
- SOP/POS generation.
- Minterms/maxterms.
- Simplification / Quine–McCluskey.

Deliverable:

```text
Boolean Expression ↔ Truth Table → Simplified Expression
```

---

## Member 3 — Circuit Engine

Responsibilities:

- Circuit graph representation.
- AST → circuit conversion.
- Circuit simulation.
- Circuit verification.
- NAND/NOR transformations.
- Standard gate-level construction.

Deliverable:

```text
Boolean Expression → Circuit Graph → Verified Circuit
```

---

## Member 4 — Frontend / Standard Circuits / Integration

Responsibilities:

- Next.js frontend.
- Interactive circuit visualization.
- Truth-table UI.
- Standard-circuit library UI.
- Half/full adders.
- Half/full subtractors.
- Multiplier visualization.
- Frontend/backend integration.

Deliverable:

```text
Complete interactive web application
```

All members should contribute to testing, documentation, and integration.

---

# 23. Development Phases

## Phase 1 — Core Boolean Engine

Build first:

```text
AST
 ↓
Parser
 ↓
Evaluator
 ↓
Truth Table
```

Do not start with the UI or AI.

---

## Phase 2 — Boolean Analysis

Add:

```text
Truth Table → SOP/POS
Minterms / Maxterms
Simplification
```

---

## Phase 3 — Circuit Engine

Add:

```text
AST → Circuit Graph
Circuit Graph → Simulation
Simulation → Verification
```

---

## Phase 4 — Standard Circuits

Implement:

```text
Half Adder
Full Adder
Half Subtractor
Full Subtractor
2×2 Multiplier
```

Then add NAND-only and NOR-only variants.

---

## Phase 5 — AI Integration

Connect:

```text
Natural Language
       ↓
AI
       ↓
Boolean Expression
       ↓
Existing Logic Engine
```

The AI should plug into the already-tested engine rather than replacing it.

---

## Phase 6 — Frontend

Build:

- Input page.
- Expression display.
- Truth-table display.
- Simplification display.
- Circuit visualization.
- Verification status.
- Standard-circuit library.

---

## Phase 7 — Testing and Polish

Test each module independently and then test complete end-to-end flows.

Example end-to-end test:

```text
"A bulb glows only when A and B are ON."
                  ↓
                AI
                  ↓
               A & B
                  ↓
             Truth Table
                  ↓
            Simplification
                  ↓
             Circuit Graph
                  ↓
              Simulation
                  ↓
              Verification ✓
```

---

# 24. Testing Strategy

Every major component should have unit tests.

### Parser tests

```text
A
A & B
A | B
~A
(A & B) | C
```

### Evaluator tests

Compare known expressions against expected outputs.

### Truth-table tests

Verify known expressions and standard circuits.

### Simplifier tests

Check that the simplified expression is logically equivalent to the original.

### Circuit tests

Verify generated circuits against expected truth tables.

### AI tests

Maintain a fixed set of natural-language examples with expected expressions.

The AI output can vary in formatting, so normalize and validate it before testing semantic equivalence.

---

# 25. Important Design Principles

### Principle 1 — AI is not the source of truth

AI produces an interpretation. The Logic Engine verifies it.

### Principle 2 — One common Boolean representation

Expressions should become ASTs and stay structured throughout the backend.

### Principle 3 — Circuit generation should be deterministic

The same Boolean expression should always produce a logically equivalent graph.

### Principle 4 — Verification is mandatory

Every generated circuit should be simulatable and checked against its expected truth table.

### Principle 5 — Build bottom-up

The correct development order is:

```text
Boolean primitives
      ↓
Expression engine
      ↓
Truth tables
      ↓
Simplification
      ↓
Circuit graph
      ↓
Simulation
      ↓
Verification
      ↓
AI
      ↓
Frontend polish
```

---

# 26. Final Product Flow

The finished platform should feel like this:

```text
┌──────────────────────────────────────────────┐
│              DIGITAL LOGIC AI                │
├──────────────────────────────────────────────┤
│                                              │
│  Describe your problem:                      │
│  "A bulb glows only when A and B are ON."    │
│                                              │
│                    [ Generate ]              │
└───────────────────────┬──────────────────────┘
                        │
                        ▼
              Boolean Expression
                   F = A & B
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
     Truth Table     Simplified     Circuit
                     Expression      Graph
                        │             │
                        └──────┬──────┘
                               ▼
                         Verification ✓
```

The final system should therefore be viewed as a **digital-logic compiler**:

```text
Natural Language
      ↓
Boolean Representation
      ↓
Logic Analysis
      ↓
Optimization
      ↓
Circuit Generation
      ↓
Simulation / Verification
```

That is the central architecture around which the entire project should be developed.
