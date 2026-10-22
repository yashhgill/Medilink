# FYP Milestone Descriptions
**Student:** Yashpreet Singh Gill A/L Nelvinder Singh (B032410981)
**Project Title:** MediLink – High-Availability Hybrid Cloud Electronic Health Records Platform for Malaysian Clinics
**Supervisor:** Ts. Mohd Nazrien Bin Zaraini
**Internal Evaluator:** Ts. Amirul Asyraf Bin Mohamad Zhahir

---

## PRJ-2: Project Progress 1
*(27 July 2026 – 31 July 2026)*

During this milestone, significant progress was made in the core backend development of MediLink. The FastAPI-based clinic server was completed with full support for multi-clinic deployment, where each clinic node runs an independent SQLite database ensuring offline-first operation. The patient registration module was implemented with MyKad IC number-based identification using AES-256 encrypted storage and blind indexing for privacy-preserving lookups. JWT-based authentication with role-based access control (Admin, Doctor, Nurse, Pharmacist, Kiosk) was established across all clinic nodes. The kiosk triage module was integrated with the GROQ AI API using the Manchester Triage System (MTS) to classify patient urgency levels (Red, Orange, Yellow, Green, Blue), with a deterministic offline fallback engine to ensure triage continues during internet outages. Initial testing of the clinic server was conducted successfully on both Klinik Melaka (port 8001) and Klinik Jasin (port 8002) running concurrently on a single machine.

---

## PRJ-3: Report Writing Progress 1
*(3 August 2026 – 7 August 2026)*

During this period, documentation work was carried out in parallel with continued system development. Chapter 1 (Introduction), Chapter 2 (Literature Review), and Chapter 3 (Methodology) of the final report were drafted and refined. The system architecture diagram was updated to reflect the hybrid cloud design — illustrating the local SQLite clinic nodes, the Patient Gateway federating across clinics, and the Supabase PostgreSQL cloud layer for cross-clinic record synchronisation. Additionally, on 6 August 2026, MediLink was presented at **Hari Inovasi Kebangsaan @ Melaka (HIKAM)** held at Multimedia University (MMU) Melaka. The project, **MediLink – High-Availability Hybrid Cloud Electronic Health Records Platform for Malaysian Clinics**, was awarded **2nd Place** under the supervision of Ts. Mohd Nazrien Bin Zaraini. The achievement validated the project's innovation in delivering a resilient, AI-assisted EHR system tailored for Malaysian primary care clinics.

---

## PRJ-4: Project Progress 2
*(10 August 2026 – 14 August 2026)*

In this milestone, the cross-clinic synchronisation layer was fully implemented using Supabase PostgreSQL as the cloud backend (`CLOUD_DATABASE_URL`). When a clinic operates in networked mode, patient records, medical records, appointments, dispense records, and payments are automatically pushed to the cloud database and pulled by the Patient Gateway (port 8000) to provide a unified view across all clinics. The Patient Gateway was developed to federate authentication — a patient registered at either clinic can activate and log in through a single public-facing URL, with the gateway querying both clinic databases and the cloud layer. The Cloudflare Tunnel integration was completed, exposing the patient portal securely to the internet via a `trycloudflare.com` quick tunnel without requiring port forwarding or a static IP. The pharmacy module with DuitNow QR payment generation and the prescription dispensing workflow were tested end-to-end across both clinic nodes.

---

## PRJ-5: Report Writing Progress 2
*(17 August 2026 – 21 August 2026)*

Documentation was continued with the completion of Chapter 4 (System Design and Implementation) and a draft of Chapter 5 (Testing and Results). The testing chapter documents unit testing of authentication, triage, medical records, and billing modules. System integration tests verified that records created at Klinik Melaka appear correctly when accessed through the Patient Gateway and the cloud-synced portal. A functional test of the AI triage module confirmed correct MTS colour classification (non-Orange fallback) following the migration from the decommissioned `llama3-70b-8192` model to the current GROQ-supported model. The demonstration run-script (`Run-Demo.command`) was finalised to automate the full system startup — including dependency checks, interface sync, clinic node launch, and patient gateway initialisation — enabling reproducible one-click deployment for the FYP demonstration.

---

## PRJ-6: Demonstration (Supervisor)
*(31 August 2026 – 4 September 2026)*

The MediLink system was demonstrated to the project supervisor, Ts. Mohd Nazrien Bin Zaraini. The demonstration covered the complete patient journey across two clinic nodes: (1) patient walk-in and kiosk registration with AI-assisted triage at Klinik Melaka, (2) doctor consultation with medical record creation, (3) pharmacy dispensing with DuitNow QR payment, and (4) the patient accessing their unified medical history through the public patient portal (via Cloudflare Tunnel) — with records from both Klinik Melaka and Klinik Jasin visible in a single view due to Supabase cloud synchronisation. The offline-resilience feature was demonstrated by simulating an internet outage — the clinic continued operating on its local SQLite database, with records syncing back to the cloud upon reconnection. The supervisor acknowledged the system's completeness and readiness for evaluator demonstration.

---

## PRJ-7: Demonstration (Evaluator)
*(31 August 2026 – 4 September 2026)*

The MediLink system was demonstrated to the internal evaluator, Ts. Amirul Asyraf Bin Mohamad Zhahir. The full end-to-end workflow was presented, beginning with the kiosk triage module where the AI classified patient urgency using the Manchester Triage System based on reported symptoms, followed by doctor login, electronic health record creation, prescription issuance, and pharmacy dispensing. The cross-clinic data synchronisation was demonstrated live — records entered at Klinik Jasin were retrieved and displayed through the patient portal at the publicly accessible Cloudflare tunnel URL, confirming seamless multi-clinic interoperability. The evaluator was shown the system architecture, highlighting the hybrid cloud design that balances data sovereignty (local SQLite per clinic), cloud sync (Supabase PostgreSQL), and public accessibility (Patient Gateway + Cloudflare Tunnel). The HIKAM 2nd Place award certificate was presented as evidence of external validation of the project's innovation.

---

## PRJ-9: Report Evaluation (Supervisor)
*(31 August 2026 – 4 September 2026)*

The final project report was submitted for evaluation by the supervisor, Ts. Mohd Nazrien Bin Zaraini. The report documents the full development lifecycle of MediLink — from problem identification (lack of resilient, affordable EHR systems for Malaysian clinics) through system design, implementation, testing, and deployment. Key contributions documented include: the hybrid cloud architecture enabling offline-first clinic operation, the AI triage engine with MTS-based classification and offline fallback, MyKad-based patient identification with encrypted IC storage, federated multi-clinic patient gateway, and DuitNow QR payment integration. The report also documents the HIKAM achievement — **2nd Place at Hari Inovasi Kebangsaan @ Melaka (HIKAM) on 6 August 2026** — as external recognition of the project's real-world applicability and innovation.

---

## PRJ-10: Report Evaluation (Evaluator)
*(31 August 2026 – 4 September 2026)*

The final project report was submitted for evaluation by the internal evaluator, Ts. Amirul Asyraf Bin Mohamad Zhahir. The report presents MediLink as a full-stack, production-grade Electronic Health Records platform addressing the operational challenges faced by small and medium Malaysian clinics. The evaluator's assessment covers the technical depth of the implementation (FastAPI, SQLite, PostgreSQL, GROQ AI, Cloudflare Tunnel, JWT authentication, AES-256 encryption), the quality of documentation across all five chapters, and the alignment of the system with the project objectives. The project's achievement of **2nd Place at Hari Inovasi Kebangsaan @ Melaka (HIKAM), held at MMU Melaka on 6 August 2026**, is cited as independent validation of the project's novelty and contribution to the Malaysian healthcare technology landscape.

---

## PRJ-8: Presentation (Evaluator)
*(1 September 2026 – 11 September 2026)*

A formal presentation of MediLink was delivered to the internal evaluator, Ts. Amirul Asyraf Bin Mohamad Zhahir. The presentation covered the project background and motivation, system architecture, key technical implementations, live demonstration highlights, testing results, and future work. The HIKAM 2nd Place award was highlighted as evidence of real-world recognition beyond the academic assessment. The presenter explained the design decisions behind the hybrid cloud approach — specifically how the system maintains full clinic functionality during internet outages while still enabling cross-clinic data sharing when connectivity is restored. Questions from the evaluator on system security (IC encryption, JWT token management, role-based access), AI triage accuracy, and scalability to additional clinic nodes were addressed. The presentation concluded with a reflection on lessons learned and the potential for MediLink to be adopted by real clinics in Malaysia as an affordable, resilient alternative to existing EHR systems.

---

*All descriptions prepared for submission into the FYP logbook/system for the period July – September 2026.*
