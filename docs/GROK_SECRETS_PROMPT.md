# Grok – titkok a szerepkártyára (2026-11-22)

Mire jó: a Szellemprofil „Titkok (csak ő tudja)” mezőjét a Grok tölti ki új tartalommal, a
szereplő meglévő profiljából kiindulva. A titkok a szereplő viselkedését alakítják, és a heti
rutinba is bekerülhetnek titkos (🤫) vagy csak a közelieknek szóló (🔒) szokásként – ott Palor
rajtakaphatja őket.

A Grok csak **javaslatot** ír (`propose_ghost_profile`); semmi nem él, amíg a Szellemprofil fülön
jóvá nem hagyod. A meglévő titkokat nem írja felül, hanem kiegészíti.

Előtte: a program fusson (vezérlő [2]), a Grokban frissítsd a Living Universe csatlakozót, és a
privát profilmezők olvasása legyen engedélyezve (különben a `get_ghost_profile` nem adja ki a
szexualitás- és intimitásmezőket: ADMIN_NOTES_DISABLED). Ha a válasz megszakad, írd: „tovább”.

## Ezt másold be egy új Grok-csevegésbe

```text
Egy magyar nyelvű, felnőtteknek szóló élő szerepjáték (Living Universe) szereplőinek írsz titkokat. Minden szereplő felnőtt férfi. A titkokat a Living Universe csatlakozón keresztül javaslatként mented; a tulajdonos hagyja jóvá őket.

MENET
1. list_characters (lapozva, limit 50) → minden szereplő. Palort hagyd ki: őt a játékos viszi.
2. Szereplőnként: get_ghost_profile {character_id, include_admin_notes:true}. Olvasd el mindet, különösen: identity, personality, occupation, residence, weekly_routine, habits, goals, conflicts, fears, coping, emotional_traits, sexuality, intimacy, attraction, presented_sexuality, orientation, a sexual_* mezők, relationship_speech és a meglévő secrets.
3. Írj neki 3–5 titkot (lásd lent), és mentsd: propose_ghost_profile {character_id, expected_version: a profil version-je, template_version: a template version-je, profile_version: a kapott profile_version, model: "grok", values: {"secrets": {"value": "<a titkok>", "interpretation": "Grok javaslata a meglévő profilból (2026-11-22).", "kind": "hypothesis", "source": "Grok – titkok javaslat", "visibility": "creator"}}}.
   Ha már van secrets érték: a régi szöveg maradjon elöl változatlanul, az újak utána jönnek.
   Ha a mentés verzióhiba miatt elutasul, kérd le újra a profilt, és küldd újra.
4. Ne állj meg kérdezni. Szereplőnként egy rövid magyar sor: név, hány titok, mentve-e. A végén rövid összegzés.

MILYEN LEGYEN EGY TITOK
- A profilból nőjön ki: abból, amit a szexualitásáról, vágyairól, félelmeiről, konfliktusairól, a mások felé mutatott és a valódi énje közti különbségről tudunk. Ami ellentmond a profilnak, nem jó.
- Konkrét és élő: mit csinál, mit rejt, ki elől, és miért tartja titokban (szégyen, félelem, a munkája, a családja, a hírneve). 1–3 mondat titkonként.
- Vegyes legyen: legalább egy szexuális vagy intim titok (rejtett vágy, kaland, viszony, amit a mások felé mutatott önképe eltakar), és legalább egy más jellegű (érzelmi, pénzügyi, családi, munkahelyi, szégyellt szokás, egy hazugság).
- Legalább egy titok legyen helyhez és időhöz kötött szokás, amin rajta lehet kapni: „csütörtök esténként a … jár, mert …”. Csak olyan helyet nevezz meg, ami a profiljában vagy a lakóhelye környékén szerepel; ha nincs ilyen, írd általánosan („egy városi szaunába”).
- A szereplők közti titkok (viszony, adósság, hazugság egy másik szereplőnek) jók, ha a két profil alátámasztja; másik szereplőt csak a nevén nevezz meg, ha létezik.
- Új rokont, új életrajzi korszakot, új nevet ne találj ki. Kitalált mellékszereplő legyen névtelen („egy nős kolléga”, „egy fiatalabb férfi az edzőteremből”).
- Mindenki felnőtt; minden szexuális helyzet felnőttek között, beleegyezéssel. Erőszak, kiskorú, állat: soha.
- Ne magyarázd, ne moralizálj: úgy írd, ahogy a szereplő maga tudja magáról, harmadik személyben.

FORMÁTUM A value-ban
Titkonként egy sor, „- ” kezdettel. Példa a formára (nem tartalomra):
- Csütörtök esténként a belvárosi szaunába jár, mert ott névtelen férfiakkal ismerkedhet; a felesége azt hiszi, edzésen van.
- Két hónapja nem fizeti a lakás hitelét, és senkinek nem meri bevallani.
- Titokban irigyli a bátyja sikerét, és ezért szokott vele gorombán beszélni.
```

## Utána

- Szellemprofil fül: szereplőnként jóváhagyod, javítod vagy elveted a javaslatot.
- A jóváhagyott titkokból Claude tölti ki a heti rutint (hely + mit csinál + ki tudhat róla); a
  rutin is csak javaslat, a Világmotor › Heti rutin fülön fogadod el.
