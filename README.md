# Electrodoctor

**English** | [Русский](README.ru.md) | [简体中文](README.zh-CN.md)

**▶ [Try the live demo](https://andre4561.github.io/electrodoctor/)** — enter lab values and complaints, see the probabilities and every contribution. Runs in your browser; nothing is sent anywhere.

An open differential-diagnosis calculator: lab results, complaints and physical-exam findings go in, 3–4 likely diagnoses with probabilities come out.

There is no neural network at the core. Every step is an explicit formula, and for each diagnosis you can see how much each finding added to or subtracted from its probability.

> ⚠️ Research project. Not a medical device, not for self-diagnosis and not for treatment decisions. All coefficients in this repository are illustrative placeholders. See [DISCLAIMER.md](DISCLAIMER.md).

> 🌐 The detailed documentation in `docs/` and the reference data labels are currently in Russian. Translations are welcome.

## How it works

1. **Patient table.** Everything is reduced to rows of "code — value — date": lab results, complaints, exam findings, vital signs.
2. **Normalization.** For each finding the engine computes the signed deviation `d = ln(x / x0)`, the deviation strength, and a criticality score `k` (a parabola of the log-ratio).
3. **Red flags.** Findings with `k ≥ 1` are marked as urgent.
4. **Contributions.** For each diagnosis–finding pair in the reference: a deviation in the expected direction adds `+weight × strength`, in the opposite direction `−weight × strength`, a normal value adds a penalty, and a missing value adds 0 and becomes a "what to test next" hint.
5. **Probability.** `score = logit(prior) + Σ contributions`, `P = 1 / (1 + e^−score)`. Diagnoses above a threshold are reported.

Complaints and exam findings use the same table: yes/no findings become 1/0 (with "not asked" kept distinct from "absent"), graded findings use validated scales (pain 0–10, edema 0–3+), and each category such as the character of pain becomes its own yes/no parameter.

Details (in Russian): [docs/concept.md](docs/concept.md). Data formats: [docs/data-format.md](docs/data-format.md).

## Quick start

Python 3.9+ only, no external libraries.

```bash
python engine/electrodoctor.py examples/patient_anemia.csv
```

Expected output for the example:

```
Красные флаги: FERRITIN (k=1.04)
D50  Железодефицитная анемия       92.5%  выдать
I20  Стенокардия                    2.0%   не хватает параметров: 5
D51  B12-дефицитная анемия          2.0%
```

(Red flag: ferritin. Iron-deficiency anemia 92.5% — reported; angina 2.0% — 5 parameters missing; B12-deficiency anemia 2.0%.)

The second example, chest pain (`examples/patient_chest_pain.csv`), gives angina at 95.7%.

Tests:

```bash
python -m unittest discover tests
```

### Website and cabinet (TypeScript)

The in-browser engine, the demo page and the client cabinet are written in TypeScript (`src/`) and compiled to JavaScript in `docs/`, which GitHub Pages serves. Requires Node.js 20+.

```bash
npm install
npm run build   # src/*.ts → docs/*.js
npm test        # build, TypeScript-vs-Python parity on the examples and 500 random patients, Python tests
```

The Python version stays the reference; `tests/parity.test.js` makes sure both give the same numbers.

## Repository layout

```
electrodoctor/
├── README.md              this file (English)
├── README.ru.md           Russian version
├── README.zh-CN.md        Chinese (Simplified) version
├── DISCLAIMER.md          limitations and warnings
├── CONTRIBUTING.md        how to propose weights, diagnoses, code
├── LICENSE                GNU AGPL v3 (code)
├── LICENSE-DATA           CC BY-SA 4.0 (data and documentation)
├── LICENSE.md             what is licensed how
├── src/                   TypeScript sources
│   ├── engine.ts          engine for the browser and future apps
│   ├── demo.ts            demo page
│   └── app/               cabinet: clients and step-by-step questionnaire
├── docs/                  website (GitHub Pages); *.js are built from src/, do not edit
│   ├── concept.md         idea and math
│   ├── data-format.md     formats of all tables
│   ├── roadmap.md         what's next
│   └── articles/          articles in Russian (Markdown, Obsidian-readable)
│       ├── diagnoses/     diagnoses
│       ├── lab-tests/     lab tests
│       ├── supplements/   supplements
│       ├── peptides/      peptides
│       ├── probiotics/    probiotics
│       ├── drugs/         drugs
│       ├── general/       general articles
│       └── education/     general topics
├── data/                  reference tables (open data)
│   ├── parameters.csv     findings: labs, complaints, exam
│   ├── diagnoses.csv      diagnoses and prior frequencies
│   ├── links.csv          diagnosis–finding weights
│   └── directions.csv     specialties ("which doctor to see")
├── engine/
│   └── electrodoctor.py   reference implementation
├── examples/              fictional training patients
└── tests/                 checks of the calculation, TypeScript-vs-Python parity
```

## How you can help

The most valuable part of the project is not the code but the table of weights. If you are a physician, a medical student or a researcher, you can:

- propose weights for a diagnosis–finding pair, with a source;
- add diagnoses from your specialty;
- point out errors in the logic or examples;
- suggest open datasets for calibration.

See [CONTRIBUTING.md](CONTRIBUTING.md). Open questions are in [docs/roadmap.md](docs/roadmap.md). Issues and pull requests in English, Russian or Chinese are welcome.

## License

Code — [GNU AGPL v3](LICENSE), data and documentation — [CC BY-SA 4.0](LICENSE-DATA). Details in [LICENSE.md](LICENSE.md).
