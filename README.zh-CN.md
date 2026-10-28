# Electrodoctor（电子医生）

[English](README.md) | [Русский](README.ru.md) | **简体中文**

**▶ [在线演示](https://andre4561.github.io/electrodoctor/demo.html)** — 输入化验值和主诉，即可查看各诊断的概率以及每项指标的贡献。计算在浏览器中完成，数据不会发送到任何地方。

一个开源的鉴别诊断计算器：输入化验结果、主诉和体格检查结果，输出 3–4 个可能的诊断及其概率。

核心部分不使用神经网络。每一步都是明确的公式，对于每个诊断，都可以看到每项检查结果使其概率增加或减少了多少。

> ⚠️ 本项目为研究项目，不是医疗器械，不可用于自我诊断，也不可作为治疗决策的依据。本仓库中的所有系数仅为示例数值。详见 [DISCLAIMER.md](DISCLAIMER.md)。

> 🌐 `docs/` 中的详细文档和参考数据中的名称目前为俄语。欢迎贡献翻译。

## 工作原理

1. **患者数据表。** 所有信息都转换为"代码—数值—日期"的行：化验结果、主诉、体格检查、生命体征。
2. **标准化。** 对每项结果计算带符号的偏离值 `d = ln(x / x0)`、偏离强度，以及危急程度 `k`（对数比值的抛物线）。
3. **危险信号。** `k ≥ 1` 的结果被标记为紧急。
4. **贡献值。** 对参考表中的每一对"诊断—检查项"：按预期方向偏离贡献 `+权重 × 强度`，反方向偏离贡献 `−权重 × 强度`，结果正常则计入惩罚值，缺少该项则贡献 0，并作为"建议补充检查"的提示。
5. **概率。** `得分 = logit(先验概率) + Σ 贡献值`，`P = 1 / (1 + e^−得分)`。输出高于阈值的诊断。

主诉和体格检查使用同一张表：有/无类的表现记为 1/0（"未询问"与"不存在"分开记录），分级表现使用经过验证的量表（疼痛 0–10 分、水肿 0–3+），而疼痛性质等每个类别都作为单独的有/无参数。

详细说明（俄语）：[docs/concept.md](docs/concept.md)。数据格式：[docs/data-format.md](docs/data-format.md)。

## 快速开始

只需 Python 3.9+，无需任何外部库。

```bash
python engine/electrodoctor.py examples/patient_anemia.csv
```

示例的预期输出：

```
Красные флаги: FERRITIN (k=1.04)
D50  Железодефицитная анемия       92.5%  выдать
I20  Стенокардия                    2.0%   не хватает параметров: 5
D51  B12-дефицитная анемия          2.0%
```

（危险信号：铁蛋白。缺铁性贫血 92.5% — 输出；心绞痛 2.0% — 缺少 5 项参数；维生素 B12 缺乏性贫血 2.0%。）

第二个示例为胸痛（`examples/patient_chest_pain.csv`），心绞痛的概率为 95.7%。

运行测试：

```bash
python -m unittest discover tests
```

## 仓库结构

```
electrodoctor/
├── README.md              英文说明
├── README.ru.md           俄文说明
├── README.zh-CN.md        本文件（简体中文）
├── DISCLAIMER.md          局限性与警告
├── CONTRIBUTING.md        如何提交权重、诊断和代码
├── LICENSE                GNU AGPL v3（代码）
├── LICENSE-DATA           CC BY-SA 4.0（数据和文档）
├── LICENSE.md             各部分的许可说明
├── docs/
│   ├── concept.md         思路与数学原理
│   ├── data-format.md     所有数据表的格式
│   ├── roadmap.md         后续计划
│   └── articles/          俄文文章（Markdown，可用 Obsidian 阅读）
│       ├── diagnoses/     诊断
│       ├── lab-tests/     化验项目
│       ├── supplements/   膳食补充剂
│       ├── peptides/      肽类
│       ├── probiotics/    益生菌
│       ├── drugs/         药物
│       ├── general/       综合文章
│       ├── therapy/       疗法
│       ├── practices/     理念与练习
│       └── education/     科普主题
├── data/                  参考表（开放数据）
│   ├── parameters.csv     检查项：化验、主诉、体格检查
│   ├── diagnoses.csv      诊断及先验概率
│   ├── links.csv          诊断—检查项权重
│   └── directions.csv     专科方向（"应该看哪个科"）
├── engine/
│   └── electrodoctor.py   参考实现
├── examples/              虚构的示例患者
└── tests/                 计算结果的测试
```

## 如何参与

本项目最有价值的部分不是代码，而是权重表。如果您是医生、医学生或研究人员，您可以：

- 为某一对"诊断—检查项"提出权重，并注明来源；
- 添加您所在专科的诊断；
- 指出逻辑或示例中的错误；
- 推荐可用于校准的开放数据集。

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。待解决的问题列于 [docs/roadmap.md](docs/roadmap.md)。欢迎使用中文、英文或俄文提交 issue 和 pull request。

## 许可证

代码采用 [GNU AGPL v3](LICENSE)，数据和文档采用 [CC BY-SA 4.0](LICENSE-DATA)。详见 [LICENSE.md](LICENSE.md)。
