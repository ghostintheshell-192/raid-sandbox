---
captured: 2026-07-31
purpose: >
  Source links for the three hardware claims ADR-001's Cons section flags as
  "written from prior knowledge and not yet verified against a primary source"
  (reference/decisions/001-engine-identity-not-position.md, line 105).
  Not a verified conclusion — links + a few pulled quotes to read and judge yourself.
tracked: 2026-09-07 — the reading list for the to-verify queue of ADR-004. Covers
  ADR-001's three fake-RAID claims; the backplane, HBA and cache-protection entries
  need their own list.
---

# ADR-001 hardware claims — sources to read

Three claims, three sections below. Each has links plus short excerpts I pulled while
searching, so you have something to start from tomorrow rather than a blank search bar.
None of this is a finished verification — treat the excerpts as "worth reading in full",
not as settled.

## 1. Intel RST — where the firmware lives, who computes

**The claim (ADR-001)**: metadata plus boot-time Option ROM, OS driver computes on the
general CPU.

- [Intel® Rapid Storage Technology (Intel® RST) in Linux — Intel whitepaper, Aug 2011 (PDF)](https://www.intel.com/content/dam/www/public/us/en/documents/white-papers/rst-linux-paper.pdf)
  — primary source, straight from Intel. Worth reading in full for the metadata layout
  and the boot-vs-runtime split.
- [Arch Linux and Intel RST ("Fake RAID") — Paul Marrapese, Medium](https://medium.com/@pmarrapese/arch-linux-and-intel-rst-fake-raid-cece10b61ac3)
  — practitioner account, explicit about the CPU doing the work:
  > "the array is ultimately managed by the operating system instead of a dedicated
  > controller... The burden of processing is delegated to the host CPU."
  Also: mdadm + the Linux `md` driver manage the array post-boot; `mdmon` monitors the
  external metadata at runtime; the kernel assembles the array from initramfs at startup.
- [Intel Rapid Storage Technology — Wikipedia](https://en.wikipedia.org/wiki/Intel_Rapid_Storage_Technology)
  — background/history: IMSM (Intel Matrix Storage Manager) → RST is a rename, same
  underlying tech since ~2010. Says RST places an identical metadata chunk near the end
  of each member drive.
- [Firmware/driver-based RAID — Wikipedia RAID article](https://en.wikipedia.org/wiki/RAID)
  (the "fake RAID" / hardware-assisted RAID section) — general-category framing, not
  Intel-specific, but ties the pattern together:
  > "During early bootup, the RAID is implemented by the firmware... Once the operating
  > system has been more completely loaded, the drivers take over control." Also names it
  > "hardware-assisted software RAID" / "hybrid model".

## 2. JMicron / ASMedia — are they the same category as Intel RST?

**The claim (ADR-001)**: JMicron/ASMedia add-in cards are metadata-plus-Option-ROM, same
pattern as Intel RST, just cheaper silicon.

- [dmraid readme — Heinz Mauelshagen (via people.redhat.com)](https://people.redhat.com/heinzm/sw/dmraid/readme)
  — dmraid is the classic Linux tool for exactly this category of controller ("ATARAID").
  Its supported-format list puts Intel and JMicron side by side with several others:
  Adaptec HostRAID ASR, Highpoint HPT37X/45X, **Intel Software RAID**, **JMicron JMB36x**,
  LSI MegaRAID, NVidia NForce, Promise FastTrack, Silicon Image Medley, SNIA DDF1, VIA
  Software RAID. The tool treating them all through one driver model (metadata discovery
  + device-mapper assembly, no vendor-specific compute path) is itself evidence they're
  the same category — worth confirming by reading how dmraid's architecture section
  describes what it does with the metadata versus what the kernel does.
- [JMicron JMB363 Add-on Card AHCI mode — blog.stuffedcow.net](https://blog.stuffedcow.net/2012/08/jmicron-jmb36x-add-on-card-ahci-mode/)
  — a specific, well-documented JMB36x card: same chip switches between plain AHCI mode
  and "RAID mode" via Option ROM/firmware config, consistent with the metadata-only
  framing (if it can also just be AHCI, the chip itself isn't doing RAID math).
- [JMicron official site](https://www.jmicron.com/) — for a primary vendor datasheet if
  one is publicly listed; I did not find a direct spec sheet in the search, worth
  checking their product pages directly.
- I did not find an ASMedia-specific primary source as clean as the JMicron one — worth
  a separate, narrower search if this matters for the ADR wording (ASMedia mostly showed
  up in USB/SATA controller firmware-modding forums, not RAID-specific documentation).

## 3. AMD Ryzen — is the fake-RAID firmware really on the same die as the CPU?

**The claim (ADR-001)**: "on SoC-integrated controllers (AMD Ryzen SATA), the fake-RAID
firmware and the CPU live on the same die."

This one turned out **more nuanced** than a flat yes/no — worth your own read before
deciding how ADR-001 should phrase it.

- [AMD-RAIDXpert2 User Guide (PDF)](https://drivers.amd.com/relnotes/amd-raidxpert2_user_guide_3.12.pdf)
  — the primary AMD document for the RAID utility itself; I could not extract readable
  text from it automatically (image-heavy PDF), so this needs a human read, not a search
  summary.
- [AMD X570 Unofficial Platform Diagram Revealed — TechPowerUp](https://www.techpowerup.com/255729/amd-x570-unofficial-platform-diagram-revealed-chipset-puts-out-pcie-gen-4)
  and [AMD X570 Puts Out Up To Twelve SATA 6G Ports — TechPowerUp](https://www.techpowerup.com/256480/amd-x570-puts-out-up-to-twelve-sata-6g-ports-and-sixteen-pcie-gen-4-lanes)
  — platform diagrams showing where SATA ports actually originate.
- What the search surfaced, worth checking against the primary sources above rather than
  taking as settled: **AMD's FCH (Fusion Controller Hub, the southbridge-equivalent that
  owns SATA) has been integrated onto the same die as the CPU since the Carrizo/AM4
  generation** — so *some* Ryzen SATA ports genuinely are same-die as the CPU, matching
  the ADR's claim. But higher-end chipsets like **X570 are a separate IO die**, licensed
  from/co-designed with ASMedia (codenamed Bixby) — those SATA ports come from a
  *different* die than the CPU. A concrete example cited: on some platforms, "the
  processor's integrated southbridge puts out two SATA 6 Gbps ports... additional SATA
  ports come from the separate chipset."
  — If accurate, this means the ADR's claim is **true for some Ryzen SATA ports and
  false for others**, depending on which physical port a disk is in — not a platform-wide
  fact. Worth verifying directly against AMD's own chipset documentation before deciding
  how (or whether) to soften the ADR's wording.

## Notes for tomorrow

- Claim 1 (Intel RST) looks solidly confirmed by the Medium piece + Intel's own
  whitepaper — the CPU-computes / firmware-owns-metadata split is stated plainly.
- Claim 2 (JMicron/ASMedia) is well-supported for JMicron via dmraid's format list;
  ASMedia needs its own pass.
- Claim 3 (Ryzen SoC integration) is the one where the search results complicate the
  ADR's current wording rather than confirm it outright — this is probably the one worth
  reading most carefully before touching the ADR text.
