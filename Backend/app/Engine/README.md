# Refactored Boolean Logic Engine

This version separates the original Boolean-logic implementation into the requested architecture.

```text
logic/
├── expressions/
│   ├── nodes.py
│   └── parser.py
├── truth_table/
│   └── generator.py
├── minimization/
│   ├── sop.py
│   ├── pos.py
│   └── quine_mccluskey.py
├── circuit/
│   ├── graph.py
│   ├── generator.py
│   └── simulator.py
└── outputs/
    ├── standard_circuits_images/
    │   ├── AND.svg
    │   ├── OR.svg
    │   ├── NAND.svg
    │   ├── NOR.svg
    │   └── NOT.svg
    ├── final_expression.py
    └── standard_circuits_diagrmas.py

logic/engine.py
main.py
```

## Requirements

Python packages used by the engine:

```text
matplotlib
numpy
Pillow
```

Install them with:

```bash
pip install -r requirements.txt
```

The diagram renderer also calls the system `magick` executable from
ImageMagick. On Fedora, install it with:

```bash
sudo dnf install ImageMagick
```

## Run

From the project root:

```bash
python main.py --expr "asd" --gates nand --fan-in 2
```

By default, the command creates `output/circuit.png` and `output/data.json`.

The gate SVG assets are included in `logic/outputs/standard_circuits_images/`, so ImageMagick can render the diagrams without requiring files from the original monolithic script.

## Architecture

- Parsing/evaluation → `logic/expressions/`
- Truth tables/K-map/canonical forms → `logic/truth_table/generator.py`
- Quine-McCluskey → `logic/minimization/quine_mccluskey.py`
- SOP/POS APIs → `logic/minimization/sop.py`, `pos.py`
- Gate DAG / netlist construction → `logic/circuit/`
- Circuit diagrams → `logic/outputs/standard_circuits_diagrmas.py`
- JSON and orchestration → `logic/engine.py`
- CLI → `main.py`

The optimized 2-input NAND construction is kept in `logic/circuit/generator.py`.
