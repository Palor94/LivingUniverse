# Living Universe – indítás és helyreállítás

Ellenőrzés dátuma: 2026. október 26.

## Újraindítás után

1. Jelentkezz be Windowsba, és legyen internetkapcsolat. A Tailscale legyen csatlakoztatva.
2. Nyisd meg az asztali **Living Universe** parancsikont. Hagyd futni az alkalmazást, és ellenőrizd: http://127.0.0.1:4317 .
3. A **Living Universe Private MCP Tunnel** Windows-feladat bejelentkezéskor automatikusan elindítja a ChatGPT-kapcsolatot. Normál esetben nincs külön teendő. Indulás után hagyj neki rövid időt.
4. ChatGPT-ben használd a **Living Universe** bővítményt. Próba: „Kérdezd le a karakterlistát, legfeljebb három karakterrel.”

Az alkalmazás és az alagút technikailag egymástól függetlenül indulhat. A fenti sorrend azért praktikus, mert a mobilos szerkesztéshez és a jóváhagyáshoz az alkalmazásnak is futnia kell. Az MCP olvasó része önállóan, csak olvasásra nyitja meg a meglévő katalógust.

Az **Eszközök frissítése** nem napi indítási lépés. Akkor szükséges, ha a bővítmény eszközei változtak.

## Telefon és iPad

- A privát mobilos szerkesztőhöz a telefonon/tableten is legyen csatlakoztatva a Tailscale. Safari-cím: https://laptop.taild897f8.ts.net .
- A ChatGPT alkalmazás Living Universe bővítménye a külön OpenAI-alagutat használja. Ehhez ugyanaz a ChatGPT-fiók és az elérhető bővítmény szükséges; a telefon Tailscale-kapcsolata a privát szerkesztő/jóváhagyó oldalhoz kell.
- A laptop maradjon bekapcsolva, ébren és interneten. Kikapcsolt vagy alvó laptopot ez a megoldás nem helyettesít. A konkrét iOS-eszközös próba még szükséges.

## Ha megszakad a kapcsolat

1. Ellenőrizd a laptopon a http://127.0.0.1:4317 oldalt. Ha nem nyílik meg, indítsd az asztali Living Universe parancsikont.
2. A Feladatütemezőben keresd a **Living Universe Private MCP Tunnel** feladatot. Normál állapota futás közben **Fut / Running**. A `267009` (`0x41301`) eredménykód azt jelenti, hogy a feladat jelenleg fut.
3. Váratlan alagútleállás után a futó felügyelő körülbelül egy perc múlva újrapróbálkozik, ismételt hibánál is. A Windows-feladaton külön, legfeljebb 999 hibautáni újraindítás is be van állítva tartalékként; a kapcsolat helyreállítását a tesztelt felügyelő végzi. Tartós hitelesítési hibát a kulcs javítása old meg.
4. Szükség esetén jobb kattintás → **Futtatás**. Kézi tartalék a projekt `mcp\Start Tunnel.cmd` fájlja. A meglévő alagút mellett az indító nem hoz létre második klienst.
5. Ismételd meg a ChatGPT karakterlista-lekérdezést. A frissítési gomb vagy egy nyitott TCP-port önmagában nem bizonyít MCP-kapcsolatot.

Ha a mentett kulcs hiányzik, lejárt vagy visszavonták, az automatikus indító hibával leáll, és nem nyit rejtett jelszóablakot. Új kulcsot kizárólag az interaktív, rejtett kulcsbeviteli ablakban adj meg; ne chatben vagy parancssori argumentumban. A meglévő dokumentáció szerinti `node mcp/start-tunnel.mjs --new-key` indítja ezt a folyamatot.

Rövid helyi diagnosztika: `%LOCALAPPDATA%\LivingUniverse\mcp-runtime\startup-task.log`. A napló legfeljebb 64 KiB; kulcsszerű értékeket kitakar. Nyers HTTP- vagy katalógustartalom-naplózás nincs bekapcsolva.

## Mit javítottunk

- A 4317-es port a helyi webalkalmazás; a 4318-as port az identitásellenőrzött, korlátozott mobilos szerkesztő. **A 4318 nem a ChatGPT MCP-végpontja.**
- A Tailscale Serve kizárólag a privát hálózatban továbbít HTTPS-ről a 4318-as portra. A Funnel nincs bekapcsolva. Ezt nem kell minden Windows-induláskor újra létrehozni.
- A ChatGPT-kapcsolat a meglévő, hitelesített **Secure MCP Tunnel** szolgáltatáson és egy stdio MCP-adapteren halad. A kapcsolat hibáját a nem futó alagútkliens okozta.
- A Windows-feladat kezdetben nem látta a Codex környezetéből elérhető helyi MCP-telepítést, bár a meglévő katalógust látta. Külön jóváhagyással csak a kliens, a profil, a konfiguráció és a Windows-titkosított kulcs került át a tényleges Windows-környezetbe, ellenőrzőösszeggel és eltérő fájlok felülírása nélkül. Adatbázist nem másoltunk. Az átmeneti kulcsmásolatot töröltük.
- A feladat a saját Windows-felhasználóval, korlátozott jogosultsággal fut; nem tárol Windows-jelszót. Bejelentkezéskor indul, akkumulátoron is futhat, nincs futásidőkorlát, és váratlan klienskilépést követően újrapróbálkozik. Nem állítja át a gép alvási beállításait.
- Nem módosítottunk karakterprofilokat, kapcsolatokat, jóváhagyott referenciákat, kánont vagy adatbázissémát. Nem kapcsoltunk be nyilvános hálózati elérést.

## Mentés és visszavonás

A változtatás előtti konfigurációk és indítók mentése a javítási környezetben: `%LOCALAPPDATA%\LivingUniverse\mcp-repair-backups\20261026-213957`. A mentés ellenőrzőösszegeket is tartalmaz; titkos kulcsot és adatbázist nem tartalmaz.

A mellékelt `Living-Universe-konfiguraciomentes.zip` ugyanezeknek a konfigurációknak és indítóknak a hordozható másolata. Az aktuális Windows-feladat külön XML-fájlban is el van mentve. Ne oszd meg nyilvánosan a helyi útvonalakat és fiókazonosítókat tartalmazó konfigurációmentést.

A feladat letiltható a Feladatütemezőben. A **Leállítás** megszakítja az aktív kapcsolatot; a **Letiltás** a későbbi automatikus indulást akadályozza meg. A kézi `mcp\Start Tunnel.cmd` megmarad. Kód- vagy hitelesítési hibához ne állíts vissza régebbi adatbázist.

## Ellenőrzött eredmények

- A kezdeti pluginhívás valóban `Session terminated` hibával leállt. A meglévő privát kliens indítása után a karakterlista-lekérdezés sikerült.
- A Windows-feladatból indított kapcsolat ugyanazt az Attila-azonosítót adta vissza: `c12f1678-d524-42b0-b165-f8634ae1d618`, 51 kapcsolt médiával.
- 21:54:39-kor a kliens folyamatát szándékosan leállítottuk. A felügyelő kézi beavatkozás nélkül 21:55:40-kor új klienst indított; az ezt követő pluginos karakterlista-lekérdezés ismét sikerült. A Windows-feladat továbbra is futott.
- A célzott indító-, felügyeleti és csak olvasó adaptertesztek: **8 sikeres, 0 hibás**. Kizárólag eldobható tesztadatokat használtak.
- A ChatGPT webes **Eszközök frissítése** próbája alatt az MCP-felderítési kérések eljutottak a helyi adapterhez; a gomb a feldolgozás után ismét használható lett, látható hibaüzenet nélkül. Külön pozitív sikerüzenetet nem sikerült rögzíteni, ezért ezt nem tekintjük önmagában bizonyítéknak; a tényleges karakterlista-hívás a kapcsolati bizonyíték.
- Teljes Windows-újraindítást és fizikai telefonos próbát nem végeztünk. A bejelentkezési trigger konfigurációját, a feladatból való indítást és a klienshiba utáni automatikus helyreállást ellenőriztük.

Források: [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), valamint a projekt `docs/MCP_INTEGRATION.md` és `docs/MOBILE_ACCESS.md` dokumentumai.

## 2026-10-27: late desktop startup and hotspot recovery
The MCP adapter revalidates the existing write client on initialize, tools/list and write-tool calls. Starting the desktop app after the tunnel no longer permanently latches that adapter into read-only mode. Failed authentication or changed catalogue configuration fails closed; local trusted/review policy is preserved. Tests cover recovery and loss of authorization without touching the live catalogue. A real host-context status check confirmed the existing trusted write service is available. ChatGPT tool refresh was run; this turn's cached toolset still exposes only reads, so a fresh conversation is the remaining client-side acceptance check. No live character write was made. Network logs independently showed hotspot loss and recovery.

