# Dokumentacja / Documentation

## Po polsku

| Dokument | O czym |
| --- | --- |
| [architektura.md](architektura.md) | kontenery, przepływ danych, podpisy, zegar, scalanie zmian |
| [model-danych.md](model-danych.md) | kolekcje, pola rekordu, role, reguły dostępu, retencja |
| [api.md](api.md) | `/api/*`, `/sync/v1/*`, `/tiles`, uwierzytelnianie, kody odpowiedzi |
| [eksploatacja.md](eksploatacja.md) | uruchomienie, zmienne, HTTPS, kafelki, kopie, awarie |
| [mesh.md](mesh.md) | sieć węzłów bez centrali: zaufanie, katalog, relay |
| [opsec.md](opsec.md) | czego nie mapujemy, geometria publiczna, dane osobowe |
| [sprzet.md](sprzet.md) | sprzęt węzła, zasilanie, zegar RTC, klucze |
| [ui-oc.md](ui-oc.md) | warstwa graficzna: paleta, ikony kategorii, glify |
| [p2.md](p2.md) | zakres świadomie odłożony na później |

## In English

| Document | About |
| --- | --- |
| [en/architecture.md](en/architecture.md) | containers, data flow, signatures, clock, merge |
| [en/data-model.md](en/data-model.md) | collections, record fields, roles, access rules, retention |
| [en/api.md](en/api.md) | `/api/*`, `/sync/v1/*`, `/tiles`, authentication, response codes |
| [en/operations.md](en/operations.md) | deployment, variables, HTTPS, tiles, backups, troubleshooting |
| [en/mesh.md](en/mesh.md) | node network without a hub: trust, directory, relay |

Security, hardware, map styling and the deferred scope are Polish-only, because they are written for
the people who physically run a node. The English set covers what an integrator or reviewer needs.

## Od czego zacząć / Where to start

- Uruchamiasz węzeł: [eksploatacja.md](eksploatacja.md) → [sprzet.md](sprzet.md).
- Piszesz kod: [architektura.md](architektura.md) → [model-danych.md](model-danych.md) → [api.md](api.md).
- Łączysz gminy: [mesh.md](mesh.md).
- Decydujesz, co wolno pokazać: [opsec.md](opsec.md).

Deploying a node: [en/operations.md](en/operations.md). Writing code:
[en/architecture.md](en/architecture.md). Connecting municipalities: [en/mesh.md](en/mesh.md).
