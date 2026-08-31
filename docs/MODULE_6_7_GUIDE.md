# Modules 6 & 7 — How They Work and How to Use Them

A plain‑language guide to the two machine‑learning modules of QAIbridge:
**Module 6 – Neural Angle Optimizer** and **Module 7 – QNN Converter**.

For *running* the project, see the [main README](../README.md). This document is
about *understanding* it.

---

## 0. The 30‑second version

Both modules are about the same tiny problem: a **variational quantum circuit**
(a small quantum circuit with adjustable knobs) learning to classify a toy
dataset of 12 points.

- **Module 6** asks: *"What's the best way to turn the knobs?"*
  It compares plain gradient descent on the knobs against using a small neural
  network to set them — and shows why the naive way breaks down as the circuit
  grows (the **barren plateau**).

- **Module 7** asks: *"Can I take a classical neural network and rebuild it as a
  quantum circuit?"*
  You describe a classical MLP, it generates the equivalent quantum circuit,
  then trains both so you can compare.

They share code: Module 7 reuses Module 6's quantum simulator, gradient engine,
and neural network.

---

## 1. Concepts you need (once)

### Qubit, and "rotation angles"
A qubit's state can be pictured as an arrow on a sphere (the *Bloch sphere*).
A **rotation gate** turns that arrow by some angle:

- `RX(x)` — rotate by angle `x` around the X axis
- `RY(θ)` — rotate by angle `θ` around the Y axis
- `RZ(φ)` — rotate by angle `φ` around the Z axis

Those angles are just numbers. In these modules the **trainable parameters are
rotation angles** — turning the "knobs" means changing `θ` and `φ`.

### Angle encoding (getting data *into* the circuit)
To feed a classical number into the circuit, we use it as a rotation angle:
feature `x₀` becomes `RX(x₀)` on qubit 0, feature `x₁` becomes `RX(x₁)` on
qubit 1. The dataset features are pre‑scaled into `[0, π]` so they're valid
angles. → `backend/app/modules/module6_optimizer/dataset.py`

### Variational block (the trainable part)
For each "layer" the circuit does:

```
RY(θ) and RZ(φ) on every qubit      ← the trainable rotations (the knobs)
CNOT chain across neighbouring qubits ← entanglement (mixes information between qubits)
```

Stack a few of these and you have a **variational circuit**. More layers /
qubits = more knobs = more expressive, but harder to train.

### Readout (getting an answer *out*)
Measure the expectation value `⟨Z⟩` of qubit 0 — a number in `[-1, 1]`. Map it
to a probability with `(⟨Z⟩ + 1) / 2`. Above 0.5 → class 1, below → class 0.
This is the quantum version of "output neuron + sigmoid".

### Parameter‑shift rule (how we get gradients)
To do gradient descent we need `d(loss)/d(angle)`. For these rotation gates
there's an **exact** formula — not a numerical approximation:

```
d⟨Z⟩/dθ = ( ⟨Z⟩(θ + π/2) − ⟨Z⟩(θ − π/2) ) / 2
```

i.e. run the circuit twice (once with the angle nudged up by π/2, once down) and
subtract. This is the same technique real quantum hardware uses. It's also why
training is slow‑ish: every angle needs two extra circuit runs per data point.
→ `backend/app/modules/module6_optimizer/quantum_layer.py`

### Barren plateau (the core problem Module 6 is about)
As a random variational circuit gets bigger (more qubits/layers), the gradient
of the loss shrinks **exponentially** — it becomes almost flat almost
everywhere. Gradient descent then has nothing to follow and training stalls.
This is a real, published phenomenon (McClean et al., 2018).

**Mitigation used here:** *small‑angle / identity‑block initialisation* (Grant
et al., 2019) — start every rotation angle near zero. A near‑identity circuit
has a well‑behaved cost landscape around it, so gradients survive at the start
of training.

### Hypernetwork (Module 6's "Neural Angle Optimizer")
Instead of optimising the angles directly, we use a small neural network
(`AngleNet`) whose **output vector *is* the list of angles**. We train the
network's weights with Adam; it emits the angles. Its final layer is
initialised near zero, so it naturally starts in the safe small‑angle regime.
→ `backend/app/modules/module6_optimizer/angle_net.py`

---

## 2. Module 6 — Neural Angle Optimizer

### What it demonstrates
Two ways to train the same quantum classifier, head to head:

| | Method A — Classical baseline | Method B — Neural Angle Optimizer |
|---|---|---|
| What's optimised | the raw angle numbers | the weights of `AngleNet` |
| Optimiser | plain SGD | Adam |
| Start point | uniformly random angles `[0, 2π]` | near‑zero (small‑angle) |
| Expected behaviour | can hit a barren plateau and stall | keeps gradients alive, converges faster |

Plus a **live barren‑plateau monitor** that watches Method A's real gradient
each step and, if it detects a plateau (gradient small **and** flat for several
steps in a row), reinitialises the stuck angles to recover — and marks it on
the chart.

### Data flow

```
toy dataset (12 points)
      │
      ▼
train_classical_baseline() ──┐        train_neural_optimizer() ──┐
  raw angles + SGD           │          AngleNet + Adam          │
  + live BarrenPlateauMonitor│          + live monitor           │
      │                      │              │                    │
      ▼                      │              ▼                    │
  loss curve, grad-norm curve│          loss curve, grad-norm    │
                             ▼                                   ▼
                    measure_barren_plateau()  ── separate study: gradient
                    variance vs qubit count, random vs small-angle init
                             │
                             ▼
                     OptimizationReport  ──►  JSON  ──►  charts
```

### Files

| File | Role |
|---|---|
| `dataset.py` | The shared 12‑point XOR‑like toy dataset (also used by Module 7). |
| `quantum_layer.py` | The circuit itself + forward pass (`predict_z`, `predict_proba`), BCE loss, and the parameter‑shift gradient wired into PyTorch autograd (`QuantumClassifierLoss`). |
| `angle_net.py` | `AngleNet` — the small hypernetwork whose output is the angle vector, small‑angle‑initialised. |
| `barren_monitor.py` | `BarrenPlateauMonitor` — live, per‑step plateau detection (small **and** flat gradient) and the "reinitialise" mitigation trigger. |
| `trainer.py` | Orchestrates both training methods + the ex‑post variance study, returns one `OptimizationReport`. |
| `../../routers/optimizer.py` | HTTP API. |

### API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/module6/status` | — | module health |
| POST | `/api/module6/train` | `{ n_qubits: 2–4, layers: 1–3, iterations: 10–100 }` | full `OptimizationReport` |

Example:

```bash
curl -X POST http://localhost:8000/api/module6/train \
  -H "Content-Type: application/json" \
  -d '{"n_qubits": 3, "layers": 2, "iterations": 30}'
```

### Using the page (`/module6`)

1. Set **Qubits**, **Layers**, **Training iterations** with the sliders.
   Larger = the barren plateau shows up more clearly, but the run is slower.
2. Click **Train & Compare** (real gradient descent — ~10–20 s).
3. Read the results:
   - **Accuracy cards** — final classification accuracy of each method.
   - **"Converged in N iters"** — how many steps to get loss below 0.35.
   - **Training Convergence chart** — the two loss curves. Lower/faster = better.
   - **Live Barren Plateau Monitor chart** — gradient norm per step. A red **×**
     marks where Method A stalled and was reinitialised.
   - **Barren Plateau Study chart** — a separate experiment: gradient *variance*
     vs qubit count, for random vs small‑angle init. The random curve
     collapsing toward zero as qubits increase *is* the barren plateau.

---

## 3. Module 7 — QNN Converter

### What it demonstrates
Take a **classical MLP** you describe layer‑by‑layer → map it to an equivalent
**quantum variational circuit** → train both (plus a third "warm‑started"
variant) on the same data and compare.

### The mapping rules (the important part for a viva)

| Classical | Quantum | Why |
|---|---|---|
| Each **input feature** | one **qubit**, angle‑encoded with `RX` | data goes in as rotation angles |
| Each **Dense layer** | one **variational block**: `RY(θ)+RZ(φ)` on every qubit, then a CNOT chain | the block plays the role of that layer's weights + mixing |
| **Hidden‑layer width** (units) | *nothing* — qubit count stays fixed | a circuit reuses its qubits across blocks; it doesn't add a qubit per neuron |
| **Dropout layer** | *skipped* (recorded as a warning) | it's a training‑time regulariser with no gate‑level analogue |
| **Output neuron + sigmoid** | `⟨Z⟩` of qubit 0 → `(⟨Z⟩+1)/2` | single‑probability binary readout |
| **Softmax / multi‑class** | *rejected with an explanation* | this readout is binary only |

> This is a **structural** mapping — same number of transformation *stages* —
> not a claim that the circuit computes the identical function as the MLP.

### Three things it trains

1. **Classical MLP** — the "before". (`classical_nn.py`)
2. **Mapped QNN, from scratch** — `AngleNet` + parameter‑shift, near‑identity
   start. (`qnn_trainer.train_qnn`)
3. **Mapped QNN, warm‑started** — instead of random angles, derive the starting
   angles from the *trained classical MLP's weights* (squashed through `tanh` to
   stay in a valid range), then fine‑tune. This is the actual
   classical→quantum **parameter mapping**. (`parameter_mapping.py` +
   `qnn_trainer.train_qnn_warm_started`)

Comparing curve 2 vs curve 3 answers: *did reusing the classical weights
actually help the quantum model?*

### Data flow

```
you describe layers  ─►  parse_architecture()   (Parser: validate, warn, reject)
                              │
                              ▼
                         convert_architecture()  (Mapping Engine)
                              │
              ┌───────────────┼─────────────────────────┐
              ▼               ▼                          ▼
   QNNSpec + circuit   structural comparison    train_classical_mlp()
   diagram             table                    train_qnn()
                                                train_qnn_warm_started()
                                                     │
                                                     ▼
                                          3 loss curves + 3 accuracies  ─► charts
```

### Files

| File | Role |
|---|---|
| `architecture.py` | **Parser** — validates the described network; recognises Dense/Dropout + ReLU/Tanh/Sigmoid; rejects Conv/LSTM/attention/softmax with clear messages. |
| `converter.py` | **Mapping Engine** — parsed MLP → `QNNSpec` (qubits, blocks, gate sequence, depth) + the comparison table + mapping steps. |
| `classical_nn.py` | Builds and trains the classical PyTorch MLP from the parsed spec. |
| `parameter_mapping.py` | Trained classical weights → initial quantum angles (`tanh`‑squashed). |
| `qnn_trainer.py` | Runs / trains the mapped QNN — forward‑only, from‑scratch, and warm‑started — **reusing Module 6's kernel**. |
| `../../routers/qnn.py` | HTTP API. |

### API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/module7/status` | — | module health |
| POST | `/api/module7/analyze` | `{ layers: [...] }` | parsed architecture + warnings |
| POST | `/api/module7/convert` | `{ layers: [...] }` | `ConversionReport` (QNN spec + comparison) |
| POST | `/api/module7/simulate` | `{ n_qubits, layers, angles? }` | forward‑only predictions (no training) |
| POST | `/api/module7/train-compare` | `{ layers: [...], iterations: 10–100 }` | 3 loss curves + 3 accuracies + conversion |

A `layer` is `{ "type": "dense", "units": 1–16, "activation": "relu|tanh|sigmoid" }`
or `{ "type": "dropout" }`. Input dim is fixed at 2, output at 1.

Example:

```bash
curl -X POST http://localhost:8000/api/module7/train-compare \
  -H "Content-Type: application/json" \
  -d '{"layers":[{"type":"dense","units":4,"activation":"relu"},
                 {"type":"dense","units":4,"activation":"tanh"}],
       "iterations":30}'
```

### Using the page (`/module7`)

1. **Build the architecture** — Add layer, set units/activation, or toggle a
   layer to dropout.
2. **Analyze** — validates it and shows what will/won't map (dropout skipped,
   softmax rejected, etc.).
3. **Convert to QNN** — shows the generated circuit diagram + the
   classical‑vs‑quantum comparison table.
4. **Convert & Train All** — trains all three models (~15–25 s).
5. Compare the three **accuracy cards** and the **loss chart**:
   - blue = classical MLP
   - purple = mapped QNN from scratch
   - dotted teal = mapped QNN warm‑started from classical weights

---

## 4. FAQ

**Is this real quantum computing?**
The circuits are simulated exactly on your CPU using QAIbridge's own
state‑vector kernel (`backend/app/modules/module1_kernel/`). The gates,
gradients, and measurements are the genuine mathematics — there's just no
physical QPU. Circuit sizes are kept small (2–4 qubits) so simulation is instant.

**Why is the dataset so tiny (12 points)?**
It's an XOR‑like toy problem — the smallest thing that's *not* linearly
separable, so entanglement has something to do. Keeping it tiny keeps training
interactive.

**Why does Method B sometimes not look faster?**
For very small circuits (2 qubits, 1 layer) there's no barren plateau to suffer
from, so both methods are fine. Turn the qubit/layer sliders up to see the gap
open.

**Training is slow.**
Parameter‑shift needs 2 circuit evaluations per angle per sample per step. Lower
the iterations slider, or fewer qubits/layers. ~20 s is normal at the max
settings.

**Do I need PostgreSQL / a login?**
The **module pages** in the frontend require login (so: PostgreSQL running +
Gmail OTP configured — register, verify, sign in). But the **Module 6 & 7
API endpoints themselves have no auth** — with just the backend running you can
call them from `http://localhost:8000/docs` without any database or account.
See "Two ways to reach Modules 6 & 7" in the [README](../README.md).

---

## 5. Reading list (for the report / viva)

- McClean et al. (2018), *Barren plateaus in quantum neural network training
  landscapes* — the phenomenon Module 6 studies.
- Grant et al. (2019), *An initialization strategy for addressing barren
  plateaus* — the small‑angle / identity‑block mitigation used here.
- Mitarai et al. (2018) / Schuld et al. (2019) — the parameter‑shift rule.
- Benedetti et al. (2019), *Parameterized quantum circuits as machine learning
  models* — background on variational circuits as classifiers.
