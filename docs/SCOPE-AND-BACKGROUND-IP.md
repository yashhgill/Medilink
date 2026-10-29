# MediLink and Pulih: assessed scope and background IP

Author: Yashpreet Singh Gill (B032410981)
Date: 29 October 2026

## 1. Two products

**MediLink** is my Final Year Project (PSM) at Universiti Teknikal Malaysia
Melaka. This repository branch, `medilink-fyp`, is the edition submitted for
assessment.

**Pulih** is my separate commercial product for clinics, offered under my
business name HarNova. It is built on the same core and adds components
that are not part of the FYP and are not submitted for assessment.

## 2. What is assessed (MediLink)

- Local-first clinic node: FastAPI on SQLite, every write committed locally first
- Write-behind sync queue to a shared PostgreSQL cloud node, with the PSM 2 outage fix
- Offline Manchester Triage engine (Malay and English)
- Kiosk, reception, doctor, pharmacy, patient web portal, waiting-room board
- Identifier encryption with a keyed blind index; consent-governed cross-clinic sharing
- Clinic isolation on the cloud node by forced row-level security (migrations 000 to 003)
- Tests: route audit, triage safety, end-to-end journey, isolation, reliability E1 to E3

## 3. What is not assessed (Pulih only)

| Component | Where it lives |
|---|---|
| Desktop installer builds for Windows, macOS and Linux, and the release workflow | Pulih repository |
| Patient mobile app for Android and iPhone | Pulih repository |
| Per-clinic cloud logins, cloud keys and key issuing (migrations 004 and 005) | Pulih repository |
| Product website, trial licence, trial agreement, privacy notice | Pulih repository and IP folder |

These components were written by me in October 2026, during my final
semester, as part of the commercial product. They are kept out of the FYP
submission by choice of scope. This document does not claim they were
written before or after any particular academic date beyond what the
records below show.

## 4. Timeline from dated records

| Date | Record | What it shows |
|---|---|---|
| 21 May 2026 | GitHub repository `yashhgill/medirecord-fyp`, first commits | Front-end prototype of the clinic system (kiosk patient journey, hybrid-cloud demo), created before PSM 1 began |
| July 2026 | PSM 1 begins [confirm the registration date] | Start of the assessed project |
| 6 Aug 2026 | First commit in `yashhgill/Medilink` | Working system: 3,624-line server, 90 API routes, 12 interface pages, sync queue, Docker deployment |
| 6 Aug 2026 | Hari Inovasi Kebangsaan @ Melaka 2026 | Second place |
| 8 to 9 Aug 2026 | GitHub repository `yashhgill/harnovacare-web` | Commercial website for the product (then HarnovaCare), with checkout and gated downloads |
| 22 to 29 Oct 2026 | Commits in `yashhgill/Medilink` | Pulih commercial components listed in Section 3; rename to Pulih |
| 29 Oct 2026 | Branch `medilink-fyp` | This assessed edition |

Note: much of the code in `yashhgill/Medilink` arrived in a single commit on
22 October 2026, so the repository history alone does not date every part.
The 6 August snapshot is the reliable record of what existed then.

## 5. Ownership

I assert authorship and copyright of MediLink and Pulih. Ownership between
a student and the university is decided by UTeM's intellectual property
policy, which turns on matters such as university funding, resources and
any agreement signed, not by this document. I have written to UTeM asking
for written confirmation that it does not claim ownership of this work
(letter in the IP folder). Until that reply, this document records my
position and the dated evidence; it does not replace UTeM's decision.
