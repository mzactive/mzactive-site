# Conversion staging

[Open the conversion preview](https://mzactive-conversion-staging.mzactive5.workers.dev/).

Run `sh conversion-preview/build.sh` from the repository root. The Worker serves those assets with a read-only service binding to the public provider and Pacer endpoints. No account, booking, payment or contact information from staging is written to production.

The booking forms return a test confirmation and a local checkout simulation. The pacing calculator saves its demo plan in the browser tab. Google, Apple and OTP authentication are outside this staging deployment. The mobile tools menu links to the separate activity import preview.
