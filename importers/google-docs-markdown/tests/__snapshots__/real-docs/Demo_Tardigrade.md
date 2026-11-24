::::::div{.card-modern.card-wide.mb-8}
# Purpose

The purpose of this investigation was to characterize and quantify the social behaviors of tardigrades in a simulated party environment. Despite extensive research into tardigrade survival mechanisms, little attention has been given to their potential social behaviors, particularly in non-survival contexts. This study aims to fill this significant gap in our understanding of microscopic social dynamics (see [](https://dx.doi.org/10.5555/mock.20)) and (see <https://dx.doi.org/10.5555/mock.20>) and (see 10.5555/mock.20)

To hear what a tardigrade party might sound like, check out the speculative audio below:

:::::figure{align="center" type="audio"}

::::audio{src="raven-media://media-1" width="100%"}
::::

:::::

Jump to our discussion of this study’s limitations by clicking [here](#tixf5il3tya2).

:::::div{.info-box}

::::details{open="true"}

:::summary
#### This is a copy of [another doc](https://docs.google.com/document/d/fake-google-doc-01/edit) on Tardigrades

This summary will always show.
:::

And this part will be collapsed by default.

Or expanded by default with the `:open: true` attribute on the details directive.

The doc has been adapted for The Stacks. Notable deviations from the original doc are called out in boxes like this one.

The original doc contained some invalid DOI references, which have been replaced by valid ones.

::::

This is a copy of [another doc on Tardigrades](https://docs.google.com/document/d/fake-google-doc-01/edit), adapted for The Stacks. Notable deviations from the original doc are called out in boxes like this one.

The original doc contained some invalid DOI references, which have been replaced by valid ones.

:::::

::::::

# Materials and methods

## Specimen collection and preparation

Eight species of tardigrades were collected from various habitats ([Table 1](#tardi-table)) and acclimated to laboratory conditions for 72 hours prior to the experiment. Each specimen was marked with a non-toxic fluorescent nano-tag for individual tracking.

::::::figure{#tardi-table type="table" label="Table 1"}
<table class="c38"><tbody><tr class="c15"><td class="c3" colspan="1" rowspan="1"><p><strong>Species</strong></p></td><td class="c12" colspan="1" rowspan="1"><p><strong>Common name</strong></p></td><td class="c6" colspan="1" rowspan="1"><p><strong>Habitat source</strong></p></td><td class="c10" colspan="1" rowspan="1"><p><strong>Number of specimens</strong></p></td></tr><tr class="c15"><td class="c3" colspan="1" rowspan="1"><p><em>Hypsibius dujardini</em></p></td><td class="c12" colspan="1" rowspan="1"><p>Common water bear</p></td><td class="c6" colspan="1" rowspan="1"><p>Pond moss</p></td><td class="c10" colspan="1" rowspan="1"><p>8e<sup>–12</sup></p></td></tr><tr class="c15"><td class="c3" colspan="1" rowspan="1"><p><em>Echiniscus testudo</em></p></td><td class="c12" colspan="1" rowspan="1"><p>Arctic water bear</p></td><td class="c6" colspan="1" rowspan="1"><p>Glacial runoff</p></td><td class="c10" colspan="1" rowspan="1"><p>6</p></td></tr><tr class="c15"><td class="c3" colspan="1" rowspan="1"><p><em>Milnesium tardigradum</em></p></td><td class="c12" colspan="1" rowspan="1"><p>Yellow water bear</p></td><td class="c6" colspan="1" rowspan="1"><p>Roof lichen</p></td><td class="c10" colspan="1" rowspan="1"><p>7</p></td></tr><tr class="c15"><td class="c33" colspan="4" rowspan="1"><p><strong>Special species</strong></p></td></tr><tr class="c15"><td class="c3" colspan="1" rowspan="1"><p><em>Paramacrobiotus richtersi</em></p></td><td class="c12" colspan="1" rowspan="1"><p>Party water bear</p></td><td class="c6" colspan="1" rowspan="1"><p>Urban gutter</p></td><td class="c10" colspan="1" rowspan="1"><p>7</p></td></tr><tr class="c36"><td class="c3" colspan="1" rowspan="1"><p><em>Macrobiotus hufelandi</em></p></td><td class="c12" colspan="1" rowspan="1"><p>Hufelandi's bear</p></td><td class="c6" colspan="1" rowspan="1"><p>Forest moss</p></td><td class="c10" colspan="1" rowspan="1"><p>3</p></td></tr><tr class="c36"><td class="c3" colspan="1" rowspan="1"><p><em>Adorybiotus granulatus</em></p></td><td class="c12" colspan="1" rowspan="1"><p>Granulated bear</p></td><td class="c6" colspan="1" rowspan="1"><p>Desert sand</p></td><td class="c10" colspan="1" rowspan="1"><p>4</p></td></tr><tr class="c15"><td class="c3" colspan="1" rowspan="1"><p><em>Pseudechiniscus suillus</em></p></td><td class="c12" colspan="1" rowspan="1"><p>Armored bear</p></td><td class="c6" colspan="1" rowspan="1"><p>Mountain lichen</p></td><td class="c10" colspan="1" rowspan="1"><p>2</p></td></tr></tbody></table>

:::::figcaption
**Table 1.** **Species and habitat origins of experimental subjects.**
:::::

::::::

## Party environment design

A specialized micro-habitat chamber (the "Party Arena") was constructed with the following features:

1. Central dance floor (diameter: 2.5 mm)
2. Food stations featuring five different algae species
3. Micro-bubble dispensers (for simulated "refreshments")
4. Sound emitter capable of producing frequencies between 10–500 Hz
5. Multi-colored LED lighting system with programmable patterns

Sound emitter equation:

$$

\Delta S = k_B \ln \Omega + \sum_{i=1}^{n} \frac{(\vec{F}_i \times \vec{r}_i)^2}{\sqrt{2\pi\sigma^2}} \int_{-\infty}^{\infty} e^{-\frac{(x-\mu)^2}{2\sigma^2}} \, dx \cdot \nabla \times \vec{B}

$$

The Party Arena maintained optimal tardigrade conditions: 22 °C, 98% humidity, and pH 6.8. See pH calculation below:

 Test $(sin(x) + cos(y)) * (e^z / pi) + sqrt(abs(x^3 - y^2 + z^4))$ this math

## Data collection

Behaviors were recorded using a Quantum NanoVision X-450 microscope with 3D tracking capabilities. Observations occurred over a 24-hour period, with the following data recorded:

* Individual movement patterns
* Interspecies interactions
* Food station visitation frequency
* Response to sound stimuli
* Clustering patterns
* Body posture variations

We used the following code for behavior tracking:

```python
import nanoscope
import numpy as np
from tarditracker import Tracker

# Initialize microscope and tracker
scope = nanoscope.QuantumVision(model="X-450", tracking_mode="3D")
tracker = Tracker(duration_hours=24)

# Configure experiment
scope.set_environment(temperature=22.0, humidity=98.0)
scope.set_detection(fluorescence="NANO-TAG-488", threshold=0.65)

# Define regions of interest
party_regions = {
    "dance_floor": (1.25, 1.25, 0.6),  # x, y, radius
    "food_stations": [(0.4, 0.5), (2.1, 0.5), (1.25, 0.3)]
}

# Run tracking and analysis
def analyze_party():
    # Collect movement data
    scope.start_tracking()
    tracks = scope.get_data(frame_rate=12)
    
    # Extract behaviors
    behaviors = tracker.process(
        tracks, 
        metrics=["movement", "visitation", "dancing"]
    )
    
    return behaviors
```

::::::div{.info-box}
The rest of our `code` is available in this GitHub repo.

We mostly write in Python but sometimes use R. You should be able to figure it out if you look in the repo. Read more about using R in Botswana [](http://www.doi.org/10.5555/mock.19).
::::::

# Results

## Attendance patterns

Tardigrades demonstrated distinct temporal preferences for party participation, with activity peaking approximately 4.2 hours after introduction to the Party Arena ([Figure 1](#artsy)). _Paramacrobiotus richtersi_ showed the earliest and most consistent attendance, while _Echiniscus testudo_ specimens were consistently tardigrade to the party, arriving an average of 2.7 hours after the median arrival time (_p_ < 0.05). [](https://dx.doi.org/10.5555/mock.21)

::::::figure{#artsy type="img" align="center" label="Figure 1"}

:::::image{src="raven-media://media-2" width="75%"}
:::::

:::::figcaption
**Figure 1.** **Quantitative analysis of tardigrade food station preferences and subsequent behavioral effects.**

Representative tracks of individual tardigrades (n = 5) during hour 1 (pre-consumption, gray lines) vs. hour 2 (post-Spirulina consumption, colored lines), illustrating enhanced movement complexity. Error bars represent standard error of mean across all specimens.
:::::

::::::

## Social clustering

Significant non-random clustering was observed throughout the experiment. Cluster analysis via `py-mix-cluster` revealed three primary social groupings (see [Figure 4](#plotly)):

1. The "Dancing Queens" - predominantly _Paramacrobiotus richtersi_ and _Milnesium tardigradum_, remained near the dance floor
2. The "Wallflowers" - mostly _Echiniscus testudo_ and _Pseudechiniscus suillus_, maintained peripheral positions
3. The "Foodies" - led by _Hypsibius dujardini_, congregated near food stations

Interspecies mingling increased by 43% following the introduction of 50 Hz rhythmic sounds.

::::::figure{#animals align="left" type="image" label="Figure 2"}

:::::image{src="raven-media://media-3" width="50%"}
:::::

:::::figcaption
**Figure 2.** **Temporal distribution of tardigrade arrival times to the Party Arena.**

Species-specific arrival patterns shown as cumulative percentage over 24 hours. Note the statistically significant lag in E. testudo specimens (red line) compared to the party-oriented P. richtersi (blue line), which demonstrates clear "early arriver" behavior (p < 0.05). Shaded area represents 95% confidence intervals based on Monte Carlo simulations (n = 500).
:::::

::::::

## Dance behaviors

Perhaps the most remarkable finding was the observation of synchronized leg movements among 68% of specimens during exposure to specific sound frequencies. These "dance movements" followed predictable patterns:

* **The Micro-Shuffle**: Small, alternating movements of the front limb pairs
* **The Tardigroove**: Whole-body undulating motion while anchored with rear limbs
* **The Cryptobiotic Slide**: Momentary suspension of movement followed by rapid lateral displacement
* **The Water Bear Wave**: Sequential wave-like movement passing through all eight legs (see also [Figure 1](#artsy))

_Paramacrobiotus richtersi_ demonstrated the most complex dance repertoire, with an average of 8.3 distinct movements per specimen, earning its common name "Party water bear." [](https://dx.doi.org/10.5555/mock.22)

## Refreshment preferences

::::::figure{#cartoon align="right" title="Heatmap visualization of tardigrade social clustering in the Party Arena over a 6-hour period." type="image" unnumbered="true" label}

:::::image{src="raven-media://media-4" width="45%" alt="Heatmap of specimen density where [reason for including chart]."}
:::::

:::::figcaption
**Heatmap visualization of tardigrade social clustering in the Party Arena over a 6-hour period.** Colors represent density of specimens per 0.1mm² (blue = low density, red = high density).
:::::

::::::

Food station visitation analysis showed clear preferences ([cartoon](#cartoon)), with _Chlorella vulgaris_ being the most popular refreshment choice (visited 2.4 times more frequently than any other option). Interestingly, specimens that consumed _Spirulina_ exhibited 37% more dance floor activity in the subsequent hour (_p_ < 0.01), suggesting potential stimulant properties.

## Tun formation avoidance

Notably, not a single specimen entered the cryptobiotic tun state during the party, despite several environmental fluctuations that would typically trigger this survival response. This suggests a potential social override of survival mechanisms in recreational contexts or, as we have termed it, "FOMO-biosis" (Fear Of Missing Out-biological stasis inhibition). [](https://dx.doi.org/10.5555/mock.23)

## Video example

::::::div{.info-box}
The original doc didn’t contain a video, but we’re adding one here for illustration.
::::::

::::::figure{type="video" label="Video 1"}

:::::video{src="https://example.com/mock/link-01.mp4"}
:::::

:::::figcaption
**Video 1.** This is the video caption.
:::::

::::::

## **Discussion**

Our findings represent the first documented evidence of complex social recreational behaviors in tardigrades. The observed "partigrade" behaviors challenge several long-held assumptions about microscopic socialization.

Download all our data here:

::::::figure{type="file"}

:::::file{src="https://drive.google.com/file/d/fake-drive-file-03/view?usp=drive_link" filename="tardi-data.gz"}
:::::

::::::

The above file contains all the data we collected in the field between June 2, 1934 and the time of this publication, featuring several subfolders. Additional data in our [GitHub repo](https://example.com/mock/link-02).

::::::div{.info-box}
The above text was originally part of the File building block, but The Stacks currently doesn’t support captions for file directives, so it appears as regular text here.
::::::

The clear demonstration of species-specific party preferences suggests evolutionary divergence in social behavior that may parallel the well-documented divergence in survival mechanisms. For example, the "Party water bear" (_Paramacrobiotus richtersi_) showed remarkably advanced socialization patterns despite having less extreme survival capabilities than some other species studied ([Figure 1](#artsy)).

The absence of tun formation during the party environment is particularly intriguing, as it suggests that social engagement may temporarily override self-preservation instincts. This phenomenon, which we have termed "FOMO-biosis," warrants further investigation as it may reveal previously unknown neural priorities in tardigrade behavior.

::::::div{#tixf5il3tya2}
Several limitations of this study must be acknowledged:
::::::

1. The artificial nature of the Party Arena may have influenced behavior in ways not representative of natural conditions
2. Sample sizes for some species were relatively small
3. The 24-hour observation period may not capture the full arc of tardigrade party dynamics
4. The inability to interview tardigrades about their subjective party experiences

Future research should explore seasonal variations in party preferences, potential mating behaviors linked to recreational activities, and the neurological mechanisms behind FOMO-biosis.

## **Conclusions**

This pioneering study demonstrates that tardigrades engage in complex social recreational behaviors when placed in appropriate party conditions. The observed "partigrade" behaviors suggest sophisticated social dynamics previously unrecognized in microfauna.

For an interactive version of our data, check this out ([Figure 3](#interactive)):

::::::figure{#interactive type="iframe" label="Figure 3"}

:::::iframe{src="https://example.com/mock/link-03.html" width="100%" height="650px"}
:::::

:::::figcaption
**Figure 3.** **Interactive visualization of Tardigrada social behaviors.**

Specimens maintain C6H12O6 energy levels while achieving 95% dance participation rates at hour four, demonstrating remarkable social coordination.
:::::

::::::

The species-specific nature of these behaviors implies evolutionary significance to socialization patterns and suggests that recreational activities may play an underappreciated role in tardigrade ecology. The discovery of FOMO-biosis represents a particularly significant finding that may lead to new understanding of decision-making priorities in extremophiles.

We propose that the field of micro-recreation studies demands further scientific attention and suggest that the social lives of tardigrades may be nearly as remarkable as their survival capabilities. Also look at this unrelated data from another pub that consists of an HTML file sitting in the Figures Google Drive folder for this pub:

::::::figure{#plotly align="center" type="iframe" label="Figure 4"}

:::::iframe{src="raven-media://media-5" width="95%" height="750px"}
:::::

:::::figcaption
**Figure 4.** Your caption here — **_formatting_ welcome.**
:::::

::::::

## Key takeaways

* Tardigrades exhibit complex social behaviors in party environments, termed "partigrade" behaviors
* Different species show distinct social preferences and dance styles
* _Paramacrobiotus richtersi_ demonstrates the most advanced party behaviors, validating its common name "Party water bear"
* The phenomenon of FOMO-biosis (absence of tun formation during social activities) suggests social engagement may temporarily override survival instincts
* The field of micro-recreation studies represents a promising new direction for tardigrade research

::::::div{.bordered.lead data-internal="acknowledgements"}
### Acknowledgements

Thank you to the tardigrades that signed up for this study.
::::::

::::::div{.bordered.lead data-internal="competing interests"}
### Competing interests

One of the tardigrades that participated in the party-related aspects of this study is a stakeholder in Party City.
::::::

