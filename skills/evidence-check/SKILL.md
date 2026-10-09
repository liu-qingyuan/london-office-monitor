---
name: evidence-check
scope: Source traceability, missingness and conflicts
---

Use alongside market-monitor when interpreting a comparison, checking an original source, or explaining uncertainty.

- Tool observation status missing/conflict has no usable single value. Never turn null into zero, fill a gap from general knowledge, average competing candidates or attach a citation that lacks the fact.
- Publisher-reported growth and Python snapshot change are different fields. If reported_growth_mismatch is returned, select its calculation ID so Python displays both figures; describe the difference qualitatively in answer/warnings and say the reason is not verified. Do not copy the amounts into model prose, speculate that revised samples/baselines definitely caused it or assert the publisher is wrong.
- Use source_details for original URL, publisher, publication date, report period and exact excerpt. Use verify_source only when asked to recheck the approved document. It is a network check of existing excerpts, not discovery of the latest report or a data refresh.
- Citation dates distinguish report period from publication and retrieval. reviewed_excerpt is offline review, not current re-verification.
- A source-check network error is not a missing market value. Report that the check could not complete. An excerpt mismatch means the snapshot needs review; don't silently update it.
- Only original links and necessary short fact excerpts are exposed. No full report or third-party figure is distributed. Map background attribution is not evidence for office rents.
