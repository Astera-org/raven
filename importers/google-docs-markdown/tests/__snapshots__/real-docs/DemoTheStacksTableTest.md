# Simple Tables

## Default Justification

The following table shows everything with default (left) justification.

::::::figure{#simple-table-default-justification type="table" label="Table 1"}
| Header 1 | Header 2 | Header 3 | Header 4 |
| -------- | -------- | -------- | -------- |
| Row 1, 1 | Row 1, 2 | Row 1, 3 | Row 1, 4 |
| Row 2, 1 | Row 2, 2 | Row 2, 3 | Row 2, 4 |

:::::figcaption
**Table 1.** **A simple table using default justification**
:::::

::::::

## Shared justification

In this section, the headers have different alignments.

### Center

::::::figure{#header-center-justified type="table" label="Table 2"}
| Header 1 | Header 2 | Header 3 | Header 4 |
| -------- | -------- | -------- | -------- |
| Row 1, 1 | Row 1, 2 | Row 1, 3 | Row 1, 4 |
| Row 2, 1 | Row 2, 2 | Row 2, 3 | Row 2, 4 |

:::::figcaption
**Table 2.** **A simple table with the header center justified**
:::::

::::::

### Right

::::::figure{type="table"}
| Header 1 | Header 2 | Header 3 | Header 4 |
| -------- | -------- | -------- | -------- |
| Row 1, 1 | Row 1, 2 | Row 1, 3 | Row 1, 4 |
| Row 2, 1 | Row 2, 2 | Row 2, 3 | Row 2, 4 |
::::::

## Mixed justification

In this section, the headers and rows have different alignment

### Mixing Headers

::::::figure{type="table"}
| Center Header 1 | Right Header 2 | Left Header 3 |
| --------------- | -------------- | ------------- |
| Row 1, 1        | Row 1, 2       | Row 1, 3      |
| Row 2, 1        | Row 2, 2       | Row 2, 3      |
::::::

### Mixing Everything

#### Mix 1

::::::figure{type="table"}
| Center Header 1 | Right Header 2  | Left Header 3  |
| --------------- | --------------- | -------------- |
| Center Row 1, 1 | Left Row 1, 2   | Right Row 1, 3 |
| Right Row 2, 1  | Center Row 2, 2 | Right Row 2, 3 |
::::::

#### Mix 2

::::::figure{type="table"}
| Left Header 1   | Right Header 2  | Center Header 3 |
| --------------- | --------------- | --------------- |
| Center Row 1, 1 | Center Row 1, 2 | Center Row 1, 3 |
| Right Row 2, 1  | Right Row 2, 2  | Right Row 2, 3  |
| Left Row 2, 1   | Left Row 2, 2   | Left Row 2, 3   |
::::::

## Merged Columns

The fifth row of this table show span all columns.

::::::figure{#tardi-table type="table" label="Table 3"}
<table class="c29"><tbody><tr class="c13"><td class="c43" colspan="1" rowspan="1"><p><strong>Species</strong></p></td><td class="c34" colspan="1" rowspan="1"><p><strong>Common name</strong></p></td><td class="c41" colspan="1" rowspan="1"><p><strong>Habitat source</strong></p></td><td class="c32" colspan="1" rowspan="1"><p><strong>Number of specimens</strong></p></td></tr><tr class="c13"><td class="c43" colspan="1" rowspan="1"><p><em>Hypsibius dujardini</em></p></td><td class="c34" colspan="1" rowspan="1"><p>Common water bear</p></td><td class="c41" colspan="1" rowspan="1"><p>Pond moss</p></td><td class="c32" colspan="1" rowspan="1"><p>8e<sup>–12</sup></p></td></tr><tr class="c13"><td class="c43" colspan="1" rowspan="1"><p><em>Echiniscus testudo</em></p></td><td class="c34" colspan="1" rowspan="1"><p>Arctic water bear</p></td><td class="c41" colspan="1" rowspan="1"><p>Glacial runoff</p></td><td class="c32" colspan="1" rowspan="1"><p>6</p></td></tr><tr class="c13"><td class="c43" colspan="1" rowspan="1"><p><em>Milnesium tardigradum</em></p></td><td class="c34" colspan="1" rowspan="1"><p>Yellow water bear</p></td><td class="c41" colspan="1" rowspan="1"><p>Roof lichen</p></td><td class="c32" colspan="1" rowspan="1"><p>7</p></td></tr><tr class="c13"><td class="c49" colspan="4" rowspan="1"><p><strong>Special species</strong></p></td></tr><tr class="c13"><td class="c43" colspan="1" rowspan="1"><p><em>Paramacrobiotus richtersi</em></p></td><td class="c34" colspan="1" rowspan="1"><p>Party water bear</p></td><td class="c41" colspan="1" rowspan="1"><p>Urban gutter</p></td><td class="c32" colspan="1" rowspan="1"><p>7</p></td></tr><tr class="c53"><td class="c43" colspan="1" rowspan="1"><p><em>Macrobiotus hufelandi</em></p></td><td class="c34" colspan="1" rowspan="1"><p>Hufelandi's bear</p></td><td class="c41" colspan="1" rowspan="1"><p>Forest moss</p></td><td class="c32" colspan="1" rowspan="1"><p>3</p></td></tr><tr class="c53"><td class="c43" colspan="1" rowspan="1"><p><em>Adorybiotus granulatus</em></p></td><td class="c34" colspan="1" rowspan="1"><p>Granulated bear</p></td><td class="c41" colspan="1" rowspan="1"><p>Desert sand</p></td><td class="c32" colspan="1" rowspan="1"><p>4</p></td></tr><tr class="c13"><td class="c43" colspan="1" rowspan="1"><p><em>Pseudechiniscus suillus</em></p></td><td class="c34" colspan="1" rowspan="1"><p>Armored bear</p></td><td class="c41" colspan="1" rowspan="1"><p>Mountain lichen</p></td><td class="c32" colspan="1" rowspan="1"><p>2</p></td></tr></tbody></table>

:::::figcaption
**Table 3.** **Table with merged columns**
:::::

::::::

## Merged rows

The first column spans 4, 4, 1, 1, 2 rows, respectively.

::::::figure{#merged-rows-table type="table" label="Table 4"}
<table class="c29"><thead><tr class="c19"><td class="c33" colspan="1" rowspan="1"><p><strong>Challenge</strong></p></td><td class="c36" colspan="1" rowspan="1"><p><strong>Mitigation strategy</strong></p></td><td class="c17" colspan="1" rowspan="1"><p><strong>Benefits</strong></p></td><td class="c5" colspan="1" rowspan="1"><p><strong>Potential issues</strong></p></td></tr></thead><tbody><tr class="c35"><td class="c33" colspan="1" rowspan="4"><p>Fluorescence</p></td><td class="c36" colspan="1" rowspan="1"><p>Longer-wavelength excitation (785, 830, 1064&nbsp;nm)*</p></td><td class="c17" colspan="1" rowspan="1"><p>Excites away from most electronic transitions, reducing fluorescence <a href="https://doi.org/10.5555/mock.01"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Loss of Raman signal (ν<sup>4</sup>&nbsp;dependence); lower detector sensitivity in the NIR</p></td></tr><tr class="c35"><td class="c36" colspan="1" rowspan="1"><p>UV Raman<sup>†</sup></p></td><td class="c17" colspan="1" rowspan="1"><p>Excites away from most electronic transitions and adds resonance enhancement for proteins and nucleic acids <a href="https://doi.org/10.5555/mock.02"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Photodamage; specialized UV optics; narrow set of targets</p></td></tr><tr class="c35"><td class="c36" colspan="1" rowspan="1"><p>SERDS (shifted-excitation difference)<sup>†</sup></p></td><td class="c17" colspan="1" rowspan="1"><p>Differencing two closely spaced excitations removes the background, which doesn't shift with excitation <a href="https://doi.org/10.5555/mock.03"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Two sequential acquisitions; sensitive to motion or bleaching between frames</p></td></tr><tr class="c35"><td class="c36" colspan="1" rowspan="1"><p>Time-gated Raman<sup>†</sup></p></td><td class="c17" colspan="1" rowspan="1"><p>Fast gate collects fast Raman and rejects nanosecond-lifetime fluorescence <a href="https://doi.org/10.5555/mock.04"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Needs costly specialized pulsed lasers and time-resolved detectors; the short gate also rejects some of the Raman signal, so acquisitions are longer</p></td></tr><tr class="c35"><td class="c33" colspan="1" rowspan="4"><p>Weak scattering</p></td><td class="c36" colspan="1" rowspan="1"><p>SERS*, and its tip-enhanced variant (TERS)</p></td><td class="c17" colspan="1" rowspan="1"><p>Plasmonic enhancement greatly increases sensitivity, down to single molecules at best <a href="https://doi.org/10.5555/mock.05"></a>; TERS adds nanoscale spatial resolution <a href="https://doi.org/10.5555/mock.06"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Substrate and hot-spot reproducibility; quantification and assignment challenges; difficulty delivering nanostructures to the target <a href="https://doi.org/10.5555/mock.07"></a></p></td></tr><tr class="c35"><td class="c36" colspan="1" rowspan="1"><p>Resonance Raman*</p></td><td class="c17" colspan="1" rowspan="1"><p>Exciting into an electronic absorption strongly enhances specific chromophores such as carotenoids <a href="http://doi.org/10.5555/mock.08"></a>&nbsp;and hemes&nbsp;<a href="https://doi.org/10.5555/mock.09"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Only resonant species are enhanced; needs matched excitation; can drive bleaching and excite fluorescence</p></td></tr><tr class="c35"><td class="c36" colspan="1" rowspan="1"><p>Coherent Raman (CARS, SRS)*</p></td><td class="c17" colspan="1" rowspan="1"><p>Coherent driving amplifies signal by orders of magnitude over spontaneous Raman, enabling fast, label-free imaging <a href="https://doi.org/10.5555/mock.10"></a>&nbsp;<a href="https://doi.org/10.5555/mock.11"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Non-resonant background (CARS) <a href="https://doi.org/10.5555/mock.12"></a>; few commercial systems, so often homebuilt and finicky to align temporally and spatially; high peak power easily burns or photodamages samples</p></td></tr><tr class="c35"><td class="c36" colspan="1" rowspan="1"><p>Stimulated Raman photothermal (SRP)</p></td><td class="c17" colspan="1" rowspan="1"><p>Reads the photothermal effect of the SRS process rather than intensity loss, boosting modulation depth significantly <a href="https://doi.org/10.5555/mock.13"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Early-stage; adds a probe beam and its detection</p></td></tr><tr class="c35"><td class="c33" colspan="1" rowspan="1"><p>Chemical complexity and band overlap</p></td><td class="c36" colspan="1" rowspan="1"><p>Silent region tags<sup>†</sup></p></td><td class="c17" colspan="1" rowspan="1"><p>Places a sharp, specific band in the silent region, which can be used to tag molecules and track metabolism <a href="https://doi.org/10.5555/mock.14"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Needs a small vibrational label, so no longer strictly label-free</p></td></tr><tr class="c19"><td class="c33" colspan="1" rowspan="1"><p>Sample alteration</p></td><td class="c36" colspan="1" rowspan="1"><p>Quantum-enhanced SRS (squeezed light)</p></td><td class="c17" colspan="1" rowspan="1"><p>Lowers the noise floor below the shot-noise limit, so the same signal-to-noise is reached at lower laser power, with less photodamage <a href="https://doi.org/10.5555/mock.15"></a>&nbsp;<a href="https://doi.org/10.5555/mock.16"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Specialized hardware, modest signal improvement, needs optimization across spectrum</p></td></tr><tr class="c54"><td class="c33" colspan="1" rowspan="2"><p>Constrained and variable measurement conditions</p></td><td class="c36" colspan="1" rowspan="1"><p>SORS (spatially offset Raman)<sup>†</sup></p></td><td class="c17" colspan="1" rowspan="1"><p>Collecting light offset from the illumination point preferentially samples layers beneath the surface (e.g., container) <a href="https://doi.org/10.5555/mock.17"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>Works on powders, tablets; less ideal for many cell preps</p></td></tr><tr class="c54"><td class="c36" colspan="1" rowspan="1"><p>Optical-tweezers Raman</p></td><td class="c17" colspan="1" rowspan="1"><p>Holds single cells/particles in physiological suspension for measurement, avoiding substrate and holder background&nbsp;<a href="http://doi.org/10.5555/mock.18"></a></p></td><td class="c5" colspan="1" rowspan="1"><p>One cell at a time; trapping setup</p></td></tr></tbody></table>

:::::figcaption
**Table 4.** **Overview of challenges with Raman spectroscopy, mitigation strategies, and their possible benefits and issues.**

* = strategies that we have implemented or explored, but would still value feedback on

<sup>†</sup> = strategies we're especially interested in trying in the near future
:::::

::::::

## Fixed-width Columns

The following table shows everything with default font.

::::::figure{type="table" label="Table 5"}
| Locus 1                                                     | Locus 2                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| ATGCGTACGTTAGCCTGAACGGTTACCGATCGTAGCTAGCTTGACCGATTGCAAGCTAG | CGTATCGGATCCGTAGCTAGGCTACGATCGATCGTAGCTAGGCATCGATCGTAGGCTAA |
| TTGCATGCGTAGCTAGCGATCGTACGGCTAGCTAGCTAGGCTACGATGCTAGCTAGCGT | GGATCGTAGCTAGCTACGATCGGTACGATCGTAGCTAGGCTAACGATCGTAGCTAGCAT |

:::::figcaption
**Table 5.** **A table using variable-width fonts**
:::::

::::::

::::::figure{type="table" label="Table 6"}
| Locus 1                                                         | Locus 2                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `ATGCGTACGTTAGCCTGAACGGTTACCGATCGTAGCTAGCTTGACCGATTGCAAGCTAG` | `CGTATCGGATCCGTAGCTAGGCTACGATCGATCGTAGCTAGGCATCGATCGTAGGCTAA` |
| `TTGCATGCGTAGCTAGCGATCGTACGGCTAGCTAGCTAGGCTACGATGCTAGCTAGCGT` | `GGATCGTAGCTAGCTACGATCGGTACGATCGTAGCTAGGCTAACGATCGTAGCTAGCAT` |

:::::figcaption
**Table 6.** **A table using fixed-width fonts**
:::::

::::::

::::::figure{type="table" label="Table 7"}
| Locus 1                                                                                                      | Locus 2                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `ATGCGTACGT`<br/>`TAGCCTGAAC`<br/>`GGTTACCGAT`<br/>`CGTAGCTAGC`<br/>`TTGACCGATT`<br/>`GCAAGCTAG` | `CGTATCGGAT`<br/>`CCGTAGCTAG`<br/>`GCTACGATCG`<br/>`ATCGTAGCTA`<br/>`GGCATCGATC`<br/>`GTAGGCTAA` |
| `TTGCATGCGT`<br/>`AGCTAGCGAT`<br/>`CGTACGGCTA`<br/>`GCTAGCTAGG`<br/>`CTACGATGCT`<br/>`AGCTAGCGT` | `GGATCGTAGC`<br/>`TAGCTACGAT`<br/>`CGGTACGATC`<br/>`GTAGCTAGGC`<br/>`TAACGATCGT`<br/>`AGCTAGCAT` |

:::::figcaption
**Table 7.** **Option 2**
:::::

::::::

::::::figure{type="table" label="Table 8"}
| Locus 1                                                                                                                                                                                                                                                                        | Locus 2                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <span class=”font-mono”>ATGCGTACGT</span><br/><span class=”font-mono”>TAGCCTGAAC</span><br/><span class=”font-mono”>GGTTACCGAT</span><br/><span class=”font-mono”>CGTAGCTAGC</span><br/><span class=”font-mono”>TTGACCGATT</span><br/><span class=”font-mono”>GCAAGCTAG</span> | <span class=”font-mono”>CGTATCGGAT</span><br/><span class=”font-mono”>CCGTAGCTAG</span><br/><span class=”font-mono”>GCTACGATCG</span><br/><span class=”font-mono”>ATCGTAGCTA</span><br/><span class=”font-mono”>GGCATCGATC</span><br/><span class=”font-mono”>GTAGGCTAA</span> |
| <span class=”font-mono”>TTGCATGCGT</span><br/><span class=”font-mono”>AGCTAGCGAT</span><br/><span class=”font-mono”>CGTACGGCTA</span><br/><span class=”font-mono”>GCTAGCTAGG</span><br/><span class=”font-mono”>CTACGATGCT</span><br/><span class=”font-mono”>AGCTAGCGT</span> | <span class=”font-mono”>GGATCGTAGC</span><br/><span class=”font-mono”>TAGCTACGAT</span><br/><span class=”font-mono”>CGGTACGATC</span><br/><span class=”font-mono”>GTAGCTAGGC</span><br/><span class=”font-mono”>TAACGATCGT</span><br/><span class=”font-mono”>AGCTAGCAT</span> |

:::::figcaption
**Table 8.** **Option 3**
:::::

::::::

